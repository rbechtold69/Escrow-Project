/**
 * ============================================================================
 * API ROUTE: /api/wire-instructions/verify
 * ============================================================================
 *
 * Verify SMS code for wire instruction access
 *
 * POST: Verify the SMS verification code
 *
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { secureLinkService } from '@/lib/secure-link-service';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const VerifyCodeSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

// ============================================================================
// POST: Verify SMS code
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = VerifyCodeSchema.parse(body);

    // Get client info for logging
    const ipAddress = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await secureLinkService.verifyCode(
      validated.token,
      validated.code,
      ipAddress,
      userAgent
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Verification failed' },
        { status: 400 }
      );
    }

    if (result.locked) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          locked: true,
          message: 'Too many failed attempts. Please contact your escrow officer.',
        },
        { status: 429 }
      );
    }

    if (!result.verified) {
      return NextResponse.json({
        success: true,
        verified: false,
        attemptsRemaining: result.attemptsRemaining,
        message: 'Incorrect verification code',
      });
    }

    return NextResponse.json({
      success: true,
      verified: true,
      message: 'Verification successful',
    });
  } catch (error: any) {
    console.error('[API] wire-instructions/verify error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
