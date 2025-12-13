/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PAYOUT ORCHESTRATION - Event Listener & Bridge.xyz Wire Trigger
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This webhook handler listens for the EscrowClosed event on-chain and triggers
 * fiat wire transfers via Bridge.xyz.
 * 
 * FLOW:
 * 1. Smart contract emits EscrowClosed event with payee data
 * 2. This handler receives the event (via webhook or polling)
 * 3. Matches on-chain payee addresses to off-chain beneficiary_ids
 * 4. Triggers Bridge.xyz API to send Wire (sellers) or ACH (agents)
 * 
 * DEPLOYMENT OPTIONS:
 * - Option A: Webhook endpoint (receive from indexer like Alchemy/QuickNode)
 * - Option B: Background job that polls for events
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'https://api.bridge.xyz';
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || '';
const BRIDGE_API_SECRET = process.env.BRIDGE_API_SECRET || '';

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');
const chain = CHAIN_ID === 8453 ? base : baseSepolia;

// EscrowClosed event ABI
const ESCROW_CLOSED_EVENT = parseAbiItem(
  'event EscrowClosed(address[] payees, uint256[] amounts, uint256 totalPrincipal, uint256 totalYield, uint256 platformFee, uint256 buyerRebate)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface EscrowClosedEvent {
  payees: `0x${string}`[];
  amounts: bigint[];
  totalPrincipal: bigint;
  totalYield: bigint;
  platformFee: bigint;
  buyerRebate: bigint;
}

interface WebhookPayload {
  // Alchemy/QuickNode webhook format
  event: {
    data: {
      block: {
        logs: Array<{
          topics: string[];
          data: string;
          address: string;
          transactionHash: string;
        }>;
      };
    };
  };
}

interface BridgeTransferRequest {
  amount: string;
  currency: string;
  destination_account_id: string;
  source_account_id: string;
  memo?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRIDGE.XYZ API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getBridgeAuthHeaders(): HeadersInit {
  const credentials = Buffer.from(`${BRIDGE_API_KEY}:${BRIDGE_API_SECRET}`).toString('base64');
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
    'Api-Version': '2024-01',
  };
}

/**
 * Initiate a wire transfer via Bridge.xyz
 */
async function initiateWireTransfer(params: {
  amount: number;
  beneficiaryId: string;
  sourceAccountId: string;
  memo: string;
}): Promise<{ transferId: string; status: string }> {
  console.log(`[BRIDGE] Initiating wire transfer: ${params.amount} USD to ${params.beneficiaryId}`);
  
  const response = await fetch(`${BRIDGE_API_URL}/v0/transfers`, {
    method: 'POST',
    headers: getBridgeAuthHeaders(),
    body: JSON.stringify({
      amount: params.amount.toString(),
      currency: 'usd',
      destination_account_id: params.beneficiaryId,
      source_account_id: params.sourceAccountId,
      destination_payment_rail: 'wire',  // Wire for sellers
      memo: params.memo,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[BRIDGE] Wire transfer failed:`, error);
    throw new Error(`Bridge wire transfer failed: ${error}`);
  }

  const data = await response.json();
  console.log(`[BRIDGE] Wire transfer initiated: ${data.id}`);
  
  return {
    transferId: data.id,
    status: data.status,
  };
}

/**
 * Initiate an ACH transfer via Bridge.xyz (for agents - slower but cheaper)
 */
async function initiateACHTransfer(params: {
  amount: number;
  beneficiaryId: string;
  sourceAccountId: string;
  memo: string;
}): Promise<{ transferId: string; status: string }> {
  console.log(`[BRIDGE] Initiating ACH transfer: ${params.amount} USD to ${params.beneficiaryId}`);
  
  const response = await fetch(`${BRIDGE_API_URL}/v0/transfers`, {
    method: 'POST',
    headers: getBridgeAuthHeaders(),
    body: JSON.stringify({
      amount: params.amount.toString(),
      currency: 'usd',
      destination_account_id: params.beneficiaryId,
      source_account_id: params.sourceAccountId,
      destination_payment_rail: 'ach',  // ACH for agents (2-3 days)
      memo: params.memo,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[BRIDGE] ACH transfer failed:`, error);
    throw new Error(`Bridge ACH transfer failed: ${error}`);
  }

  const data = await response.json();
  console.log(`[BRIDGE] ACH transfer initiated: ${data.id}`);
  
  return {
    transferId: data.id,
    status: data.status,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process EscrowClosed event and trigger fiat payouts
 */
async function processEscrowClosedEvent(
  escrowId: string,
  vaultAddress: string,
  event: EscrowClosedEvent,
  txHash: string
): Promise<void> {
  console.log(`[PAYOUT] Processing EscrowClosed for escrow ${escrowId}`);
  console.log(`[PAYOUT] Payees: ${event.payees.length}, Total Principal: ${event.totalPrincipal}`);

  // Get escrow from database
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: {
      payees: true,
    },
  });

  if (!escrow) {
    throw new Error(`Escrow ${escrowId} not found in database`);
  }

  // Map on-chain payee addresses to off-chain payee records
  const payeeResults: Array<{
    payeeId: string;
    name: string;
    amount: number;
    bridgeTransferId?: string;
    status: string;
    error?: string;
  }> = [];

  for (let i = 0; i < event.payees.length; i++) {
    const onChainAddress = event.payees[i].toLowerCase();
    const amount = Number(event.amounts[i]) / 1e6; // USDC has 6 decimals

    // Find matching payee in database
    // Note: In production, you'd store the on-chain payout address with each payee
    // For now, we match by index order (assumes payees array matches DB order)
    const dbPayee = escrow.payees[i];

    if (!dbPayee) {
      console.error(`[PAYOUT] No matching payee found for index ${i}`);
      payeeResults.push({
        payeeId: `unknown-${i}`,
        name: 'Unknown',
        amount,
        status: 'FAILED',
        error: 'No matching payee in database',
      });
      continue;
    }

    if (!dbPayee.bridgeBeneficiaryId) {
      console.error(`[PAYOUT] Payee ${dbPayee.id} has no Bridge beneficiary ID`);
      payeeResults.push({
        payeeId: dbPayee.id,
        name: `${dbPayee.firstName} ${dbPayee.lastName}`,
        amount,
        status: 'FAILED',
        error: 'No Bridge beneficiary ID',
      });
      continue;
    }

    try {
      // Determine payment method based on payee type
      // Sellers get wire (same-day), Agents get ACH (2-3 days, cheaper)
      const useWire = ['SELLER', 'BUYER', 'MORTGAGE_PAYOFF', 'LIEN_HOLDER'].includes(dbPayee.payeeType);

      const transferResult = useWire
        ? await initiateWireTransfer({
            amount,
            beneficiaryId: dbPayee.bridgeBeneficiaryId,
            sourceAccountId: escrow.bridgeVirtualAccountId || '',
            memo: `Escrow ${escrow.fileNumber} - ${dbPayee.firstName} ${dbPayee.lastName}`,
          })
        : await initiateACHTransfer({
            amount,
            beneficiaryId: dbPayee.bridgeBeneficiaryId,
            sourceAccountId: escrow.bridgeVirtualAccountId || '',
            memo: `Escrow ${escrow.fileNumber} - ${dbPayee.firstName} ${dbPayee.lastName}`,
          });

      // Update payee record with Bridge transfer ID
      await prisma.payee.update({
        where: { id: dbPayee.id },
        data: {
          status: 'PROCESSING',
          bridgeTransferId: transferResult.transferId,
          paidAt: new Date(),
        },
      });

      payeeResults.push({
        payeeId: dbPayee.id,
        name: `${dbPayee.firstName} ${dbPayee.lastName}`,
        amount,
        bridgeTransferId: transferResult.transferId,
        status: 'PROCESSING',
      });

      console.log(`[PAYOUT] ✓ ${dbPayee.firstName} ${dbPayee.lastName}: $${amount} via ${useWire ? 'Wire' : 'ACH'}`);

    } catch (error: any) {
      console.error(`[PAYOUT] Failed to pay ${dbPayee.firstName} ${dbPayee.lastName}:`, error);
      
      await prisma.payee.update({
        where: { id: dbPayee.id },
        data: {
          status: 'FAILED',
        },
      });

      payeeResults.push({
        payeeId: dbPayee.id,
        name: `${dbPayee.firstName} ${dbPayee.lastName}`,
        amount,
        status: 'FAILED',
        error: error.message,
      });
    }
  }

  // Update escrow status
  await prisma.escrow.update({
    where: { id: escrowId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closingTxHash: txHash,
      yieldEarned: Number(event.totalYield) / 1e6,
      platformFee: Number(event.platformFee) / 1e6,
      buyerRebate: Number(event.buyerRebate) / 1e6,
    },
  });

  // Create audit log
  await prisma.activityLog.create({
    data: {
      escrowId,
      action: 'ESCROW_CLOSED',
      actor: 'SYSTEM',
      details: JSON.stringify({
        txHash,
        totalPrincipal: Number(event.totalPrincipal) / 1e6,
        totalYield: Number(event.totalYield) / 1e6,
        platformFee: Number(event.platformFee) / 1e6,
        buyerRebate: Number(event.buyerRebate) / 1e6,
        payouts: payeeResults,
      }),
    },
  });

  console.log(`[PAYOUT] Escrow ${escrowId} closed successfully`);
  console.log(`[PAYOUT] Results:`, payeeResults);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK HANDLER (for Alchemy/QuickNode webhooks)
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[WEBHOOK] Received blockchain event webhook');

    // Parse webhook payload (Alchemy format)
    const logs = body?.event?.data?.block?.logs || [];

    for (const log of logs) {
      // Check if this is an EscrowClosed event
      const eventSignature = log.topics[0];
      
      // EscrowClosed event signature
      const escrowClosedSig = '0x' + 'EscrowClosed(address[],uint256[],uint256,uint256,uint256,uint256)'
        .split('')
        .reduce((hash, char) => {
          // Simple hash - in production use proper keccak256
          return hash;
        }, '');

      try {
        // Decode the event
        const decoded = decodeEventLog({
          abi: [ESCROW_CLOSED_EVENT],
          data: log.data as `0x${string}`,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });

        if (decoded.eventName === 'EscrowClosed') {
          const event = decoded.args as unknown as EscrowClosedEvent;
          const vaultAddress = log.address;
          const txHash = log.transactionHash;

          // Look up escrow by vault address
          const escrow = await prisma.escrow.findFirst({
            where: { vaultAddress: vaultAddress.toLowerCase() },
          });

          if (escrow) {
            await processEscrowClosedEvent(escrow.id, vaultAddress, event, txHash);
          } else {
            console.warn(`[WEBHOOK] No escrow found for vault ${vaultAddress}`);
          }
        }
      } catch (decodeError) {
        // Not an EscrowClosed event, skip
        continue;
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANUAL TRIGGER (for testing or retry)
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const escrowId = searchParams.get('escrowId');
  const txHash = searchParams.get('txHash');

  if (!escrowId || !txHash) {
    return NextResponse.json(
      { error: 'escrowId and txHash required' },
      { status: 400 }
    );
  }

  try {
    // Fetch transaction receipt and decode event
    const client = createPublicClient({
      chain,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    });

    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    // Find EscrowClosed event in logs
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: [ESCROW_CLOSED_EVENT],
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'EscrowClosed') {
          const event = decoded.args as unknown as EscrowClosedEvent;
          await processEscrowClosedEvent(escrowId, log.address, event, txHash);
          
          return NextResponse.json({
            success: true,
            message: 'Payout processing triggered',
          });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json(
      { error: 'No EscrowClosed event found in transaction' },
      { status: 404 }
    );

  } catch (error: any) {
    console.error('[PAYOUT] Manual trigger error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
