/**
 * ============================================================================
 * API ROUTE: /api/escrow/disburse
 * ============================================================================
 * 
 * COMPLIANT FUND DISBURSEMENT
 * 
 * This endpoint disburses funds with:
 * ✅ Good Funds verification (only after settlement)
 * ✅ RTP payments for instant settlement
 * ✅ Idempotency to prevent double-payment
 * ✅ Complete audit trail
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { disburseFunds, Recipient } from '@/lib/escrow-compliant';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const RecipientSchema = z.object({
  name: z.string().min(1, 'Recipient name is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentRail: z.enum(['rtp', 'wire', 'ach']).default('rtp'),
  bankDetails: z.object({
    routingNumber: z.string().length(9, 'Routing number must be 9 digits'),
    accountNumber: z.string().min(4, 'Account number required'),
    accountType: z.enum(['checking', 'savings']).optional(),
    bankName: z.string().optional(),
  }),
  metadata: z.record(z.string()).optional(),
});

const DisburseSchema = z.object({
  dealId: z.string().min(1, 'Deal ID is required'),
  recipients: z.array(RecipientSchema).min(1, 'At least one recipient required'),
});

// ============================================================================
// POST: Disburse funds to recipients
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = DisburseSchema.parse(body);
    
    console.log(`[API] Disbursing funds for deal: ${validatedData.dealId}`);
    console.log(`[API] Recipients: ${validatedData.recipients.length}`);
    
    // Disburse funds via Bridge.xyz
    const result = await disburseFunds(
      validatedData.dealId,
      validatedData.recipients as Recipient[]
    );
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: 'Some disbursements failed',
        dealId: result.dealId,
        transfers: result.transfers,
      }, { status: 207 }); // 207 Multi-Status
    }
    
    return NextResponse.json({
      success: true,
      dealId: result.dealId,
      transfers: result.transfers,
      message: `Successfully initiated ${result.transfers.length} RTP payouts`,
    });
    
  } catch (error: any) {
    console.error('[API] Disburse error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    
    // Handle specific compliance errors
    if (error.message.includes('Cannot disburse')) {
      return NextResponse.json(
        { error: error.message, code: 'FUNDS_NOT_SECURED' },
        { status: 400 }
      );
    }
    
    if (error.message.includes('exceeds balance')) {
      return NextResponse.json(
        { error: error.message, code: 'INSUFFICIENT_FUNDS' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to disburse funds', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET: Info
// ============================================================================

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/escrow/disburse',
    method: 'POST',
    description: 'Disburse escrow funds to recipients via RTP/Wire/ACH',
    compliance: {
      'Good Funds': 'Only disburses after deposit.completed',
      'RTP Rails': 'Real-Time Payments for instant settlement',
      'Idempotency': 'Prevents double-payment on retry',
    },
    requiredFields: {
      dealId: 'string (ESC-YYYY-XXXXXX)',
      recipients: [{
        name: 'string',
        amount: 'number (USD)',
        paymentRail: 'rtp | wire | ach',
        bankDetails: {
          routingNumber: 'string (9 digits)',
          accountNumber: 'string',
          accountType: 'checking | savings (optional)',
        },
      }],
    },
    example: {
      dealId: 'ESC-2024-123456',
      recipients: [
        {
          name: 'John Smith',
          amount: 450000,
          paymentRail: 'rtp',
          bankDetails: {
            routingNumber: '021000021',
            accountNumber: '123456789',
            accountType: 'checking',
          },
        },
        {
          name: 'ABC Realty',
          amount: 27000,
          paymentRail: 'wire',
          bankDetails: {
            routingNumber: '021000021',
            accountNumber: '987654321',
            bankName: 'Chase Bank',
          },
        },
      ],
    },
  });
}
