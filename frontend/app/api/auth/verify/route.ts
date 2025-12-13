/**
 * ============================================================================
 * API ROUTE: /api/auth/verify
 * ============================================================================
 * 
 * Verifies if a wallet address belongs to a registered user.
 * 
 * Used during login flow:
 * 1. User authenticates with passkey (Coinbase Smart Wallet)
 * 2. Frontend gets their wallet address
 * 3. Frontend calls this endpoint to verify they're registered
 * 4. If registered → grant access
 * 5. If not → prompt to sign up
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    
    // ════════════════════════════════════════════════════════════════════════
    // Validate address format
    // ════════════════════════════════════════════════════════════════════════
    
    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter required' },
        { status: 400 }
      );
    }
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      );
    }
    
    // Normalize to lowercase
    const normalizedAddress = address.toLowerCase();
    
    // ════════════════════════════════════════════════════════════════════════
    // Look up user by wallet address
    // ════════════════════════════════════════════════════════════════════════
    
    const user = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
      select: {
        id: true,
        walletAddress: true,
        displayName: true,
        email: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    
    // ════════════════════════════════════════════════════════════════════════
    // Return 404 if user doesn't exist (frontend will prompt signup)
    // ════════════════════════════════════════════════════════════════════════
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // Return user data
    // ════════════════════════════════════════════════════════════════════════
    
    return NextResponse.json(user);
    
  } catch (error: any) {
    console.error('[AUTH/VERIFY] Error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}
