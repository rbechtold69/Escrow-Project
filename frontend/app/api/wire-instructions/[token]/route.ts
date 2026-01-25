/**
 * ============================================================================
 * API ROUTE: /api/wire-instructions/[token]
 * ============================================================================
 *
 * Get wire instruction link status or full instructions
 *
 * GET: Fetch link status and escrow summary (always)
 *      Returns wire instructions only if verified
 *
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { secureLinkService } from '@/lib/secure-link-service';

// ============================================================================
// GET: Get link status or instructions
// ============================================================================

export async function GET(
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

    // Check if requesting instructions (after verification)
    const url = new URL(request.url);
    const getInstructions = url.searchParams.get('instructions') === 'true';

    // Get link status first
    const linkResult = await secureLinkService.getLink(token, ipAddress, userAgent);

    if (!linkResult.success) {
      return NextResponse.json(
        { error: linkResult.error || 'Link not found' },
        { status: 404 }
      );
    }

    // If requesting instructions and verified, return them
    if (getInstructions &&
        (linkResult.link?.status === 'VERIFIED' || linkResult.link?.status === 'VIEWED')) {
      const instructionsResult = await secureLinkService.getWireInstructions(
        token,
        ipAddress,
        userAgent
      );

      if (!instructionsResult.success) {
        return NextResponse.json(
          { error: instructionsResult.error || 'Failed to get instructions' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        link: linkResult.link,
        escrow: linkResult.escrow,
        instructions: instructionsResult.instructions,
      });
    }

    // Return link status and escrow summary (no instructions if not verified)
    return NextResponse.json({
      success: true,
      link: linkResult.link,
      escrow: linkResult.escrow,
      instructions: null, // Only returned after verification
    });
  } catch (error: any) {
    console.error('[API] wire-instructions/[token] error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE: Revoke link (officer action)
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    if (!body.revokedByWallet) {
      return NextResponse.json(
        { error: 'Wallet address is required to revoke' },
        { status: 400 }
      );
    }

    const result = await secureLinkService.revokeLink(
      token,
      body.revokedByWallet,
      body.reason
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to revoke link' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Link revoked successfully',
    });
  } catch (error: any) {
    console.error('[API] wire-instructions/[token] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
