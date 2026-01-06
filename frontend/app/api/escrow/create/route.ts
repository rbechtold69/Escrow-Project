import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createBridgeServiceAuto } from '@/lib/bridge-mock';
import { z } from 'zod';

// ============================================================
// POST /api/escrow/create
// Creates a new escrow with database persistence and mock Bridge integration
// ============================================================

const CreateEscrowSchema = z.object({
  propertyAddress: z.string().min(1, 'Property address is required'),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  purchasePrice: z.number().positive('Purchase price must be positive'),
  buyerFirstName: z.string().min(1, 'Buyer first name is required'),
  buyerLastName: z.string().min(1, 'Buyer last name is required'),
  buyerEmail: z.string().email('Valid buyer email is required'),
  officerAddress: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
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
        // Parse "CA 90210" format
        const stateZip = parts[2].trim().split(' ');
        state = stateZip[0] || '';
        zipCode = stateZip[1] || '';
      }
    }

    // Convert price from USDC decimals back to dollars
    const priceInDollars = validatedData.purchasePrice / 1_000_000;

    // 2. Generate escrow ID
    const year = new Date().getFullYear();
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const escrowId = `ESC-${year}-${randomNum}`;

    // 3. Get or create the user (escrow officer)
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
      // Create a default system user for testing
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

    // 4. Create virtual bank account via Bridge (mock)
    const bridgeService = createBridgeServiceAuto();
    const virtualAccount = await bridgeService.createVirtualAccount({
      escrowId,
      propertyAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
      buyerName: `${validatedData.buyerFirstName} ${validatedData.buyerLastName}`,
      buyerEmail: validatedData.buyerEmail || 'pending@example.com',
      expectedAmount: priceInDollars,
    });

    // 5. Generate mock contract addresses (in production, these would be real deployments)
    const mockSafeAddress = `0x${Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const mockVaultAddress = `0x${Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

    // 6. Create escrow in database
    const escrow = await prisma.escrow.create({
      data: {
        escrowId,
        propertyAddress: propertyAddress,
        city: city,
        state: state,
        zipCode: zipCode,
        purchasePrice: priceInDollars,
        buyerFirstName: validatedData.buyerFirstName || 'Pending',
        buyerLastName: validatedData.buyerLastName || 'Buyer',
        buyerEmail: validatedData.buyerEmail || 'pending@example.com',
        bridgeVirtualAccountId: virtualAccount.id,
        vaultAddress: mockVaultAddress,
        safeAddress: mockSafeAddress,
        status: 'CREATED',
        createdById: user.id,
      },
    });

    // 7. Create activity log
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'ESCROW_CREATED',
        details: {
          escrowId: escrowId,
          propertyAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
          purchasePrice: priceInDollars,
        },
        actorWallet: validatedData.officerAddress || null,
      },
    });

    // 8. Build wiring instructions from virtual account
    const wiringInstructions = {
      accountNumber: virtualAccount.account_number,
      routingNumber: virtualAccount.routing_number,
      bankName: virtualAccount.bank_name,
      bankAddress: '123 Financial District, San Francisco, CA 94102',
      beneficiaryName: virtualAccount.beneficiary_name,
      beneficiaryAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
      reference: escrowId,
      swiftCode: 'CHASUS33',
    };

    // 9. Log for debugging
    console.log('[Escrow] Created escrow:', {
      escrowId,
      propertyAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
      purchasePrice: `$${priceInDollars.toLocaleString()}`,
      bridgeAccountId: virtualAccount.id,
      dbId: escrow.id,
    });

    // 10. Return success response
    return NextResponse.json({
      success: true,
      escrowId: escrowId,
      escrow: {
        id: escrow.id,
        escrowId: escrowId,
        propertyAddress: `${propertyAddress}, ${city}, ${state} ${zipCode}`,
        purchasePrice: priceInDollars,
        safeAddress: mockSafeAddress,
        vaultAddress: mockVaultAddress,
        status: 'CREATED',
        createdAt: escrow.createdAt.toISOString(),
      },
      wiringInstructions,
      message: process.env.BRIDGE_USE_MOCK === 'true' 
        ? 'TEST MODE: Using mock Bridge service.' 
        : 'Escrow created successfully.',
    });

  } catch (error: any) {
    console.error('Create escrow error:', error);
    
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

// ============================================================
// GET /api/escrow/create - Debug info
// ============================================================

export async function GET(request: NextRequest) {
  const apiKey = process.env.BRIDGE_API_KEY;
  const useMockEnv = process.env.BRIDGE_USE_MOCK;
  
  return NextResponse.json({
    message: 'Use POST to create an escrow',
    debug: {
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET',
      bridgeUseMockValue: useMockEnv,
      bridgeUseMockType: typeof useMockEnv,
      willUseMock: useMockEnv === 'true' || !apiKey,
      bridgeApiUrl: process.env.BRIDGE_API_URL || 'NOT SET',
    },
  });
}
