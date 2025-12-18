/**
 * ============================================================================
 * API ROUTE: /api/escrow/close
 * ============================================================================
 * 
 * Close Escrow Flow:
 * 
 * 1. Verify escrow is ready to close (funded, payees configured)
 * 2. Call smart contract to swap USDM → USDC
 * 3. Calculate yield (final balance - initial deposit)
 * 4. Distribute:
 *    - Principal to payees via Bridge.xyz
 *    - Yield rebate to Buyer
 *    - Platform fee (if any)
 * 5. Update database status
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  publicClient, 
  getWalletClient,
  ESCROW_VAULT_ABI,
  CONTRACTS,
} from '@/lib/contract-client';
import { createBridgeService } from '@/lib/bridge-service';
import { parseUnits, formatUnits, type Address } from 'viem';
import { z } from 'zod';

// ============================================================================
// INPUT VALIDATION
// ============================================================================

const CloseEscrowSchema = z.object({
  escrowId: z.string().min(1, 'Escrow ID is required'),
  // Slippage tolerance for USDM → USDC swap (default 0.5%)
  slippageBps: z.number().min(0).max(500).default(50),
});

// ============================================================================
// TYPES
// ============================================================================

interface YieldBreakdown {
  initialDepositUSDC: bigint;
  finalBalanceUSDC: bigint;
  totalYield: bigint;
  platformFee: bigint;
  buyerRebate: bigint;
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // ════════════════════════════════════════════════════════════════════════
    // STEP 1: Parse and validate input
    // ════════════════════════════════════════════════════════════════════════
    
    const body = await request.json();
    const { escrowId, slippageBps } = CloseEscrowSchema.parse(body);
    
    console.log(`[CLOSE_ESCROW] Starting close for escrow: ${escrowId}`);
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 2: Fetch escrow and validate state
    // ════════════════════════════════════════════════════════════════════════
    
    const escrow = await prisma.escrow.findUnique({
      where: { escrowId },
      include: {
        payees: {
          where: { status: 'PENDING' },
        },
      },
    });
    
    if (!escrow) {
      return NextResponse.json({ error: 'Escrow not found' }, { status: 404 });
    }
    
    if (escrow.status !== 'FUNDS_RECEIVED' && escrow.status !== 'READY_TO_CLOSE') {
      return NextResponse.json(
        { error: `Cannot close escrow in status: ${escrow.status}` },
        { status: 400 }
      );
    }
    
    if (!escrow.vaultAddress) {
      return NextResponse.json(
        { error: 'Escrow vault not deployed' },
        { status: 400 }
      );
    }
    
    if (escrow.payees.length === 0) {
      return NextResponse.json(
        { error: 'No payees configured for this escrow' },
        { status: 400 }
      );
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 3: Update status to CLOSING
    // ════════════════════════════════════════════════════════════════════════
    
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: 'CLOSING' },
    });
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: Get current vault balance and calculate yield
    // ════════════════════════════════════════════════════════════════════════
    
    const vaultAddress = escrow.vaultAddress as Address;
    
    // Read current USDM balance and estimated USDC value
    const [currentUSDMBalance, estimatedUSDCValue, initialDeposit] = await Promise.all([
      publicClient.readContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'getCurrentUSDMBalance',
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'getEstimatedUSDCValue',
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'initialDepositUSDC',
      }),
    ]);
    
    console.log(`[CLOSE_ESCROW] Current USDM: ${formatUnits(currentUSDMBalance as bigint, 18)}`);
    console.log(`[CLOSE_ESCROW] Estimated USDC: ${formatUnits(estimatedUSDCValue as bigint, 6)}`);
    console.log(`[CLOSE_ESCROW] Initial deposit: ${formatUnits(initialDeposit as bigint, 6)}`);
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 5: Call closeEscrow on smart contract
    // ════════════════════════════════════════════════════════════════════════
    // 
    // The contract will:
    // 1. Swap all USDM → USDC via Aerodrome
    // 2. Calculate yield (final - initial)
    // 3. Distribute to payees (configured in contract)
    // 4. Send yield rebate to buyer
    // 5. Send platform fee to platform wallet
    // 
    // ════════════════════════════════════════════════════════════════════════
    
    // Calculate minimum USDC output with slippage tolerance
    const estimatedUSDC = estimatedUSDCValue as bigint;
    const minUSDCOut = estimatedUSDC - (estimatedUSDC * BigInt(slippageBps) / BigInt(10000));
    
    console.log(`[CLOSE_ESCROW] Min USDC out (${slippageBps}bps slippage): ${formatUnits(minUSDCOut, 6)}`);
    
    // Get wallet client for signing
    const walletClient = getWalletClient();
    
    // Simulate the transaction first
    const { request: closeRequest } = await publicClient.simulateContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'closeEscrow',
      args: [minUSDCOut],
      account: walletClient.account,
    });
    
    // Execute the transaction
    const closeTxHash = await walletClient.writeContract(closeRequest);
    console.log(`[CLOSE_ESCROW] Transaction submitted: ${closeTxHash}`);
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: closeTxHash,
      confirmations: 2,
    });
    
    if (receipt.status !== 'success') {
      throw new Error('Close escrow transaction failed');
    }
    
    console.log(`[CLOSE_ESCROW] Transaction confirmed in block ${receipt.blockNumber}`);
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 6: Parse events to get actual yield breakdown
    // ════════════════════════════════════════════════════════════════════════
    
    // Find EscrowClosed event in logs
    const escrowClosedEvent = receipt.logs.find(log => {
      try {
        // Check if this is the EscrowClosed event
        return log.topics[0] === '0x...'; // Would be the actual event signature
      } catch {
        return false;
      }
    });
    
    // For now, calculate based on estimated values
    const yieldBreakdown: YieldBreakdown = {
      initialDepositUSDC: initialDeposit as bigint,
      finalBalanceUSDC: estimatedUSDC,
      totalYield: estimatedUSDC > (initialDeposit as bigint) 
        ? estimatedUSDC - (initialDeposit as bigint) 
        : BigInt(0),
      platformFee: BigInt(0), // Would be parsed from event
      buyerRebate: BigInt(0),  // Would be parsed from event
    };
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 7: Initiate fiat payouts via Bridge.xyz
    // ════════════════════════════════════════════════════════════════════════
    // 
    // The smart contract sent USDC to Bridge's liquidation address.
    // Now we tell Bridge how to distribute the fiat to each payee.
    // 
    // ════════════════════════════════════════════════════════════════════════
    
    const bridgeService = createBridgeService();
    
    // Process each payee
    for (const payee of escrow.payees) {
      try {
        // Calculate payee's amount
        let payeeAmount: number;
        if (payee.basisPoints) {
          // Percentage-based
          payeeAmount = Number(escrow.purchasePrice) * (payee.basisPoints / 10000);
        } else {
          payeeAmount = Number(payee.amount) || 0;
        }
        
        if (payeeAmount <= 0) continue;
        
        // Initiate transfer via Bridge
        const transfer = await bridgeService.initiateTransfer({
          amount: payeeAmount,
          currency: 'usd',
          destination_account_id: payee.bridgeBeneficiaryId,
          memo: `Escrow ${escrowId} - ${payee.firstName} ${payee.lastName}`,
          metadata: {
            escrow_id: escrowId,
            payee_id: payee.id,
            payee_type: payee.payeeType,
          },
        });
        
        // Update payee status
        await prisma.payee.update({
          where: { id: payee.id },
          data: {
            status: 'PROCESSING',
            bridgeTransferId: transfer.id,
          },
        });
        
        console.log(`[CLOSE_ESCROW] Initiated transfer for ${payee.firstName} ${payee.lastName}: $${payeeAmount}`);
        
      } catch (err: any) {
        console.error(`[CLOSE_ESCROW] Failed to process payee ${payee.id}:`, err.message);
        
        await prisma.payee.update({
          where: { id: payee.id },
          data: { status: 'FAILED' },
        });
      }
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 8: Update escrow status and record yield
    // ════════════════════════════════════════════════════════════════════════
    
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closeTxHash: closeTxHash,
      },
    });
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 9: Create audit log
    // ════════════════════════════════════════════════════════════════════════
    
    await prisma.activityLog.create({
      data: {
        escrowId: escrow.id,
        action: 'ESCROW_CLOSED',
        details: {
          closeTxHash,
          initialDeposit: formatUnits(yieldBreakdown.initialDepositUSDC, 6),
          finalBalance: formatUnits(yieldBreakdown.finalBalanceUSDC, 6),
          totalYield: formatUnits(yieldBreakdown.totalYield, 6),
          payeesProcessed: escrow.payees.length,
        },
        actorWallet: request.headers.get('x-wallet-address') || null,
        actorIp: request.headers.get('x-forwarded-for')?.split(',')[0] || null,
      },
    });
    
    // ════════════════════════════════════════════════════════════════════════
    // STEP 10: Return success
    // ════════════════════════════════════════════════════════════════════════
    
    console.log(`[CLOSE_ESCROW] Successfully closed escrow: ${escrowId}`);
    
    return NextResponse.json({
      success: true,
      escrowId,
      closeTxHash,
      yieldBreakdown: {
        initialDeposit: formatUnits(yieldBreakdown.initialDepositUSDC, 6),
        finalBalance: formatUnits(yieldBreakdown.finalBalanceUSDC, 6),
        totalYield: formatUnits(yieldBreakdown.totalYield, 6),
        buyerRebate: formatUnits(yieldBreakdown.buyerRebate, 6),
      },
      payeesProcessed: escrow.payees.length,
      status: 'CLOSED',
    });
    
  } catch (error: any) {
    console.error('[CLOSE_ESCROW] Error:', error.message);
    
    // Try to revert status if we failed
    try {
      const body = await request.clone().json();
      if (body.escrowId) {
        await prisma.escrow.update({
          where: { escrowId: body.escrowId },
          data: { status: 'FUNDS_RECEIVED' }, // Revert to previous status
        });
      }
    } catch {}
    
    return NextResponse.json(
      { error: 'Failed to close escrow. Please try again.' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET: Get close escrow preview (yield calculation)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const escrowId = searchParams.get('escrowId');
    
    if (!escrowId) {
      return NextResponse.json({ error: 'escrowId required' }, { status: 400 });
    }
    
    const escrow = await prisma.escrow.findUnique({
      where: { escrowId },
      include: {
        payees: {
          where: { status: 'PENDING' },
        },
      },
    });
    
    if (!escrow || !escrow.vaultAddress) {
      return NextResponse.json({ error: 'Escrow not found' }, { status: 404 });
    }
    
    const vaultAddress = escrow.vaultAddress as Address;
    
    // Get current yield data from contract
    const [estimatedUSDCValue, estimatedYield, initialDeposit, timeElapsed] = await Promise.all([
      publicClient.readContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'getEstimatedUSDCValue',
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'getEstimatedYield',
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'initialDepositUSDC',
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'getTimeElapsed',
      }),
    ]);
    
    // Calculate payee totals
    let totalToPayees = 0;
    for (const payee of escrow.payees) {
      if (payee.basisPoints) {
        totalToPayees += Number(escrow.purchasePrice) * (payee.basisPoints / 10000);
      } else {
        totalToPayees += Number(payee.amount) || 0;
      }
    }
    
    const estimatedYieldUSD = Number(formatUnits(estimatedYield as bigint, 6));
    const platformFeeRate = 0.005; // 0.5% platform fee from yield
    const platformFee = estimatedYieldUSD * platformFeeRate;
    const buyerRebate = estimatedYieldUSD - platformFee;
    
    return NextResponse.json({
      escrowId,
      canClose: escrow.status === 'FUNDS_RECEIVED' || escrow.status === 'READY_TO_CLOSE',
      preview: {
        initialDeposit: formatUnits(initialDeposit as bigint, 6),
        currentValue: formatUnits(estimatedUSDCValue as bigint, 6),
        estimatedYield: formatUnits(estimatedYield as bigint, 6),
        timeElapsedDays: Number(timeElapsed) / 86400,
        annualizedAPY: '5.00', // USDM target APY
        
        distribution: {
          totalToPayees: totalToPayees.toFixed(2),
          platformFee: platformFee.toFixed(2),
          buyerYieldRebate: buyerRebate.toFixed(2),
        },
        
        payeeCount: escrow.payees.length,
        buyer: {
          name: `${escrow.buyerFirstName} ${escrow.buyerLastName}`,
          email: escrow.buyerEmail,
        },
      },
    });
    
  } catch (error: any) {
    console.error('[CLOSE_PREVIEW] Error:', error.message);
    return NextResponse.json({ error: 'Failed to get close preview' }, { status: 500 });
  }
}
