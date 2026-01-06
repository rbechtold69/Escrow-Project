/**
 * Bridge.xyz Webhook Handler
 * 
 * Handles incoming webhooks from Bridge:
 * - deposit.completed: Wire received, triggers USDC deposit to vault
 * - liquidation.completed: USDC converted to fiat for payouts
 * - transfer.completed/failed: Payout status updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBridgeService, handleBridgeWebhook, WebhookEvent } from '@/lib/bridge-service';
import { depositToVault, getVaultAddress } from '@/lib/contract-client';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Bridge.xyz Public Key for webhook signature verification
const BRIDGE_WEBHOOK_PUBLIC_KEY = process.env.BRIDGE_WEBHOOK_PUBLIC_KEY || '';

/**
 * Verify Bridge webhook signature using RSA public key
 * Bridge signature format: X-Webhook-Signature: t=<timestamp>,v0=<base64-encoded-signature>
 */
function verifyBridgeSignature(
  payload: string,
  signatureHeader: string | null
): { isValid: boolean; error?: string } {
  if (!signatureHeader) {
    return { isValid: false, error: 'Missing signature header' };
  }

  if (!BRIDGE_WEBHOOK_PUBLIC_KEY) {
    console.error('BRIDGE_WEBHOOK_PUBLIC_KEY not configured');
    return { isValid: false, error: 'Public key not configured' };
  }

  try {
    // Parse signature header: t=<timestamp>,v0=<signature>
    const signatureParts = signatureHeader.split(',');
    const timestamp = signatureParts.find(part => part.startsWith('t='))?.split('=')[1];
    const signature = signatureParts.find(part => part.startsWith('v0='))?.split('=')[1];

    if (!timestamp || !signature) {
      return { isValid: false, error: 'Missing timestamp or signature in header' };
    }

    // Check timestamp (reject events older than 10 minutes)
    const currentTime = Date.now();
    const eventTime = parseInt(timestamp, 10);
    if (currentTime - eventTime > 600000) {
      return { isValid: false, error: 'Timestamp too old' };
    }

    // Create signed payload
    const signedPayload = `${timestamp}.${payload}`;

    // Hash the payload with SHA256
    const hash = crypto.createHash('sha256').update(signedPayload).digest();

    // Decode the base64 signature
    const signatureBytes = Buffer.from(signature, 'base64');

    // Verify using RSA public key
    const isValid = crypto.verify(
      'sha256',
      hash,
      {
        key: BRIDGE_WEBHOOK_PUBLIC_KEY,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      signatureBytes
    );

    return { isValid };
  } catch (error) {
    console.error('Signature verification error:', error);
    return { isValid: false, error: `Verification failed: ${error}` };
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signatureHeader = request.headers.get('X-Webhook-Signature');
    
    // Verify webhook signature using public key
    const verification = verifyBridgeSignature(payload, signatureHeader);
    
    if (!verification.isValid) {
      console.error('Invalid webhook signature:', verification.error);
      // In sandbox mode, we may want to allow unsigned webhooks for testing
      if (process.env.BRIDGE_USE_MOCK !== 'true' && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      console.warn('Allowing webhook without valid signature (sandbox/dev mode)');
    }
    
    // Parse event
    const event: WebhookEvent = JSON.parse(payload);
    console.log(`Received webhook: ${event.type}`, event.id);
    
    // Handle different event types
    await handleBridgeWebhook(event, {
      // Wire transfer received - deposit USDC to vault
      onDepositCompleted: async (event) => {
        const { amount, virtual_account_id, metadata } = event.data;
        const escrowId = metadata?.escrow_id;
        
        if (!escrowId) {
          console.error('No escrow_id in deposit metadata');
          return;
        }
        
        console.log(`Deposit completed for escrow ${escrowId}: $${amount}`);
        
        // Get vault address
        const vaultAddress = await getVaultAddress(escrowId);
        if (!vaultAddress) {
          console.error(`Vault not found for escrow ${escrowId}`);
          return;
        }
        
        // Convert amount to USDC (6 decimals)
        const amountUSDC = BigInt(Math.floor(amount * 1e6));
        
        // Calculate minimum USDM output (allow 0.5% slippage)
        // USDM is 18 decimals, rough 1:1 with USDC but convert decimals
        const minUSDMOut = (amountUSDC * BigInt(995) * BigInt(1e12)) / BigInt(1000);
        
        try {
          // Deposit to vault (swaps to USDM)
          const txHash = await depositToVault(vaultAddress, amountUSDC, minUSDMOut);
          
          console.log(`Deposited to vault ${vaultAddress}: tx ${txHash}`);
          
          // Update database
          await prisma.escrow.update({
            where: { escrowId },
            data: {
              status: 'FUNDS_RECEIVED',
              fundedAt: new Date(),
              depositTxHash: txHash,
              currentBalance: amount,
            },
          });
          
          // TODO: Send Pusher notification to frontend
          // pusher.trigger(`escrow-${escrowId}`, 'deposit-received', { amount, txHash });
          
        } catch (error) {
          console.error(`Failed to deposit to vault: ${error}`);
          // Keep status as DEPOSIT_PENDING - error is logged but not stored
        }
      },
      
      // Deposit pending - wire initiated
      onDepositPending: async (event) => {
        const { amount, metadata } = event.data;
        const escrowId = metadata?.escrow_id;
        
        if (!escrowId) return;
        
        console.log(`Deposit pending for escrow ${escrowId}: $${amount}`);
        
        await prisma.escrow.update({
          where: { escrowId },
          data: {
            status: 'DEPOSIT_PENDING',
          },
        });
      },
      
      // USDC liquidated to fiat - payout ready
      onLiquidationCompleted: async (event) => {
        const { amount, metadata } = event.data;
        const payeeId = metadata?.payee_id;
        const escrowId = metadata?.escrow_id;
        
        if (!payeeId || !escrowId) return;
        
        console.log(`Liquidation completed for payee ${payeeId}: $${amount}`);
        
        // The fiat transfer will be initiated automatically by Bridge
        // Update payee status
        await prisma.payee.update({
          where: { id: payeeId },
          data: {
            status: 'PROCESSING',
          },
        });
      },
      
      // Fiat transfer completed
      onTransferCompleted: async (event) => {
        const { amount, metadata } = event.data;
        const payeeId = metadata?.payee_id;
        const escrowId = metadata?.escrow_id;
        
        if (!payeeId || !escrowId) return;
        
        console.log(`Transfer completed for payee ${payeeId}: $${amount}`);
        
        await prisma.payee.update({
          where: { id: payeeId },
          data: {
            status: 'COMPLETED',
            paidAt: new Date(),
          },
        });
        
        // Check if all payees are paid
        const unpaidPayees = await prisma.payee.count({
          where: {
            escrowId,
            status: { not: 'COMPLETED' },
          },
        });
        
        if (unpaidPayees === 0) {
          await prisma.escrow.update({
            where: { escrowId },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
            },
          });
        }
      },
      
      // Fiat transfer failed
      onTransferFailed: async (event) => {
        const { metadata } = event.data;
        const payeeId = metadata?.payee_id;
        
        if (!payeeId) return;
        
        console.error(`Transfer failed for payee ${payeeId}`);
        
        await prisma.payee.update({
          where: { id: payeeId },
          data: {
            status: 'FAILED',
          },
        });
      },
    });
    
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'bridge-webhook' });
}
