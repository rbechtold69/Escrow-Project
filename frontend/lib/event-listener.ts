/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EVENT LISTENER SERVICE - Poll for EscrowClosed Events
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Alternative to webhooks: Poll the blockchain for EscrowClosed events.
 * 
 * USE CASE:
 * - Run as a background job (cron, Vercel cron, Railway worker, etc.)
 * - Checks for new events every N seconds
 * - Processes any missed events
 * 
 * USAGE:
 *   # Via API route
 *   GET /api/cron/process-escrow-events
 * 
 *   # Via script
 *   npx ts-node scripts/poll-events.ts
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { prisma } from '@/lib/prisma';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');
const chain = CHAIN_ID === 8453 ? base : baseSepolia;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';

// How many blocks to look back when polling
const BLOCKS_TO_SCAN = 1000;

// EscrowClosed event ABI
const ESCROW_CLOSED_ABI = parseAbiItem(
  'event EscrowClosed(address[] payees, uint256[] amounts, uint256 totalPrincipal, uint256 totalYield, uint256 platformFee, uint256 buyerRebate)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// VIEM CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

const client = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT SCANNER
// ═══════════════════════════════════════════════════════════════════════════════

interface EscrowClosedEvent {
  payees: `0x${string}`[];
  amounts: bigint[];
  totalPrincipal: bigint;
  totalYield: bigint;
  platformFee: bigint;
  buyerRebate: bigint;
}

interface ScanResult {
  scannedBlocks: number;
  eventsFound: number;
  eventsProcessed: number;
  errors: string[];
}

/**
 * Scan for EscrowClosed events in recent blocks
 */
export async function scanForEscrowClosedEvents(
  vaultAddresses: string[]
): Promise<ScanResult> {
  const result: ScanResult = {
    scannedBlocks: 0,
    eventsFound: 0,
    eventsProcessed: 0,
    errors: [],
  };

  if (vaultAddresses.length === 0) {
    console.log('[SCANNER] No vault addresses to scan');
    return result;
  }

  try {
    // Get current block
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - BigInt(BLOCKS_TO_SCAN);

    console.log(`[SCANNER] Scanning blocks ${fromBlock} to ${currentBlock}`);
    result.scannedBlocks = BLOCKS_TO_SCAN;

    // Get logs for each vault address
    for (const vaultAddress of vaultAddresses) {
      try {
        const logs = await client.getLogs({
          address: vaultAddress as `0x${string}`,
          event: ESCROW_CLOSED_ABI,
          fromBlock,
          toBlock: currentBlock,
        });

        result.eventsFound += logs.length;

        for (const log of logs) {
          try {
            // Check if we've already processed this event
            const escrow = await prisma.escrow.findFirst({
              where: {
                vaultAddress: vaultAddress.toLowerCase(),
                closingTxHash: log.transactionHash,
              },
            });

            if (escrow) {
              console.log(`[SCANNER] Event already processed: ${log.transactionHash}`);
              continue;
            }

            // Process the event
            await processEvent(vaultAddress, log);
            result.eventsProcessed++;

          } catch (error: any) {
            result.errors.push(`Failed to process event ${log.transactionHash}: ${error.message}`);
          }
        }
      } catch (error: any) {
        result.errors.push(`Failed to scan vault ${vaultAddress}: ${error.message}`);
      }
    }

  } catch (error: any) {
    result.errors.push(`Scanner error: ${error.message}`);
  }

  return result;
}

/**
 * Process a single EscrowClosed event
 */
async function processEvent(vaultAddress: string, log: any): Promise<void> {
  console.log(`[SCANNER] Processing event from vault ${vaultAddress}`);
  console.log(`[SCANNER] TX Hash: ${log.transactionHash}`);

  // Decode event args
  const args = log.args as EscrowClosedEvent;

  // Find escrow in database
  const escrow = await prisma.escrow.findFirst({
    where: { vaultAddress: vaultAddress.toLowerCase() },
    include: { payees: true },
  });

  if (!escrow) {
    throw new Error(`No escrow found for vault ${vaultAddress}`);
  }

  // Update escrow with event data
  await prisma.escrow.update({
    where: { id: escrow.id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closingTxHash: log.transactionHash,
      yieldEarned: Number(args.totalYield) / 1e6,
      platformFee: Number(args.platformFee) / 1e6,
      buyerRebate: Number(args.buyerRebate) / 1e6,
    },
  });

  // Create activity log
  await prisma.activityLog.create({
    data: {
      escrowId: escrow.id,
      action: 'ESCROW_CLOSED_DETECTED',
      actor: 'SYSTEM',
      details: JSON.stringify({
        txHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        totalPrincipal: Number(args.totalPrincipal) / 1e6,
        totalYield: Number(args.totalYield) / 1e6,
        payeeCount: args.payees.length,
      }),
    },
  });

  console.log(`[SCANNER] ✓ Escrow ${escrow.id} marked as closed`);

  // Note: In production, you would trigger the Bridge.xyz payouts here
  // by calling the same logic as the webhook handler
}

/**
 * Get all open escrows with vault addresses
 */
export async function getOpenVaultAddresses(): Promise<string[]> {
  const escrows = await prisma.escrow.findMany({
    where: {
      status: { in: ['FUNDS_RECEIVED', 'READY_TO_CLOSE', 'CLOSING'] },
      vaultAddress: { not: null },
    },
    select: { vaultAddress: true },
  });

  return escrows
    .map((e) => e.vaultAddress)
    .filter((addr): addr is string => addr !== null);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCAN FUNCTION (for cron jobs)
// ═══════════════════════════════════════════════════════════════════════════════

export async function runEventScan(): Promise<ScanResult> {
  console.log('[SCANNER] Starting event scan...');
  
  const vaultAddresses = await getOpenVaultAddresses();
  console.log(`[SCANNER] Found ${vaultAddresses.length} open vaults to scan`);
  
  const result = await scanForEscrowClosedEvents(vaultAddresses);
  
  console.log('[SCANNER] Scan complete:', result);
  return result;
}
