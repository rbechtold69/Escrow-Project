import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createBridgeServiceAuto } from '@/lib/bridge-mock';

// ============================================================
// POST /api/escrow/[id]/close
// Initiate and complete the escrow closing process
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const escrowId = params.id;
    
    // Find escrow with payees
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: escrowId },
          { id: escrowId },
        ],
      },
      include: {
        payees: true,
      },
    });
    
    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }
    
    // Validate escrow can be closed
    if (escrow.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'Escrow is already closed' },
        { status: 400 }
      );
    }
    
    if (escrow.status === 'CREATED' || escrow.status === 'DEPOSIT_PENDING') {
      return NextResponse.json(
        { error: 'Cannot close escrow - no funds received' },
        { status: 400 }
      );
    }
    
    if (escrow.payees.length === 0) {
      return NextResponse.json(
        { error: 'Cannot close escrow - no payees configured' },
        { status: 400 }
      );
    }
    
    // Calculate financials
    const principal = Number(escrow.initialDeposit || escrow.purchasePrice);
    const currentBalance = Number(escrow.currentBalance || principal);
    const accruedYield = Number(escrow.accruedYield || 0);
    
    // Calculate total to payees
    const totalToPayees = escrow.payees.reduce((sum, payee) => {
      const amount = payee.basisPoints 
        ? (Number(escrow.purchasePrice) * payee.basisPoints) / 10000
        : Number(payee.amount) || 0;
      return sum + amount;
    }, 0);
    
    // Calculate platform fee (0.5% of yield) and buyer rebate
    const platformFeeBps = 50; // 0.5%
    const platformFee = (accruedYield * platformFeeBps) / 10000;
    const buyerRebate = accruedYield - platformFee;
    
    // Update escrow status to CLOSING
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: 'CLOSING' },
    });
    
    // In a real implementation, this would:
    // 1. Call the smart contract to swap USDM → USDC
    // 2. Queue all payee transfers via Bridge
    // 3. Wait for multisig approval
    
    // For demo mode, simulate the closing process
    const bridgeService = createBridgeServiceAuto();
    const payoutResults = [];
    
    // Process each payee (simulated)
    for (const payee of escrow.payees) {
      const amount = payee.basisPoints 
        ? (Number(escrow.purchasePrice) * payee.basisPoints) / 10000
        : Number(payee.amount) || 0;
      
      // Simulate transfer initiation
      const transfer = await bridgeService.initiateTransfer({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        destination_account_id: payee.bridgeBeneficiaryId,
        memo: `Escrow ${escrow.escrowId} disbursement`,
        metadata: {
          escrowId: escrow.escrowId,
          payeeId: payee.id,
          payeeType: payee.payeeType,
        },
      });
      
      // Update payee status
      await prisma.payee.update({
        where: { id: payee.id },
        data: {
          status: 'PROCESSING',
          bridgeTransferId: transfer.id,
        },
      });
      
      payoutResults.push({
        payeeId: payee.id,
        name: `${payee.firstName} ${payee.lastName}`,
        amount: amount,
        transferId: transfer.id,
        status: transfer.status,
      });
    }
    
    // Mark escrow as closed
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
    
    // Update all payees to COMPLETED (in demo mode, instant completion)
    await prisma.payee.updateMany({
      where: { escrowId: escrow.id },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
      },
    });
    
    // Log the close
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'ESCROW_CLOSED',
        details: {
          principal: principal,
          accruedYield: accruedYield,
          platformFee: platformFee,
          buyerRebate: buyerRebate,
          totalToPayees: totalToPayees,
          payeeCount: escrow.payees.length,
          payouts: payoutResults,
        },
        actorWallet: request.headers.get('x-wallet-address') || null,
      },
    });
    
    console.log(`[CLOSE_ESCROW] Escrow ${escrow.escrowId} closed successfully`);
    console.log(`  Principal: $${principal.toLocaleString()}`);
    console.log(`  Yield: $${accruedYield.toFixed(2)}`);
    console.log(`  Buyer Rebate: $${buyerRebate.toFixed(2)}`);
    console.log(`  Payees: ${escrow.payees.length} totaling $${totalToPayees.toLocaleString()}`);
    
    return NextResponse.json({
      success: true,
      message: 'Escrow closed successfully',
      summary: {
        escrowId: escrow.escrowId,
        principal: principal,
        accruedYield: accruedYield,
        platformFee: platformFee,
        buyerRebate: buyerRebate,
        totalToPayees: totalToPayees,
        closedAt: new Date().toISOString(),
      },
      payouts: payoutResults,
    });
    
  } catch (error: any) {
    console.error('[CLOSE_ESCROW] Error:', error);
    return NextResponse.json(
      { error: 'Failed to close escrow', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// GET /api/escrow/[id]/close
// Get close summary (for pre-close review)
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
        payees: true,
      },
    });
    
    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }
    
    const principal = Number(escrow.initialDeposit || escrow.purchasePrice);
    const currentBalance = Number(escrow.currentBalance || principal);
    const accruedYield = Number(escrow.accruedYield || 0);
    
    const totalToPayees = escrow.payees.reduce((sum, payee) => {
      const amount = payee.basisPoints 
        ? (Number(escrow.purchasePrice) * payee.basisPoints) / 10000
        : Number(payee.amount) || 0;
      return sum + amount;
    }, 0);
    
    const platformFeeBps = 50;
    const platformFee = (accruedYield * platformFeeBps) / 10000;
    const buyerRebate = accruedYield - platformFee;
    
    return NextResponse.json({
      canClose: escrow.status === 'FUNDS_RECEIVED' || escrow.status === 'READY_TO_CLOSE',
      summary: {
        principal: principal,
        currentBalance: currentBalance,
        accruedYield: accruedYield,
        platformFee: platformFee,
        platformFeePercent: '0.5%',
        buyerRebate: buyerRebate,
        totalToPayees: totalToPayees,
        payeeCount: escrow.payees.length,
        remaining: currentBalance - totalToPayees - platformFee,
      },
      payees: escrow.payees.map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        type: p.payeeType,
        amount: p.basisPoints 
          ? (Number(escrow.purchasePrice) * p.basisPoints) / 10000
          : Number(p.amount) || 0,
        method: p.paymentMethod,
        bankName: p.bankName,
        accountLast4: p.accountLast4,
      })),
    });
    
  } catch (error: any) {
    console.error('[GET_CLOSE_SUMMARY] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get close summary' },
      { status: 500 }
    );
  }
}
