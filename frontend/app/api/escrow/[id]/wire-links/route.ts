/**
 * ============================================================================
 * API ROUTE: /api/escrow/[id]/wire-links
 * ============================================================================
 *
 * Get all secure wire links for an escrow
 *
 * GET: Fetch all wire links with access logs
 *
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { secureLinkService } from '@/lib/secure-link-service';

// ============================================================================
// GET: Get wire links for an escrow
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: escrowId } = await params;

    if (!escrowId) {
      return NextResponse.json(
        { error: 'Escrow ID is required' },
        { status: 400 }
      );
    }

    const result = await secureLinkService.getLinksForEscrow(escrowId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to get links' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      links: result.links,
    });
  } catch (error: any) {
    console.error('[API] escrow/[id]/wire-links error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
