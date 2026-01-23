import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================
// GET /api/escrow/[id]
// Get escrow details by ID (supports both DB id and escrowId)
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // Try to find by escrowId first (e.g., "ESC-2024-123456")
    // Then try by database id (cuid)
    let escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: id },
          { id: id },
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
            paidAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        createdBy: {
          select: {
            id: true,
            displayName: true,
            walletAddress: true,
          },
        },
      },
    });

    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }

    // Get actual balances from database
    const initialDeposit = Number(escrow.initialDeposit || 0);
    const currentBalance = Number(escrow.currentBalance || 0);
    const depositAmount = escrow.status !== 'CREATED' ? initialDeposit : 0;

    // Build mock wiring instructions (in production, fetch from Bridge)
    const wiringInstructions = {
      accountNumber: escrow.bridgeVirtualAccountId 
        ? `****${escrow.bridgeVirtualAccountId.slice(-4)}`
        : generateMockAccountNumber(),
      routingNumber: '021000021',
      bankName: 'Bridge Trust Bank (TEST MODE)',
      bankAddress: '123 Financial District, San Francisco, CA 94102',
      beneficiaryName: `EscrowBase FBO ${escrow.buyerFirstName} ${escrow.buyerLastName}`,
      reference: escrow.escrowId,
    };

    // Transform payees for frontend
    const formattedPayees = escrow.payees.map(payee => ({
      id: payee.id,
      name: `${payee.firstName} ${payee.lastName}`,
      type: payee.payeeType,
      email: payee.email || '',
      paymentMethod: payee.paymentMethod,
      amount: payee.amount ? Number(payee.amount) : undefined,
      basisPoints: payee.basisPoints || undefined,
      usePercentage: !!payee.basisPoints,
      status: payee.status,
      paymentDetails: {
        bankName: payee.bankName,
        accountLast4: payee.accountLast4,
      },
      paidAt: payee.paidAt,
    }));

    // Build response
    const response = {
      id: escrow.id,
      escrowId: escrow.escrowId,
      propertyAddress: `${escrow.propertyAddress}, ${escrow.city}, ${escrow.state} ${escrow.zipCode}`,
      purchasePrice: Number(escrow.purchasePrice),
      safeAddress: escrow.safeAddress || '',
      vaultAddress: escrow.vaultAddress || '',
      status: escrow.status,
      buyerName: `${escrow.buyerFirstName} ${escrow.buyerLastName}`,
      buyerEmail: escrow.buyerEmail,
      sellerName: 'Pending', // Would come from payees
      sellerEmail: '',
      createdAt: escrow.createdAt.toISOString(),
      // Actual balance from database
      depositAmount: depositAmount,
      currentBalance: currentBalance,
      initialDeposit: initialDeposit,
      depositReceivedAt: escrow.fundedAt?.toISOString(),
      closedAt: escrow.closedAt?.toISOString(),
      // Yield/Interest tracking
      yieldEnabled: escrow.yieldEnabled,
      yieldEarned: escrow.yieldEarned ? Number(escrow.yieldEarned) : 0,
      yieldReturnedTo: escrow.yieldReturnedTo || null,
      // Other data
      wiringInstructions,
      payees: formattedPayees,
      pendingSignatures: [], // Would come from Safe service
      createdBy: escrow.createdBy,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[GET_ESCROW] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch escrow', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH /api/escrow/[id]
// Update escrow details
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();

    // Find escrow
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: id },
          { id: id },
        ],
      },
    });

    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }

    // Only allow updates to certain fields
    const allowedUpdates: Record<string, any> = {};
    
    if (body.buyerFirstName) allowedUpdates.buyerFirstName = body.buyerFirstName;
    if (body.buyerLastName) allowedUpdates.buyerLastName = body.buyerLastName;
    if (body.buyerEmail) allowedUpdates.buyerEmail = body.buyerEmail;
    if (body.status) allowedUpdates.status = body.status;

    const updated = await prisma.escrow.update({
      where: { id: escrow.id },
      data: allowedUpdates,
    });

    // Log the update
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'ESCROW_UPDATED',
        details: allowedUpdates,
        actorWallet: request.headers.get('x-wallet-address') || null,
      },
    });

    return NextResponse.json({
      success: true,
      escrow: updated,
    });

  } catch (error: any) {
    console.error('[UPDATE_ESCROW] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update escrow', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/escrow/[id]
// Delete an escrow and all related records
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // Find escrow
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: id },
          { id: id },
        ],
      },
    });

    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }

    // Don't allow deletion of closed escrows with disbursed funds
    if (escrow.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'Cannot delete a closed escrow' },
        { status: 400 }
      );
    }

    // Delete related records first (due to foreign key constraints)
    // The cascade should handle this, but being explicit for safety
    
    // Delete payees
    await prisma.payee.deleteMany({
      where: { escrowId: escrow.id },
    });
    
    // Delete signers
    await prisma.escrowSigner.deleteMany({
      where: { escrowId: escrow.id },
    });
    
    // Delete activity logs
    await prisma.activityLog.deleteMany({
      where: { escrowId: escrow.id },
    });
    
    // Delete wire batches
    await prisma.wireBatch.deleteMany({
      where: { escrowId: escrow.id },
    });

    // Finally, delete the escrow
    await prisma.escrow.delete({
      where: { id: escrow.id },
    });

    return NextResponse.json({
      success: true,
      message: `Escrow ${escrow.escrowId} deleted successfully`,
    });

  } catch (error: any) {
    console.error('[DELETE_ESCROW] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete escrow', details: error.message },
      { status: 500 }
    );
  }
}

// Helper function
function generateMockAccountNumber(): string {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}
