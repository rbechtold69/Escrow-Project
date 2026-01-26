/**
 * ============================================================================
 * API ROUTE: /api/wire-instructions/[token]/resend-code
 * ============================================================================
 *
 * Request a new SMS verification code
 *
 * POST: Generate and send a new verification code
 *
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { secureLinkService } from '@/lib/secure-link-service';

// ============================================================================
// POST: Resend verification code
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Get client info for logging
    const ipAddress = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await secureLinkService.requestVerificationCode(
      token,
      ipAddress,
      userAgent
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send code' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      expiresAt: result.expiresAt?.toISOString(),
      message: result.demoCode
        ? 'Demo mode: Code shown on screen (SMS simulated)'
        : 'Verification code sent',
      demoCode: result.demoCode || undefined,
    });
  } catch (error: any) {
    console.error('[API] wire-instructions/[token]/resend-code error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
