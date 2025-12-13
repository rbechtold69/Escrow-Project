import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createBridgeServiceAuto, isMockBridgeService } from '@/lib/bridge-mock';
import { z } from 'zod';

// ============================================================
// POST /api/escrow/[id]/payees
// Add a payee to a specific escrow
// ============================================================

const AddPayeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  payeeType: z.string(),
  paymentMethod: z.enum(['WIRE', 'ACH', 'INTERNATIONAL', 'CHECK']),
  amount: z.number().positive().optional(),
  basisPoints: z.number().min(0).max(10000).optional(),
  bankName: z.string().min(1),
  routingNumber: z.string().regex(/^\d{9}$/),
  accountNumber: z.string().regex(/^\d{4,17}$/),
  accountType: z.enum(['checking', 'savings']).default('checking'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const escrowId = params.id;
    const body = await request.json();
    const validatedData = AddPayeeSchema.parse(body);
    
    // Find escrow
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: escrowId },
          { id: escrowId },
        ],
      },
    });
    
    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }
    
    // Tokenize bank account
    const bridgeService = createBridgeServiceAuto();
    const payeeName = `${validatedData.firstName} ${validatedData.lastName}`;
    const accountLast4 = validatedData.accountNumber.slice(-4);
    
    let account;
    if (validatedData.paymentMethod === 'ACH') {
      account = await bridgeService.createACHAccount({
        routingNumber: validatedData.routingNumber,
        accountNumber: validatedData.accountNumber,
        accountType: validatedData.accountType,
        beneficiaryName: payeeName,
      });
    } else {
      account = await bridgeService.createWireAccount({
        bankName: validatedData.bankName,
        routingNumber: validatedData.routingNumber,
        accountNumber: validatedData.accountNumber,
        beneficiaryName: payeeName,
        beneficiaryAddress: '',
      });
    }
    
    // Create payee
    const payee = await prisma.payee.create({
      data: {
        escrowId: escrow.id,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.email || null,
        payeeType: validatedData.payeeType as any,
        paymentMethod: validatedData.paymentMethod,
        amount: validatedData.amount || null,
        basisPoints: validatedData.basisPoints,
        bridgeBeneficiaryId: account.id,
        bankName: validatedData.bankName,
        accountLast4: accountLast4,
        status: 'PENDING',
      },
    });
    
    // Log
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'PAYEE_ADDED',
        details: {
          payeeId: payee.id,
          payeeName,
          payeeType: validatedData.payeeType,
        },
      },
    });
    
    return NextResponse.json({
      success: true,
      payee: {
        id: payee.id,
        name: payeeName,
        type: payee.payeeType,
        email: payee.email,
        paymentMethod: payee.paymentMethod,
        amount: payee.amount ? Number(payee.amount) : undefined,
        basisPoints: payee.basisPoints,
        bankName: payee.bankName,
        accountLast4: payee.accountLast4,
        status: payee.status,
      },
    });
    
  } catch (error: any) {
    console.error('[ADD_PAYEE] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to add payee' },
      { status: 500 }
    );
  }
}

// ============================================================
// GET /api/escrow/[id]/payees
// List all payees for an escrow
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const escrowId = params.id;
    
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: escrowId },
          { id: escrowId },
        ],
      },
      include: {
        payees: {
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
    
    const formattedPayees = escrow.payees.map(p => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      type: p.payeeType,
      email: p.email,
      paymentMethod: p.paymentMethod,
      amount: p.amount ? Number(p.amount) : undefined,
      basisPoints: p.basisPoints,
      usePercentage: !!p.basisPoints,
      bankName: p.bankName,
      accountLast4: p.accountLast4,
      status: p.status,
      paidAt: p.paidAt,
    }));
    
    return NextResponse.json({
      payees: formattedPayees,
    });
    
  } catch (error: any) {
    console.error('[GET_PAYEES] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payees' },
      { status: 500 }
    );
  }
}

