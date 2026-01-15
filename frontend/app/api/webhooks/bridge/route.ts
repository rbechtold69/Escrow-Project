/**
 * ============================================================================
 * Bridge.xyz Webhook Handler (Compliant Architecture)
 * ============================================================================
 * 
 * Handles incoming webhooks from Bridge:
 * - deposit.received: Wire initiated
 * - deposit.completed: Funds settled and irreversible (GOOD FUNDS)
 * - deposit.failed: Deposit failed
 * - transfer.completed/failed: Payout status updates
 * 
 * COMPLIANCE:
 * ✅ Good Funds: Only marks FUNDS_SECURED after deposit.completed
 * ✅ Non-Commingling: Verifies funds went to correct wallet
 * ✅ Audit Trail: All events logged
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleBridgeWebhook, WebhookEvent } from '@/lib/bridge-service';
import { handleDepositReceived, DepositWebhookEvent } from '@/lib/escrow-compliant';
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
    const event = JSON.parse(payload);
    console.log(`[WEBHOOK] Received: ${event.type}`, event.id);
    
    // ════════════════════════════════════════════════════════════════════════
    // ROUTE EVENTS TO APPROPRIATE HANDLERS
    // ════════════════════════════════════════════════════════════════════════
    
    // Handle deposit events with compliant handler
    if (event.type?.startsWith('deposit.')) {
      const result = await handleDepositReceived(event as DepositWebhookEvent);
      if (!result.success) {
        console.error(`[WEBHOOK] Deposit handling failed: ${result.error}`);
      }
    }
    
    // Handle transfer/payout events
    else if (event.type === 'transfer.completed') {
      const { amount, metadata } = event.data;
      const payeeId = metadata?.payee_id;
      const escrowId = metadata?.deal_id || metadata?.escrow_id;
      
      if (payeeId) {
        console.log(`[WEBHOOK] Transfer completed for payee ${payeeId}: $${amount}`);
        
        await prisma.payee.update({
          where: { id: payeeId },
          data: {
            status: 'COMPLETED',
            paidAt: new Date(),
          },
        });
        
        // Check if all payees are paid
        if (escrowId) {
          const escrow = await prisma.escrow.findUnique({
            where: { escrowId },
            include: { payees: true },
          });
          
          if (escrow) {
            const allPaid = escrow.payees.every(p => p.status === 'COMPLETED');
            if (allPaid) {
              await prisma.escrow.update({
                where: { id: escrow.id },
                data: {
                  status: 'CLOSED',
                  closedAt: new Date(),
                },
              });
              console.log(`[WEBHOOK] ✅ Escrow ${escrowId} fully closed`);
            }
          }
        }
      }
    }
    
    else if (event.type === 'transfer.failed') {
      const { metadata } = event.data;
      const payeeId = metadata?.payee_id;
      
      if (payeeId) {
        console.error(`[WEBHOOK] ❌ Transfer failed for payee ${payeeId}`);
        
        await prisma.payee.update({
          where: { id: payeeId },
          data: {
            status: 'FAILED',
          },
        });
      }
    }
    
    // Log unknown event types
    else {
      console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }
    
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
