/**
 * ============================================================================
 * API ROUTE: /api/escrow/create
 * ============================================================================
 * 
 * Creates a new escrow with:
 * 1. Bridge.xyz custodial wallet (segregated per escrow)
 * 2. Bridge.xyz virtual account (wire/ACH deposit instructions)
 * 3. Database record with all Bridge references
 * 
 * COMPLIANCE:
 * ✅ Non-Commingling: Each escrow gets its own wallet
 * ✅ No Money Transmission: Bridge is the custodian
 * ✅ Audit Trail: All Bridge IDs stored for tracking
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBridgeClient, formatWiringInstructions } from '@/lib/bridge-client';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const SignerSchema = z.object({
  walletAddress: z.string().min(1, 'Wallet address is required'),
  displayName: z.string().optional(),
  role: z.string().default('Approver'),
});

const CreateEscrowSchema = z.object({
  propertyAddress: z.string().min(1, 'Property address is required'),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  purchasePrice: z.number().positive('Purchase price must be positive'),
  buyerFirstName: z.string().min(1, 'Buyer first name is required'),
  buyerLastName: z.string().min(1, 'Buyer last name is required'),
  buyerEmail: z.string().email('Valid buyer email is required'),
  buyerPhone: z.string().optional(), // Phone for SMS verification (+1XXXXXXXXXX format)
  officerAddress: z.string().optional(),
  // Yield preference: true = USDB (earn yield), false = USDC (no yield)
  yieldEnabled: z.boolean().optional().default(true),
  // Approval settings
  requiredApprovals: z.number().int().min(1).max(5).optional().default(1),
  additionalSigners: z.array(SignerSchema).optional().default([]),
});

// ============================================================================
// POST: Create a new escrow
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // ════════════════════════════════════════════════════════════════════════
    // STEP 1: Parse and validate request body
    // ════════════════════════════════════════════════════════════════════════
    
    const body = await request.json();
    const validatedData = CreateEscrowSchema.parse(body);

    // Parse address components if full address provided
    let propertyAddress = validatedData.propertyAddress;
    let city = validatedData.city || '';
    let state = validatedData.state || '';
    let zipCode = validatedData.zipCode || '';

    // If propertyAddress contains full address, try to parse it
    if (propertyAddress.includes(',') && !city) {
      const parts = propertyAddress.split(',').map(p => p.trim());
      if (parts.length >= 3) {
        propertyAddress = parts[0];
        city = parts[1];
        const stateZip = parts[2].trim().split(' ');
        state = stateZip[0] || '';
        zipCode = stateZip[1] || '';
      }
    }

    // Convert price from USDC decimals back to dollars (if needed)
    const priceInDollars = validatedData.purchasePrice > 1000000 
      ? validatedData.purchasePrice / 1_000_000 
      : validatedData.purchasePrice;

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2: Generate escrow ID
    // ════════════════════════════════════════════════════════════════════════
    
    const year = new Date().getFullYear();
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const escrowId = `ESC-${year}-${randomNum}`;

    console.log(`[Escrow] Creating escrow: ${escrowId}`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3: Get or create the user (escrow officer)
    // ════════════════════════════════════════════════════════════════════════
    
    let user = null;
    if (validatedData.officerAddress) {
      user = await prisma.user.upsert({
        where: { walletAddress: validatedData.officerAddress },
        update: { lastLoginAt: new Date() },
        create: {
          walletAddress: validatedData.officerAddress,
          displayName: 'Escrow Officer',
          role: 'ESCROW_OFFICER',
        },
      });
    } else {
      user = await prisma.user.upsert({
        where: { walletAddress: '0x0000000000000000000000000000000000000000' },
        update: {},
        create: {
          walletAddress: '0x0000000000000000000000000000000000000000',
          displayName: 'System',
          role: 'ADMIN',
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: Create Bridge.xyz wallet and virtual account
    // ════════════════════════════════════════════════════════════════════════
    
    let bridgeWallet = null;
    let bridgeVirtualAccount = null;
    let wiringInstructions = null;

    try {
      const bridge = getBridgeClient();

      // 4a. Create a segregated custodial wallet for this escrow
      console.log(`[Escrow] Creating Bridge wallet for ${escrowId}...`);
      bridgeWallet = await bridge.createWallet(escrowId, 'base');
      console.log(`[Escrow] ✅ Wallet created: ${bridgeWallet.id}`);

      // 4b. Create a virtual account that deposits to this wallet
      // Buyer's preference: USDB (yield-earning) or USDC (no yield)
      const yieldEnabled = validatedData.yieldEnabled !== false; // Default to true
      console.log(`[Escrow] Creating Bridge virtual account for ${escrowId} (yield: ${yieldEnabled ? 'ON' : 'OFF'})...`);
      bridgeVirtualAccount = await bridge.createVirtualAccount(escrowId, bridgeWallet.id, yieldEnabled);
      console.log(`[Escrow] ✅ Virtual account created: ${bridgeVirtualAccount.id}`);

      // 4c. Extract wiring instructions
      wiringInstructions = formatWiringInstructions(bridgeVirtualAccount);

    } catch (bridgeError: any) {
      console.error(`[Escrow] Bridge API error:`, bridgeError.message);
      
      // Fall back to mock data for demo purposes
      console.log(`[Escrow] Falling back to mock wiring instructions`);
      wiringInstructions = {
        bankName: 'Lead Bank (Demo Mode)',
        bankAddress: '1801 Main St., Kansas City, MO 64108',
        routingNumber: '101019644',
        accountNumber: `DEMO-${escrowId.replace('ESC-', '')}`,
        beneficiaryName: `EscrowPayi FBO ${validatedData.buyerFirstName} ${validatedData.buyerLastName}`,
        beneficiaryAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
        reference: escrowId,
        paymentMethods: ['ach_push', 'wire'],
      };
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 5: Create escrow in database
    // ════════════════════════════════════════════════════════════════════════
    
    // Store yield preference
    const yieldEnabled = validatedData.yieldEnabled !== false;
    
    // Approval settings
    const requiredApprovals = validatedData.requiredApprovals || 1;
    const additionalSigners = validatedData.additionalSigners || [];
    
    const escrow = await prisma.escrow.create({
      data: {
        escrowId,
        propertyAddress: propertyAddress,
        city: city,
        state: state,
        zipCode: zipCode,
        purchasePrice: priceInDollars,
        buyerFirstName: validatedData.buyerFirstName,
        buyerLastName: validatedData.buyerLastName,
        buyerEmail: validatedData.buyerEmail,
        buyerPhone: validatedData.buyerPhone || null,

        // Bridge.xyz references
        bridgeWalletId: bridgeWallet?.id || null,
        bridgeWalletAddress: bridgeWallet?.address || null,
        bridgeVirtualAccountId: bridgeVirtualAccount?.id || null,
        
        // Approval settings
        requiredApprovals: requiredApprovals,
        
        // Yield preference (buyer's choice)
        yieldEnabled: yieldEnabled,
        
        // Legacy fields (keeping for backward compatibility)
        vaultAddress: bridgeWallet?.address || null,
        safeAddress: bridgeWallet?.address || null,
        
        status: 'CREATED',
        createdById: user.id,
        
        // Create signers (primary officer first, then additional)
        signers: {
          create: [
            // Primary officer (the creator)
            {
              walletAddress: validatedData.officerAddress || user.walletAddress,
              displayName: user.displayName || 'Primary Officer',
              role: 'Primary Officer',
              signerOrder: 1,
            },
            // Additional signers
            ...additionalSigners.map((signer, index) => ({
              walletAddress: signer.walletAddress,
              displayName: signer.displayName || null,
              role: signer.role || 'Approver',
              signerOrder: index + 2,
            })),
          ],
        },
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // STEP 6: Create activity log
    // ════════════════════════════════════════════════════════════════════════
    
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'ESCROW_CREATED',
        details: {
          escrowId: escrowId,
          propertyAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
          purchasePrice: priceInDollars,
          bridgeWalletId: bridgeWallet?.id,
          bridgeVirtualAccountId: bridgeVirtualAccount?.id,
        },
        actorWallet: validatedData.officerAddress || null,
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // STEP 7: Return success response
    // ════════════════════════════════════════════════════════════════════════
    
    console.log(`[Escrow] ✅ Escrow created successfully: ${escrowId}`);

    return NextResponse.json({
      success: true,
      escrowId: escrowId,
      escrow: {
        id: escrow.id,
        escrowId: escrowId,
        propertyAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
        purchasePrice: priceInDollars,
        safeAddress: bridgeWallet?.address || escrow.safeAddress,
        vaultAddress: bridgeWallet?.address || escrow.vaultAddress,
        status: 'CREATED',
        createdAt: escrow.createdAt.toISOString(),
      },
      bridge: {
        walletId: bridgeWallet?.id || null,
        walletAddress: bridgeWallet?.address || null,
        virtualAccountId: bridgeVirtualAccount?.id || null,
        isLive: !!bridgeWallet,
      },
      wiringInstructions: {
        accountNumber: wiringInstructions.accountNumber,
        routingNumber: wiringInstructions.routingNumber,
        bankName: wiringInstructions.bankName,
        bankAddress: wiringInstructions.bankAddress,
        beneficiaryName: wiringInstructions.beneficiaryName,
        beneficiaryAddress: wiringInstructions.beneficiaryAddress,
        reference: escrowId,
        swiftCode: 'LEABOREA', // Lead Bank SWIFT code
        paymentMethods: wiringInstructions.paymentMethods,
      },
      // Interest settings (internal use - not shown to users)
      interestEarning: {
        enabled: yieldEnabled,
        description: yieldEnabled 
          ? 'Your funds will earn interest while in escrow. All interest will be returned to you at close.'
          : 'Your funds will be held securely with no interest earned.',
      },
      message: bridgeWallet 
        ? `Escrow created successfully${yieldEnabled ? ' with interest-earning enabled' : ''}` 
        : 'Escrow created in demo mode',
    });

  } catch (error: any) {
    console.error('[Escrow] Create error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create escrow', details: String(error.message || error) },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET: Info endpoint
// ============================================================================

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/escrow/create',
    method: 'POST',
    description: 'Create a new escrow with Bridge.xyz integration',
    features: {
      'Segregated Wallet': 'Each escrow gets its own Bridge wallet',
      'Virtual Account': 'Wire/ACH deposit instructions generated',
      'Auto-Conversion': 'USD deposits convert to USDC automatically',
    },
    requiredFields: {
      propertyAddress: 'string',
      purchasePrice: 'number (USD)',
      buyerFirstName: 'string',
      buyerLastName: 'string',
      buyerEmail: 'string',
    },
  });
}
