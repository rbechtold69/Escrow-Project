/**
 * ============================================================================
 * API ROUTE: /api/auth/login
 * ============================================================================
 * 
 * Updates user's lastLoginAt timestamp.
 * 
 * Called after successful verification during login flow.
 * Fire-and-forget - frontend doesn't need to wait for response.
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;
    
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      );
    }
    
    // Normalize to lowercase
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Update last login timestamp
    const user = await prisma.user.update({
      where: { walletAddress: normalizedAddress },
      data: { lastLoginAt: new Date() },
      select: {
        id: true,
        lastLoginAt: true,
      },
    });
    
    console.log(`[AUTH/LOGIN] User login: ${user.id}`);
    
    return NextResponse.json({
      success: true,
      lastLoginAt: user.lastLoginAt,
    });
    
  } catch (error: any) {
    // Log but don't fail - this is fire-and-forget
    console.error('[AUTH/LOGIN] Error:', error);
    
    // Return success anyway - this is non-critical
    return NextResponse.json({ success: true });
  }
}
