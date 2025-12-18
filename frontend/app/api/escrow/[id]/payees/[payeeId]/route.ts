import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================
// DELETE /api/escrow/[id]/payees/[payeeId]
// Remove a payee from an escrow
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; payeeId: string } }
) {
  try {
    const { id: escrowId, payeeId } = params;
    
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
    
    // Check escrow is not closed
    if (escrow.status === 'CLOSED' || escrow.status === 'CLOSING') {
      return NextResponse.json(
        { error: 'Cannot modify payees on a closed escrow' },
        { status: 400 }
      );
    }
    
    // Find and delete payee
    const payee = await prisma.payee.findFirst({
      where: {
        id: payeeId,
        escrowId: escrow.id,
      },
    });
    
    if (!payee) {
      return NextResponse.json(
        { error: 'Payee not found' },
        { status: 404 }
      );
    }
    
    await prisma.payee.delete({
      where: { id: payeeId },
    });
    
    // Log the deletion
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'PAYEE_REMOVED',
        details: {
          payeeId: payeeId,
          payeeName: `${payee.firstName} ${payee.lastName}`,
        },
        actorWallet: request.headers.get('x-wallet-address') || null,
      },
    });
    
    return NextResponse.json({
      success: true,
      message: 'Payee removed',
    });
    
  } catch (error: any) {
    console.error('[DELETE_PAYEE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to remove payee' },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH /api/escrow/[id]/payees/[payeeId]
// Update a payee's amount or other details
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; payeeId: string } }
) {
  try {
    const { id: escrowId, payeeId } = params;
    const body = await request.json();
    
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
    
    // Check escrow is not closed
    if (escrow.status === 'CLOSED' || escrow.status === 'CLOSING') {
      return NextResponse.json(
        { error: 'Cannot modify payees on a closed escrow' },
        { status: 400 }
      );
    }
    
    // Find payee
    const existingPayee = await prisma.payee.findFirst({
      where: {
        id: payeeId,
        escrowId: escrow.id,
      },
    });
    
    if (!existingPayee) {
      return NextResponse.json(
        { error: 'Payee not found' },
        { status: 404 }
      );
    }
    
    // Build update object (only allow certain fields)
    const allowedUpdates: any = {};
    
    if (body.amount !== undefined) {
      allowedUpdates.amount = body.amount;
      allowedUpdates.basisPoints = null; // Clear percentage if setting fixed amount
    }
    if (body.basisPoints !== undefined) {
      allowedUpdates.basisPoints = body.basisPoints;
      allowedUpdates.amount = null; // Clear amount if setting percentage
    }
    if (body.email !== undefined) {
      allowedUpdates.email = body.email || null;
    }
    
    const updatedPayee = await prisma.payee.update({
      where: { id: payeeId },
      data: allowedUpdates,
    });
    
    // Log the update
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'PAYEE_UPDATED',
        details: {
          payeeId: payeeId,
          updates: allowedUpdates,
        },
        actorWallet: request.headers.get('x-wallet-address') || null,
      },
    });
    
    return NextResponse.json({
      success: true,
      payee: {
        id: updatedPayee.id,
        name: `${updatedPayee.firstName} ${updatedPayee.lastName}`,
        amount: updatedPayee.amount ? Number(updatedPayee.amount) : undefined,
        basisPoints: updatedPayee.basisPoints,
        status: updatedPayee.status,
      },
    });
    
  } catch (error: any) {
    console.error('[UPDATE_PAYEE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update payee' },
      { status: 500 }
    );
  }
}

// ============================================================
// GET /api/escrow/[id]/payees/[payeeId]
// Get a single payee's details
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; payeeId: string } }
) {
  try {
    const { id: escrowId, payeeId } = params;
    
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
    
    const payee = await prisma.payee.findFirst({
      where: {
        id: payeeId,
        escrowId: escrow.id,
      },
    });
    
    if (!payee) {
      return NextResponse.json(
        { error: 'Payee not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      payee: {
        id: payee.id,
        name: `${payee.firstName} ${payee.lastName}`,
        firstName: payee.firstName,
        lastName: payee.lastName,
        email: payee.email,
        type: payee.payeeType,
        paymentMethod: payee.paymentMethod,
        amount: payee.amount ? Number(payee.amount) : undefined,
        basisPoints: payee.basisPoints,
        usePercentage: !!payee.basisPoints,
        bankName: payee.bankName,
        accountLast4: payee.accountLast4,
        status: payee.status,
        paidAt: payee.paidAt,
      },
    });
    
  } catch (error: any) {
    console.error('[GET_PAYEE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payee' },
      { status: 500 }
    );
  }
}



