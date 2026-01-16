/**
 * ============================================================================
 * API ROUTE: /api/escrow/[id]/deposit-history
 * ============================================================================
 * 
 * Returns the deposit lifecycle history for an escrow from Bridge.xyz
 * 
 * Events include:
 * - funds_received: Fiat funds arrived at virtual account
 * - payment_submitted: USDB conversion in progress
 * - payment_processed: USDB delivered to wallet (final)
 * - funds_scheduled: ACH funds in transit
 * - in_review: Under manual review
 * - refunded: Funds returned to sender
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBridgeClient, VirtualAccountEvent, calculateYieldEarned } from '@/lib/bridge-client';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const escrowId = params.id;
    
    // Find escrow
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: escrowId },
          { id: escrowId },
        ],
      },
    });
    
    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }
    
    if (!escrow.bridgeVirtualAccountId) {
      return NextResponse.json({
        success: true,
        hasVirtualAccount: false,
        message: 'No virtual account configured for this escrow',
        events: [],
        summary: null,
      });
    }
    
    // Get Bridge client
    let events: VirtualAccountEvent[] = [];
    let walletBalance = {
      usdb: 0,
      usdc: 0,
      total: 0,
    };
    
    try {
      const bridge = getBridgeClient();
      
      // Fetch virtual account history
      const history = await bridge.getVirtualAccountHistory(escrow.bridgeVirtualAccountId);
      events = history.data || [];
      
      // Fetch wallet balance (includes yield)
      if (escrow.bridgeWalletId) {
        const wallet = await bridge.getWallet(escrow.bridgeWalletId);
        const usdbBalance = wallet.balances?.find(b => b.currency === 'usdb');
        const usdcBalance = wallet.balances?.find(b => b.currency === 'usdc');
        walletBalance = {
          usdb: parseFloat(usdbBalance?.balance || '0'),
          usdc: parseFloat(usdcBalance?.balance || '0'),
          total: parseFloat(usdbBalance?.balance || '0') + parseFloat(usdcBalance?.balance || '0'),
        };
      }
    } catch (bridgeError: any) {
      console.log('[DEPOSIT_HISTORY] Bridge API not available:', bridgeError.message);
      
      // Return mock data for demo
      return NextResponse.json({
        success: true,
        hasVirtualAccount: true,
        virtualAccountId: escrow.bridgeVirtualAccountId,
        mode: 'demo',
        events: [],
        summary: {
          totalDeposited: Number(escrow.initialDeposit || escrow.purchasePrice || 0),
          currentBalance: Number(escrow.currentBalance || escrow.initialDeposit || escrow.purchasePrice || 0),
          yieldEarned: 0,
          currency: 'USDB',
          depositCount: escrow.fundedAt ? 1 : 0,
          lastDepositAt: escrow.fundedAt?.toISOString() || null,
        },
        message: 'Demo mode - showing stored data',
      });
    }
    
    // Calculate totals from events
    const completedDeposits = events.filter(e => e.type === 'payment_processed');
    const totalDeposited = completedDeposits.reduce(
      (sum, e) => sum + parseFloat(e.receipt?.final_amount || e.amount || '0'),
      0
    );
    
    // Calculate yield
    const initialDeposit = Number(escrow.initialDeposit || totalDeposited || escrow.purchasePrice || 0);
    const yieldInfo = calculateYieldEarned(walletBalance.total, initialDeposit);
    
    // Format events for display
    const formattedEvents = events.map(event => ({
      id: event.id,
      type: event.type,
      status: getEventStatus(event.type),
      statusColor: getEventStatusColor(event.type),
      icon: getEventIcon(event.type),
      amount: parseFloat(event.amount || '0'),
      formattedAmount: `$${parseFloat(event.amount || '0').toLocaleString()}`,
      currency: event.currency,
      timestamp: event.created_at,
      formattedTimestamp: new Date(event.created_at).toLocaleString(),
      source: event.source ? {
        paymentRail: event.source.payment_rail,
        senderName: event.source.sender_name,
        senderBank: event.source.sender_bank_routing_number,
        description: event.source.description,
      } : null,
      receipt: event.receipt ? {
        initialAmount: parseFloat(event.receipt.initial_amount),
        fees: parseFloat(event.receipt.exchange_fee) + parseFloat(event.receipt.gas_fee),
        finalAmount: parseFloat(event.receipt.final_amount),
        txHash: event.receipt.destination_tx_hash,
      } : null,
      txHash: event.destination_tx_hash,
    }));
    
    return NextResponse.json({
      success: true,
      hasVirtualAccount: true,
      virtualAccountId: escrow.bridgeVirtualAccountId,
      walletId: escrow.bridgeWalletId,
      events: formattedEvents,
      summary: {
        totalDeposited: totalDeposited || initialDeposit,
        currentBalance: walletBalance.total,
        usdbBalance: walletBalance.usdb,
        usdcBalance: walletBalance.usdc,
        yieldEarned: yieldInfo.yieldAmount,
        yieldPercent: yieldInfo.yieldPercent,
        formattedYield: yieldInfo.formatted,
        currency: 'USDB',
        depositCount: completedDeposits.length,
        lastDepositAt: completedDeposits.length > 0 
          ? completedDeposits[0].created_at 
          : null,
        // Legal compliance note
        yieldNote: 'All yield earned belongs to the buyer (depositor) and will be returned at escrow close.',
      },
    });
    
  } catch (error: any) {
    console.error('[DEPOSIT_HISTORY] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get deposit history', details: error.message },
      { status: 500 }
    );
  }
}

// Helper functions for event formatting
function getEventStatus(type: string): string {
  switch (type) {
    case 'funds_received': return 'Funds Received';
    case 'payment_submitted': return 'Converting to USDB';
    case 'payment_processed': return 'Deposit Complete';
    case 'funds_scheduled': return 'Funds In Transit';
    case 'in_review': return 'Under Review';
    case 'refunded': return 'Refunded';
    case 'microdeposit': return 'Verification Deposit';
    default: return type;
  }
}

function getEventStatusColor(type: string): string {
  switch (type) {
    case 'payment_processed': return 'green';
    case 'funds_received': return 'blue';
    case 'payment_submitted': return 'yellow';
    case 'funds_scheduled': return 'yellow';
    case 'in_review': return 'orange';
    case 'refunded': return 'red';
    default: return 'gray';
  }
}

function getEventIcon(type: string): string {
  switch (type) {
    case 'payment_processed': return '✅';
    case 'funds_received': return '📥';
    case 'payment_submitted': return '🔄';
    case 'funds_scheduled': return '📅';
    case 'in_review': return '🔍';
    case 'refunded': return '↩️';
    case 'microdeposit': return '🔬';
    default: return '📋';
  }
}
