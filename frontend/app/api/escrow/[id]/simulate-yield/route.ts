import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================
// POST /api/escrow/[id]/simulate-yield
// Simulates yield accrual for demo/testing purposes
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
    
    // Check if funded
    if (escrow.status === 'CREATED' || escrow.status === 'DEPOSIT_PENDING') {
      return NextResponse.json(
        { error: 'Escrow has not received funds yet' },
        { status: 400 }
      );
    }
    
    // Calculate yield
    // Default: simulate 30 days of 5% APY
    const daysToSimulate = body.days || 30;
    const annualYieldRate = 0.05; // 5% APY
    const dailyRate = annualYieldRate / 365;
    const principal = Number(escrow.initialDeposit || escrow.purchasePrice);
    
    const yieldAmount = principal * dailyRate * daysToSimulate;
    const newBalance = principal + yieldAmount;
    
    // Update escrow with simulated yield
    const updatedEscrow = await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        currentBalance: newBalance,
        accruedYield: yieldAmount,
        status: escrow.payees?.length > 0 ? 'READY_TO_CLOSE' : 'FUNDS_RECEIVED',
      },
      include: {
        payees: true,
      },
    });
    
    // Log the simulated yield
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'YIELD_SIMULATED',
        details: {
          daysSimulated: daysToSimulate,
          yieldAmount: yieldAmount,
          newBalance: newBalance,
          note: `Demo mode - simulated ${daysToSimulate} days of Treasury yield`,
        },
      },
    });
    
    console.log(`[DEMO] Simulated ${daysToSimulate} days yield for escrow ${escrow.escrowId}: +$${yieldAmount.toFixed(2)}`);
    
    return NextResponse.json({
      success: true,
      message: `Simulated ${daysToSimulate} days of yield accrual`,
      yieldInfo: {
        daysSimulated: daysToSimulate,
        annualRate: '5.00%',
        yieldAmount: yieldAmount,
        principal: principal,
        newBalance: newBalance,
      },
      escrow: {
        id: updatedEscrow.id,
        escrowId: updatedEscrow.escrowId,
        status: updatedEscrow.status,
        initialDeposit: Number(updatedEscrow.initialDeposit),
        currentBalance: Number(updatedEscrow.currentBalance),
        accruedYield: Number(updatedEscrow.accruedYield),
      },
    });
    
  } catch (error: any) {
    console.error('[SIMULATE_YIELD] Error:', error);
    return NextResponse.json(
      { error: 'Failed to simulate yield' },
      { status: 500 }
    );
  }
}

