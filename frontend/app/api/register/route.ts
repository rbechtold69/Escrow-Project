/**
 * ============================================================================
 * API ROUTE: /api/register
 * ============================================================================
 * 
 * User Registration Endpoint
 * 
 * This route creates a new user in the database after they've successfully
 * set up their Coinbase Smart Wallet. The wallet address becomes their
 * primary identifier (no passwords!).
 * 
 * FLOW:
 * 1. Frontend collects name + email
 * 2. Frontend triggers Smart Wallet creation (user sets up passkey)
 * 3. Smart Wallet returns address
 * 4. Frontend POSTs { address, name, email } here
 * 5. We create the user record
 * 
 * SECURITY:
 * - Wallet address is the immutable identifier
 * - No password stored (passkey auth only)
 * - Email is for notifications only
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const RegisterSchema = z.object({
  walletAddress: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address format'),
  displayName: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long'),
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email too long'),
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
    const validatedData = RegisterSchema.parse(body);
    
    // Normalize wallet address to lowercase (for consistent storage)
    const walletAddress = validatedData.walletAddress.toLowerCase();
    const email = validatedData.email.toLowerCase();
    
    console.log(`[REGISTER] New user registration: ${email}`);
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 2: Check if user already exists
    // ════════════════════════════════════════════════════════════════════════
    
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress },
    });
    
    if (existingUser) {
      console.log(`[REGISTER] User already exists: ${walletAddress}`);
      return NextResponse.json(
        { error: 'An account with this passkey already exists. Please sign in instead.' },
        { status: 409 } // Conflict
      );
    }
    
    // Check for duplicate email (optional - depends on your requirements)
    const existingEmail = await prisma.user.findFirst({
      where: { email },
    });
    
    if (existingEmail) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 3: Create user record
    // ════════════════════════════════════════════════════════════════════════
    // 
    // NOTE: The wallet address becomes the user's identity.
    // There is NO password field - authentication is via passkey.
    //
    // ════════════════════════════════════════════════════════════════════════
    
    const user = await prisma.user.create({
      data: {
        walletAddress,
        displayName: validatedData.displayName.trim(),
        email,
        role: 'ESCROW_OFFICER', // Default role for new users
        lastLoginAt: new Date(),
      },
    });
    
    console.log(`[REGISTER] User created successfully: ${user.id}`);
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: Return user data (excluding sensitive fields)
    // ════════════════════════════════════════════════════════════════════════
    
    return NextResponse.json({
      id: user.id,
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('[REGISTER] Error:', error);
    
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
    
    // Handle Prisma unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'An account with this information already exists.' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    );
  }
}
