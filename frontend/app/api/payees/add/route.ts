/**
 * ============================================================================
 * API ROUTE: /api/payees/add
 * ============================================================================
 * 
 * SECURITY-CRITICAL ENDPOINT
 * 
 * This route handles the "Add Payee" flow with STRICT security:
 * 
 * 1. Receives bank details from frontend (routing #, account #)
 * 2. IMMEDIATELY sends to Bridge.xyz for tokenization (or mock service)
 * 3. Stores ONLY the returned token (bridgeBeneficiaryId)
 * 4. DISCARDS sensitive data - never written to DB or logs
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createBridgeServiceAuto, isMockBridgeService } from '@/lib/bridge-mock';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION SCHEMA
// ============================================================================

const AddPayeeSchema = z.object({
  // Escrow reference
  escrowId: z.string().min(1, 'Escrow ID is required'),
  
  // Payee identification (safe to store)
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  payeeType: z.enum([
    'BUYER', 'SELLER', 'BUYER_AGENT', 'LISTING_AGENT', 'BUYER_LENDER',
    'LOAN_OFFICER', 'ESCROW_COMPANY', 'TITLE_INSURANCE', 'UNDERWRITER',
    'APPRAISER', 'APPRAISAL_MGMT', 'HOME_INSURANCE', 'NOTARY', 'TC_BUYER',
    'TC_SELLER', 'HOA', 'HOA_MGMT', 'MORTGAGE_PAYOFF', 'HELOC_LENDER',
    'LIEN_HOLDER', 'PROPERTY_TAX', 'COUNTY_RECORDER', 'HAZARD_DISCLOSURE',
    'HOME_WARRANTY', 'COURIER_SERVICE', 'CREDIT_AGENCY', 'OTHER'
  ]),
  
  // Payment details
  paymentMethod: z.enum(['WIRE', 'ACH', 'INTERNATIONAL', 'CHECK']),
  amount: z.number().positive('Amount must be positive').optional(),
  basisPoints: z.number().min(0).max(10000).optional(), // 0-100%
  
  // Bank details - WILL BE TOKENIZED AND DISCARDED
  bankName: z.string().min(1, 'Bank name is required').max(200),
  routingNumber: z.string()
    .regex(/^\d{9}$/, 'Routing number must be exactly 9 digits'),
  accountNumber: z.string()
    .regex(/^\d{4,17}$/, 'Account number must be 4-17 digits'),
  accountType: z.enum(['checking', 'savings']).default('checking'),
  
  // For wire transfers
  beneficiaryAddress: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().default('US'),
  }).optional(),
});

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // ════════════════════════════════════════════════════════════════════════
    // STEP 1: Parse and validate input
    // ════════════════════════════════════════════════════════════════════════
    
    const body = await request.json();
    const validatedData = AddPayeeSchema.parse(body);
    
    // Log the action (WITHOUT sensitive data)
    console.log(`[ADD_PAYEE] Processing payee for escrow: ${validatedData.escrowId}`);
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 2: Verify escrow exists
    // ════════════════════════════════════════════════════════════════════════
    
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: validatedData.escrowId },
          { id: validatedData.escrowId },
        ],
      },
    });
    
    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 3: Tokenize bank account via Bridge.xyz (or mock)
    // This is the ONLY place where routing/account numbers are used
    // ════════════════════════════════════════════════════════════════════════
    
    const bridgeService = createBridgeServiceAuto();
    const payeeName = `${validatedData.firstName} ${validatedData.lastName}`;
    const accountLast4 = validatedData.accountNumber.slice(-4);
    
    let beneficiaryId: string;
    
    // Use appropriate method based on payment type
    if (validatedData.paymentMethod === 'ACH') {
      const account = await bridgeService.createACHAccount({
        routingNumber: validatedData.routingNumber,
        accountNumber: validatedData.accountNumber,
        accountType: validatedData.accountType,
        beneficiaryName: payeeName,
      });
      beneficiaryId = account.id;
    } else if (validatedData.paymentMethod === 'WIRE') {
      const account = await bridgeService.createWireAccount({
        bankName: validatedData.bankName,
        routingNumber: validatedData.routingNumber,
        accountNumber: validatedData.accountNumber,
        beneficiaryName: payeeName,
        beneficiaryAddress: validatedData.beneficiaryAddress?.street || '',
      });
      beneficiaryId = account.id;
    } else if (validatedData.paymentMethod === 'CHECK') {
      const account = await bridgeService.createCheckAccount({
        recipientName: payeeName,
        addressLine1: validatedData.beneficiaryAddress?.street || '123 Main St',
        city: validatedData.beneficiaryAddress?.city || 'San Francisco',
        state: validatedData.beneficiaryAddress?.state || 'CA',
        postalCode: validatedData.beneficiaryAddress?.zipCode || '94102',
        country: validatedData.beneficiaryAddress?.country || 'US',
      });
      beneficiaryId = account.id;
    } else {
      // International wire - use wire for now
      const account = await bridgeService.createWireAccount({
        bankName: validatedData.bankName,
        routingNumber: validatedData.routingNumber,
        accountNumber: validatedData.accountNumber,
        beneficiaryName: payeeName,
        beneficiaryAddress: validatedData.beneficiaryAddress?.street || '',
        swiftCode: 'SWIFT123',
      });
      beneficiaryId = account.id;
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: Store ONLY safe data in our database
    // ════════════════════════════════════════════════════════════════════════
    
    const payee = await prisma.payee.create({
      data: {
        escrowId: escrow.id,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.email || null,
        payeeType: validatedData.payeeType,
        paymentMethod: validatedData.paymentMethod,
        amount: validatedData.amount ? validatedData.amount : null,
        basisPoints: validatedData.basisPoints,
        
        // TOKENIZED REFERENCE - The only "bank data" we store
        bridgeBeneficiaryId: beneficiaryId,
        
        // Safe metadata for UI
        bankName: validatedData.bankName,
        accountLast4: accountLast4,
        
        status: 'PENDING',
      },
    });
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 5: Create audit log (NO sensitive data)
    // ════════════════════════════════════════════════════════════════════════
    
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'PAYEE_ADDED',
        details: {
          payeeId: payee.id,
          payeeName: payeeName,
          payeeType: validatedData.payeeType,
          paymentMethod: validatedData.paymentMethod,
          bankName: validatedData.bankName,
          accountLast4: accountLast4,
        },
        actorWallet: request.headers.get('x-wallet-address') || null,
        actorIp: request.headers.get('x-forwarded-for')?.split(',')[0] || null,
      },
    });
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 6: Return success
    // ════════════════════════════════════════════════════════════════════════
    
    const isMock = isMockBridgeService(bridgeService);
    console.log(`[ADD_PAYEE] Successfully added payee: ${payee.id} (mock: ${isMock})`);
    
    return NextResponse.json({
      success: true,
      payee: {
        id: payee.id,
        firstName: payee.firstName,
        lastName: payee.lastName,
        email: payee.email,
        payeeType: payee.payeeType,
        paymentMethod: payee.paymentMethod,
        amount: payee.amount ? Number(payee.amount) : null,
        basisPoints: payee.basisPoints,
        bankName: payee.bankName,
        accountLast4: payee.accountLast4,
        status: payee.status,
      },
      message: isMock 
        ? 'TEST MODE: Using mock Bridge service.' 
        : 'Payee added successfully.',
    });
    
  } catch (error: any) {
    console.error('[ADD_PAYEE] Error:', error.message);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          }))
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to add payee. Please try again.' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET: List payees for an escrow (safe data only)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const escrowId = searchParams.get('escrowId');
    
    if (!escrowId) {
      return NextResponse.json(
        { error: 'escrowId is required' },
        { status: 400 }
      );
    }
    
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: escrowId },
          { id: escrowId },
        ],
      },
      include: {
        payees: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            payeeType: true,
            paymentMethod: true,
            amount: true,
            basisPoints: true,
            bankName: true,
            accountLast4: true,
            status: true,
            createdAt: true,
            paidAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    
    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      payees: escrow.payees.map(p => ({
        ...p,
        amount: p.amount ? Number(p.amount) : null,
      })),
    });
    
  } catch (error: any) {
    console.error('[GET_PAYEES] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch payees' },
      { status: 500 }
    );
  }
}
