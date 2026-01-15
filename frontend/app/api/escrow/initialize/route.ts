/**
 * ============================================================================
 * API ROUTE: /api/escrow/initialize
 * ============================================================================
 * 
 * COMPLIANT DEAL INITIALIZATION
 * 
 * This endpoint creates a fully compliant escrow with:
 * ✅ Segregated custodial wallet (non-commingling)
 * ✅ Bridge Customer for KYC
 * ✅ Virtual account for wire deposits
 * ✅ Complete audit trail
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeDeal } from '@/lib/escrow-compliant';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const InitializeDealSchema = z.object({
  dealId: z.string().min(1, 'Deal ID is required').optional(),
  propertyAddress: z.string().min(1, 'Property address is required'),
  expectedAmount: z.number().positive('Amount must be positive'),
  buyerInfo: z.object({
    firstName: z.string().min(1, 'Buyer first name is required'),
    lastName: z.string().min(1, 'Buyer last name is required'),
    email: z.string().email('Valid buyer email is required'),
    phone: z.string().optional(),
  }),
});

// ============================================================================
// POST: Initialize a new compliant escrow deal
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = InitializeDealSchema.parse(body);
    
    // Generate deal ID if not provided
    const year = new Date().getFullYear();
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const dealId = validatedData.dealId || `ESC-${year}-${randomNum}`;
    
    console.log(`[API] Initializing compliant deal: ${dealId}`);
    
    // Initialize deal with Bridge.xyz
    const result = await initializeDeal({
      dealId,
      buyerInfo: validatedData.buyerInfo,
      propertyAddress: validatedData.propertyAddress,
      expectedAmount: validatedData.expectedAmount,
    });
    
    return NextResponse.json({
      success: true,
      dealId: result.dealId,
      
      // Bridge references (for transparency, not security-sensitive)
      bridge: {
        customerId: result.bridgeCustomerId,
        walletId: result.bridgeWalletId,
        virtualAccountId: result.virtualAccountId,
      },
      
      // Wiring instructions for the buyer
      wiringInstructions: result.wiringInstructions,
      
      message: 'Escrow initialized with segregated custodial wallet',
    });
    
  } catch (error: any) {
    console.error('[API] Initialize deal error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to initialize deal', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET: Info
// ============================================================================

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/escrow/initialize',
    method: 'POST',
    description: 'Initialize a compliant escrow with segregated custodial wallet',
    compliance: {
      'Non-Commingling': 'Each deal gets its own Bridge wallet',
      'No Money Transmission': 'Bridge is the Qualified Custodian',
      'Good Funds': 'Funds verified via webhook before disbursement',
    },
    requiredFields: {
      propertyAddress: 'string',
      expectedAmount: 'number (USD)',
      buyerInfo: {
        firstName: 'string',
        lastName: 'string',
        email: 'string',
      },
    },
  });
}
