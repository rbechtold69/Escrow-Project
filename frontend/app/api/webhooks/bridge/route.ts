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

// Verify webhook signature
function verifySignature(
  payload: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): boolean {
  if (!signature || !timestamp) return false;
  
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('bridge-signature');
    const timestamp = request.headers.get('bridge-timestamp');
    
    // Verify webhook signature
    const webhookSecret = process.env.BRIDGE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('BRIDGE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    
    if (!verifySignature(payload, signature, timestamp, webhookSecret)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
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
          
          // Update status to indicate error - keep as DEPOSIT_PENDING with error note
          await prisma.escrow.update({
            where: { escrowId },
            data: {
              status: 'DEPOSIT_PENDING',
              notes: `Deposit processing error: ${error}`,
            },
          });
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
        const { amount, transaction_hash, metadata } = event.data;
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
            liquidationTxHash: transaction_hash,
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
            status: 'PAID',
            paidAt: new Date(),
          },
        });
        
        // Check if all payees are paid
        const unpaidPayees = await prisma.payee.count({
          where: {
            escrowId,
            status: { not: 'PAID' },
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
            notes: 'Transfer failed - please retry',
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
