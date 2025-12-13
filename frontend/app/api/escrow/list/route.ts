import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================
// GET /api/escrow/list
// List all escrows for the current user
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const officerAddress = searchParams.get('officer');
    const status = searchParams.get('status');
    
    // Build query filters
    const where: any = {};
    
    if (officerAddress) {
      // Find user by wallet address
      const user = await prisma.user.findUnique({
        where: { walletAddress: officerAddress },
      });
      
      if (user) {
        where.createdById = user.id;
      }
    }
    
    if (status) {
      where.status = status;
    }
    
    // Query database
    const escrows = await prisma.escrow.findMany({
      where,
      include: {
        payees: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // Transform for frontend
    const formattedEscrows = escrows.map(escrow => ({
      id: escrow.escrowId, // Use escrowId for routing
      propertyAddress: `${escrow.propertyAddress}, ${escrow.city}, ${escrow.state} ${escrow.zipCode}`,
      purchasePrice: Number(escrow.purchasePrice),
      status: escrow.status,
      createdAt: escrow.createdAt.toISOString(),
      safeAddress: escrow.safeAddress || '',
      vaultAddress: escrow.vaultAddress || '',
      currentBalance: escrow.currentBalance ? Number(escrow.currentBalance) : undefined,
      payeeCount: escrow.payees.length,
    }));
    
    return NextResponse.json({
      escrows: formattedEscrows,
      total: formattedEscrows.length,
    });
    
  } catch (error: any) {
    console.error('Error fetching escrows:', error);
    
    // If database is empty or not connected, return empty list
    if (error.code === 'P2021' || error.code === 'P2002') {
      return NextResponse.json({
        escrows: [],
        total: 0,
        message: 'No escrows found',
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch escrows', details: error.message },
      { status: 500 }
    );
  }
}
