import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================
// POST /api/escrow/[id]/simulate-deposit
// Simulates a deposit for demo/testing purposes
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const escrowId = params.id;
    const body = await request.json().catch(() => ({}));
    
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
    
    // Check if already funded
    if (escrow.status !== 'CREATED' && escrow.status !== 'DEPOSIT_PENDING') {
      return NextResponse.json(
        { error: 'Escrow has already received funds' },
        { status: 400 }
      );
    }
    
    // Get deposit amount (default to purchase price if not specified)
    const depositAmount = body.amount || Number(escrow.purchasePrice);
    
    // Update escrow to funded status
    // In production: Bridge.xyz webhook triggers this when wire arrives
    // The wire is converted to USDC and deposited into the Safe
    const updatedEscrow = await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'FUNDS_RECEIVED',
        initialDeposit: depositAmount,
        currentBalance: depositAmount, // USDC balance (1:1 with USD deposited)
        fundedAt: new Date(),
      },
    });
    
    // Log the simulated deposit
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'DEPOSIT_SIMULATED',
        details: {
          amount: depositAmount,
          note: 'Demo mode - simulated wire transfer received',
        },
      },
    });
    
    console.log(`[DEMO] Simulated deposit for escrow ${escrow.escrowId}: $${depositAmount.toLocaleString()}`);
    
    return NextResponse.json({
      success: true,
      message: 'Deposit simulated successfully',
      escrow: {
        id: updatedEscrow.id,
        escrowId: updatedEscrow.escrowId,
        status: updatedEscrow.status,
        initialDeposit: Number(updatedEscrow.initialDeposit),
        currentBalance: Number(updatedEscrow.currentBalance),
        fundedAt: updatedEscrow.fundedAt?.toISOString(),
      },
    });
    
  } catch (error: any) {
    console.error('[SIMULATE_DEPOSIT] Error:', error);
    return NextResponse.json(
      { error: 'Failed to simulate deposit' },
      { status: 500 }
    );
  }
}

