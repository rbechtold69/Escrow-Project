/**
 * ============================================================================
 * ESCROW IMPORT API - Create Escrow from Qualia File
 * ============================================================================
 * 
 * WORKFLOW:
 * 1. Parse Qualia file (extracts escrow header + payees)
 * 2. Create escrow record with property/buyer details
 * 3. Tokenize bank details via Bridge.xyz
 * 4. Create Payee records with ONLY tokenized references
 * 5. Return escrow ID and wiring instructions
 * 
 * SECURITY:
 * ❌ We NEVER store: routing numbers, account numbers
 * ✅ We ONLY store: Bridge token ID, names, last 4 digits
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseQualiaExport } from '@/lib/qualia-parser';
import { getBridgeClient } from '@/lib/bridge-client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const officerWallet = formData.get('officerWallet') as string;
    const yieldEnabled = formData.get('yieldEnabled') === 'true';
    const multiApproval = formData.get('multiApproval') === 'true';
    const additionalSignersJson = formData.get('additionalSigners') as string;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    if (!officerWallet) {
      return NextResponse.json({ error: 'Officer wallet address required' }, { status: 400 });
    }
    
    // Read file content
    const fileContent = await file.text();
    const fileName = file.name;
    
    // Parse the file
    const parseResult = parseQualiaExport(fileContent, fileName);
    
    console.log('[Import API] Parse result:', {
      success: parseResult.success,
      hasEscrowHeader: !!parseResult.escrowHeader,
      itemCount: parseResult.items.length,
    });
    
    // Require escrow header for import
    if (!parseResult.escrowHeader) {
      return NextResponse.json({
        error: 'File must include escrow header section',
        details: 'Expected format with File Number, Property Address, City, State, Zip Code, Purchase Price, Buyer First Name, Buyer Last Name, Buyer Email',
        hint: 'Download the sample file to see the correct format',
      }, { status: 400 });
    }
    
    const header = parseResult.escrowHeader;
    
    // Generate escrow ID (use Qualia file number if provided, otherwise generate)
    let baseEscrowId = header.fileNumber || `ESC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    let escrowId = baseEscrowId;
    let qualiaFileNumber = header.fileNumber || undefined;
    
    // Check if escrow already exists with this file number
    // If so, auto-generate a unique suffix for demo convenience
    const existingEscrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: baseEscrowId },
          ...(header.fileNumber ? [{ qualiaFileNumber: header.fileNumber }] : []),
        ],
      },
    });
    
    if (existingEscrow) {
      // Auto-generate unique suffix for demo purposes
      const timestamp = Date.now().toString(36).toUpperCase();
      escrowId = `${baseEscrowId}-${timestamp}`;
      qualiaFileNumber = qualiaFileNumber ? `${qualiaFileNumber}-${timestamp}` : undefined;
      
      console.log(`[Import API] Duplicate detected. Generated unique ID: ${escrowId}`);
    }
    
    // Parse additional signers
    let additionalSigners: Array<{ walletAddress: string; displayName: string; role: string }> = [];
    if (additionalSignersJson) {
      try {
        additionalSigners = JSON.parse(additionalSignersJson);
      } catch (e) {
        console.error('[Import API] Failed to parse additional signers:', e);
      }
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // GET OR CREATE USER (ESCROW OFFICER)
    // ════════════════════════════════════════════════════════════════════════════
    
    const user = await prisma.user.upsert({
      where: { walletAddress: officerWallet },
      update: { lastLoginAt: new Date() },
      create: {
        walletAddress: officerWallet,
        displayName: 'Escrow Officer',
        role: 'ESCROW_OFFICER',
      },
    });
    
    // ════════════════════════════════════════════════════════════════════════════
    // CREATE ESCROW RECORD
    // ════════════════════════════════════════════════════════════════════════════
    
    const fullAddress = `${header.propertyAddress}, ${header.city}, ${header.state} ${header.zipCode}`;
    
    // Generate wiring instructions (demo/mock for now)
    const reference = `${escrowId}-${Date.now().toString(36).toUpperCase()}`;
    
    const escrow = await prisma.escrow.create({
      data: {
        escrowId,
        qualiaFileNumber,
        propertyAddress: fullAddress,
        city: header.city,
        state: header.state,
        zipCode: header.zipCode,
        purchasePrice: header.purchasePrice,
        buyerFirstName: header.buyerFirstName,
        buyerLastName: header.buyerLastName,
        buyerEmail: header.buyerEmail,
        createdById: user.id,
        status: 'CREATED',
        yieldEnabled,
        requiredApprovals: multiApproval ? (additionalSigners.length + 1) : 1,
        // Create signers (primary officer first, then additional)
        signers: {
          create: [
            {
              walletAddress: officerWallet,
              displayName: user.displayName || 'Primary Officer',
              role: 'Primary Officer',
              signerOrder: 1,
            },
            ...additionalSigners.map((signer, index) => ({
              walletAddress: signer.walletAddress,
              displayName: signer.displayName || `Signer ${index + 2}`,
              role: signer.role || 'Approver',
              signerOrder: index + 2,
            })),
          ],
        },
        closingDate: header.closingDate ? new Date(header.closingDate) : undefined,
      },
    });
    
    // Generate demo wiring instructions (returned in response, not stored)
    const wiringInstructions = {
      accountNumber: `DEMO-${escrowId.replace('ESC-', '')}`,
      routingNumber: '101019644',
      bankName: 'Lead Bank (Demo Mode)',
      bankAddress: '1801 Main St., Kansas City, MO 64108',
      swiftCode: 'LEABOREA',
      beneficiaryName: `EscrowPayi FBO ${header.buyerFirstName} ${header.buyerLastName}`,
      beneficiaryAddress: 'Custodial Services Division',
      reference,
    };
    
    // ════════════════════════════════════════════════════════════════════════════
    // TOKENIZE PAYEES VIA BRIDGE.XYZ
    // ════════════════════════════════════════════════════════════════════════════
    
    const createdPayees: Array<{
      name: string;
      amount: number;
      paymentMethod: string;
      status: 'success' | 'failed';
      error?: string;
    }> = [];
    
    let bridge: ReturnType<typeof getBridgeClient> | null = null;
    const isDemoMode = !process.env.BRIDGE_API_KEY;
    
    if (!isDemoMode) {
      try {
        bridge = getBridgeClient();
      } catch (e) {
        console.log('[Import API] Bridge not configured, using demo mode');
      }
    }
    
    for (const item of parseResult.items) {
      try {
        // Parse name into first/last
        const nameParts = item.payeeName.trim().split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'Payee';
        
        // Determine payment method based on amount
        const paymentMethod = item.amountDollars > 100000 ? 'WIRE' : 'ACH';
        
        let bridgeBeneficiaryId: string;
        
        if (bridge && item.routingNumber && item.accountNumber) {
          // PRODUCTION: Send bank details to Bridge.xyz for tokenization
          try {
            const externalAccount = await bridge.createExternalAccount(
              `import-${escrowId}-${item.lineNumber}`,
              {
                firstName,
                lastName,
                bankName: 'Bank from Qualia Import',
                routingNumber: item.routingNumber,
                accountNumber: item.accountNumber,
                accountType: item.accountType || 'checking',
                address: {
                  streetLine1: 'Address on file with Qualia',
                  city: 'City',
                  state: 'CA',
                  postalCode: '90001',
                  country: 'USA',
                },
              }
            );
            bridgeBeneficiaryId = externalAccount.id;
          } catch (bridgeError) {
            console.error(`[Import API] Bridge tokenization failed for ${item.payeeName}:`, bridgeError);
            bridgeBeneficiaryId = `demo_ext_${Date.now()}_${item.lineNumber}`;
          }
        } else {
          // DEMO MODE: Generate a demo token ID
          bridgeBeneficiaryId = `demo_ext_${Date.now()}_${item.lineNumber}`;
        }
        
        // Create Payee record with ONLY tokenized reference
        await prisma.payee.create({
          data: {
            escrowId: escrow.id,
            firstName,
            lastName,
            payeeType: 'OTHER',
            paymentMethod,
            bridgeBeneficiaryId,
            bankName: 'Qualia Import',
            accountLast4: item.accountNumber ? item.accountNumber.slice(-4) : undefined,
            amount: item.amountDollars,
            status: 'PENDING',
          },
        });
        
        createdPayees.push({
          name: item.payeeName,
          amount: item.amountDollars,
          paymentMethod,
          status: 'success',
        });
        
      } catch (error) {
        createdPayees.push({
          name: item.payeeName,
          amount: item.amountDollars,
          paymentMethod: 'UNKNOWN',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    // Count successes
    const successCount = createdPayees.filter(p => p.status === 'success').length;
    
    // Note: Status stays as CREATED until funds are received
    // The workflow is: CREATED → FUNDS_RECEIVED → READY_TO_CLOSE → CLOSED
    // Payees being configured doesn't change the status - funds must arrive first
    
    // ════════════════════════════════════════════════════════════════════════════
    // RETURN SUCCESS RESPONSE
    // ════════════════════════════════════════════════════════════════════════════
    
    return NextResponse.json({
      success: true,
      escrow: {
        id: escrow.id,
        escrowId: escrow.escrowId,
        qualiaFileNumber: header.fileNumber,
        propertyAddress: fullAddress,
        purchasePrice: header.purchasePrice,
        buyer: `${header.buyerFirstName} ${header.buyerLastName}`,
        buyerEmail: header.buyerEmail,
        yieldEnabled,
        requiredApprovals: escrow.requiredApprovals,
      },
      payees: {
        created: successCount,
        failed: createdPayees.filter(p => p.status === 'failed').length,
        total: parseResult.items.length,
        details: createdPayees,
      },
      wiringInstructions,
      message: `Escrow ${escrowId} created with ${successCount} payees imported`,
    });
    
  } catch (error) {
    console.error('[Import API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import escrow' },
      { status: 500 }
    );
  }
}
