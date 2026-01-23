/**
 * ============================================================================
 * QUALIA PAYOUT EXECUTOR - Bridge.xyz Routing Logic
 * ============================================================================
 * 
 * Executes parsed payout batches via Bridge.xyz API
 * 
 * ROUTING LOGIC:
 * - Amount > $100,000 → Fedwire (for large payoffs: Mortgage, Seller Proceeds)
 * - Amount ≤ $100,000 → RTP (Real-Time Payments for instant settlement)
 * 
 * NOTE: RTP is not yet available on Bridge.xyz (coming Spring 2026)
 * For now, we route small amounts via ACH and large amounts via Wire.
 * When RTP becomes available, we'll update the routing logic.
 * 
 * ============================================================================
 */

import { v4 as uuidv4 } from 'uuid';
import { ParsedPayoutItem, determinePaymentRail } from './qualia-parser';

// ============================================================================
// TYPES
// ============================================================================

export interface BatchPayoutRequest {
  batchId: string;
  sourceWalletId: string;      // Bridge wallet holding the funds
  sourceCurrency: 'usdb' | 'usdc';
  items: ParsedPayoutItem[];
  dryRun?: boolean;            // If true, validate without executing
}

export interface PayoutResult {
  lineNumber: number;
  referenceId: string;
  payeeName: string;
  amount: number;              // In dollars
  status: 'success' | 'failed' | 'pending' | 'skipped';
  paymentRail: 'wire' | 'rtp' | 'ach';
  bridgeTransferId?: string;
  bridgeExternalAccountId?: string;
  errorMessage?: string;
  processedAt: string;
}

export interface BatchPayoutResult {
  batchId: string;
  success: boolean;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  totalSkipped: number;
  totalAmount: number;         // Total in dollars
  results: PayoutResult[];
  processedAt: string;
  canRetry: boolean;           // True if there are failed items that can be retried
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WIRE_THRESHOLD = 100000; // $100,000 - amounts above this use Fedwire
const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'https://api.sandbox.bridge.xyz';
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || '';
const BRIDGE_CUSTOMER_ID = process.env.BRIDGE_CUSTOMER_ID || '';

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Execute a batch of payouts via Bridge.xyz
 * 
 * This function:
 * 1. Creates External Accounts for each payee (tokenizes bank details)
 * 2. Initiates transfers with appropriate payment rail (Wire/RTP/ACH)
 * 3. Returns detailed results for each item
 */
export async function executeBridgePayouts(
  request: BatchPayoutRequest
): Promise<BatchPayoutResult> {
  const { batchId, sourceWalletId, sourceCurrency, items, dryRun = false } = request;
  
  const results: PayoutResult[] = [];
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalAmount = 0;
  
  console.log(`[Qualia Executor] Processing batch ${batchId} with ${items.length} items`);
  console.log(`[Qualia Executor] Source wallet: ${sourceWalletId}, Currency: ${sourceCurrency}`);
  console.log(`[Qualia Executor] Dry run: ${dryRun}`);
  
  for (const item of items) {
    const startTime = Date.now();
    
    try {
      // Validate required fields
      if (!item.routingNumber || !item.accountNumber) {
        results.push({
          lineNumber: item.lineNumber,
          referenceId: item.referenceId,
          payeeName: item.payeeName,
          amount: item.amountDollars,
          status: 'skipped',
          paymentRail: determinePaymentRail(item.amountDollars),
          errorMessage: 'Missing bank account details',
          processedAt: new Date().toISOString(),
        });
        totalSkipped++;
        continue;
      }
      
      // Determine payment rail
      const paymentRail = getEffectivePaymentRail(item.amountDollars);
      
      if (dryRun) {
        // Dry run - just validate and simulate
        results.push({
          lineNumber: item.lineNumber,
          referenceId: item.referenceId,
          payeeName: item.payeeName,
          amount: item.amountDollars,
          status: 'pending',
          paymentRail,
          bridgeTransferId: `dry-run-${uuidv4()}`,
          processedAt: new Date().toISOString(),
        });
        totalSuccess++;
        totalAmount += item.amountDollars;
        continue;
      }
      
      // Step 1: Create External Account (tokenize bank details)
      const externalAccountId = await createExternalAccount(item, batchId);
      
      // Step 2: Execute transfer
      const transferId = await createTransfer({
        sourceWalletId,
        sourceCurrency,
        externalAccountId,
        amount: item.amountDollars,
        paymentRail,
        referenceId: item.referenceId,
        batchId,
      });
      
      results.push({
        lineNumber: item.lineNumber,
        referenceId: item.referenceId,
        payeeName: item.payeeName,
        amount: item.amountDollars,
        status: 'success',
        paymentRail,
        bridgeTransferId: transferId,
        bridgeExternalAccountId: externalAccountId,
        processedAt: new Date().toISOString(),
      });
      
      totalSuccess++;
      totalAmount += item.amountDollars;
      
      console.log(`[Qualia Executor] ✓ ${item.payeeName}: $${item.amountDollars.toLocaleString()} via ${paymentRail} (${Date.now() - startTime}ms)`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      results.push({
        lineNumber: item.lineNumber,
        referenceId: item.referenceId,
        payeeName: item.payeeName,
        amount: item.amountDollars,
        status: 'failed',
        paymentRail: determinePaymentRail(item.amountDollars),
        errorMessage,
        processedAt: new Date().toISOString(),
      });
      
      totalFailed++;
      
      console.error(`[Qualia Executor] ✗ ${item.payeeName}: ${errorMessage}`);
    }
  }
  
  const success = totalFailed === 0 && totalSkipped < items.length;
  
  console.log(`[Qualia Executor] Batch ${batchId} complete: ${totalSuccess} success, ${totalFailed} failed, ${totalSkipped} skipped`);
  
  return {
    batchId,
    success,
    totalProcessed: items.length,
    totalSuccess,
    totalFailed,
    totalSkipped,
    totalAmount,
    results,
    processedAt: new Date().toISOString(),
    canRetry: totalFailed > 0,
  };
}

// ============================================================================
// PAYMENT RAIL ROUTING
// ============================================================================

/**
 * Get the effective payment rail for an amount
 * 
 * NOTE: RTP is planned for Spring 2026. Until then:
 * - Large amounts (>$100k) → Wire (Fedwire)
 * - Small amounts (≤$100k) → ACH (will be RTP when available)
 */
function getEffectivePaymentRail(amountDollars: number): 'wire' | 'rtp' | 'ach' {
  if (amountDollars > WIRE_THRESHOLD) {
    return 'wire'; // Fedwire for large amounts
  }
  
  // TODO: Switch to 'rtp' when Bridge enables RTP (Spring 2026)
  // For now, use ACH for smaller amounts
  const RTP_ENABLED = false; // Feature flag
  
  if (RTP_ENABLED) {
    return 'rtp';
  }
  
  return 'ach';
}

// ============================================================================
// BRIDGE API HELPERS
// ============================================================================

async function createExternalAccount(
  item: ParsedPayoutItem,
  batchId: string
): Promise<string> {
  // Parse payee name into first/last name
  const nameParts = item.payeeName.split(' ');
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.slice(1).join(' ') || 'Payee';
  
  const idempotencyKey = `qualia-${batchId}-ext-${item.referenceId}-${item.lineNumber}`;
  
  const response = await fetch(
    `${BRIDGE_API_URL}/v0/customers/${BRIDGE_CUSTOMER_ID}/external_accounts`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Api-Key': BRIDGE_API_KEY,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        currency: 'usd',
        account_type: 'us',
        bank_name: 'Unknown', // Qualia export doesn't include bank name
        account_name: `${firstName} ${lastName} Account`,
        first_name: firstName,
        last_name: lastName,
        account_owner_type: 'individual',
        account_owner_name: item.payeeName,
        account: {
          routing_number: item.routingNumber,
          account_number: item.accountNumber,
          checking_or_savings: item.accountType || 'checking',
        },
        address: {
          // Qualia doesn't include address, use placeholder
          street_line_1: 'Address on file',
          city: 'City',
          state: 'CA',
          postal_code: '90001',
          country: 'USA',
        },
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to create external account: ${errorData.message || response.statusText}`
    );
  }
  
  const data = await response.json();
  return data.id;
}

interface TransferParams {
  sourceWalletId: string;
  sourceCurrency: 'usdb' | 'usdc';
  externalAccountId: string;
  amount: number;
  paymentRail: 'wire' | 'rtp' | 'ach';
  referenceId: string;
  batchId: string;
}

async function createTransfer(params: TransferParams): Promise<string> {
  const {
    sourceWalletId,
    sourceCurrency,
    externalAccountId,
    amount,
    paymentRail,
    referenceId,
    batchId,
  } = params;
  
  const idempotencyKey = `qualia-${batchId}-txfr-${referenceId}-${Date.now()}`;
  
  // Map RTP to ACH for now (RTP not yet available)
  const effectiveRail = paymentRail === 'rtp' ? 'ach' : paymentRail;
  
  const response = await fetch(
    `${BRIDGE_API_URL}/v0/transfers`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Api-Key': BRIDGE_API_KEY,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        amount: amount.toString(),
        on_behalf_of: BRIDGE_CUSTOMER_ID,
        source: {
          payment_rail: 'bridge_wallet',
          currency: sourceCurrency,
          bridge_wallet_id: sourceWalletId,
        },
        destination: {
          payment_rail: effectiveRail,
          currency: 'usd',
          external_account_id: externalAccountId,
        },
      }),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to create transfer: ${errorData.message || response.statusText}`
    );
  }
  
  const data = await response.json();
  return data.id;
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validate a batch before execution
 * Returns validation errors without making any API calls
 */
export function validateBatch(items: ParsedPayoutItem[]): {
  valid: boolean;
  errors: Array<{ lineNumber: number; message: string }>;
  summary: {
    totalItems: number;
    totalAmount: number;
    wireCount: number;
    rtpCount: number;
    wireTotal: number;
    rtpTotal: number;
    missingBankDetails: number;
  };
} {
  const errors: Array<{ lineNumber: number; message: string }> = [];
  let wireCount = 0;
  let rtpCount = 0;
  let wireTotal = 0;
  let rtpTotal = 0;
  let missingBankDetails = 0;
  let totalAmount = 0;
  
  for (const item of items) {
    totalAmount += item.amountDollars;
    
    // Check for missing bank details
    if (!item.routingNumber || !item.accountNumber) {
      missingBankDetails++;
      errors.push({
        lineNumber: item.lineNumber,
        message: `Missing bank details for ${item.payeeName}`,
      });
      continue;
    }
    
    // Validate routing number
    if (!/^\d{9}$/.test(item.routingNumber)) {
      errors.push({
        lineNumber: item.lineNumber,
        message: `Invalid routing number for ${item.payeeName}: ${item.routingNumber}`,
      });
    }
    
    // Validate amount
    if (item.amountDollars <= 0) {
      errors.push({
        lineNumber: item.lineNumber,
        message: `Invalid amount for ${item.payeeName}: $${item.amountDollars}`,
      });
    }
    
    // Categorize by payment rail
    if (item.amountDollars > WIRE_THRESHOLD) {
      wireCount++;
      wireTotal += item.amountDollars;
    } else {
      rtpCount++;
      rtpTotal += item.amountDollars;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    summary: {
      totalItems: items.length,
      totalAmount,
      wireCount,
      rtpCount,
      wireTotal,
      rtpTotal,
      missingBankDetails,
    },
  };
}

// ============================================================================
// RETRY FAILED ITEMS
// ============================================================================

/**
 * Retry failed items from a previous batch execution
 */
export async function retryFailedPayouts(
  sourceWalletId: string,
  sourceCurrency: 'usdb' | 'usdc',
  failedResults: PayoutResult[],
  originalItems: ParsedPayoutItem[]
): Promise<BatchPayoutResult> {
  // Find the original items for the failed results
  const itemsToRetry = failedResults
    .filter(r => r.status === 'failed')
    .map(r => {
      const original = originalItems.find(
        i => i.lineNumber === r.lineNumber && i.referenceId === r.referenceId
      );
      return original;
    })
    .filter((item): item is ParsedPayoutItem => item !== undefined);
  
  if (itemsToRetry.length === 0) {
    return {
      batchId: `retry-${uuidv4()}`,
      success: true,
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalSkipped: 0,
      totalAmount: 0,
      results: [],
      processedAt: new Date().toISOString(),
      canRetry: false,
    };
  }
  
  return executeBridgePayouts({
    batchId: `retry-${uuidv4()}`,
    sourceWalletId,
    sourceCurrency,
    items: itemsToRetry,
    dryRun: false,
  });
}
