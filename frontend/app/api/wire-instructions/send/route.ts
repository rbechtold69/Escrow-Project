/**
 * ============================================================================
 * API ROUTE: /api/wire-instructions/send
 * ============================================================================
 *
 * Generate and send a secure wire instruction link to the buyer
 *
 * POST: Create a new secure link and email it to the buyer
 *
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { secureLinkService } from '@/lib/secure-link-service';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const SendWireInstructionsSchema = z.object({
  escrowId: z.string().min(1, 'Escrow ID is required'),
  sentByWallet: z.string().min(1, 'Wallet address is required'),
  sentByName: z.string().optional(),
});

// ============================================================================
// POST: Send secure wire instruction link
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = SendWireInstructionsSchema.parse(body);

    const result = await secureLinkService.createLink({
      escrowId: validated.escrowId,
      sentByWallet: validated.sentByWallet,
      sentByName: validated.sentByName,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create link' },
        { status: 400 }
      );
    }

    // In demo mode (no Twilio/Resend configured), return the link URL
    // so the dashboard can show it directly
    const isDemoMode = !process.env.TWILIO_ACCOUNT_SID || !process.env.RESEND_API_KEY;
    const baseUrl = process.env.WIRE_PORTAL_BASE_URL || `${request.headers.get('origin') || 'http://localhost:3000'}/verify-wire`;
    const linkUrl = `${baseUrl}/${result.token}`;

    return NextResponse.json({
      success: true,
      linkId: result.linkId,
      token: result.token,
      expiresAt: result.expiresAt?.toISOString(),
      message: isDemoMode
        ? 'Demo mode: Link generated (email simulated)'
        : 'Secure wire instruction link sent to buyer',
      demoMode: isDemoMode,
      linkUrl: isDemoMode ? linkUrl : undefined,
    });
  } catch (error: any) {
    console.error('[API] wire-instructions/send error:', error);

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

// ============================================================================
// GET: Info endpoint
// ============================================================================

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/wire-instructions/send',
    method: 'POST',
    description: 'Send secure wire instruction link to buyer',
    requiredFields: {
      escrowId: 'string - The escrow ID (e.g., ESC-2026-123456)',
      sentByWallet: 'string - Wallet address of the officer sending',
    },
    optionalFields: {
      sentByName: 'string - Name of the officer for display',
    },
  });
}
