/**
 * ============================================================================
 * QUALIA RECONCILIATION GENERATOR
 * ============================================================================
 * 
 * Generates reconciliation/cleared files for upload to Qualia
 * 
 * OUTPUT FORMATS:
 * - Qualia Positive Pay CSV (standard format)
 * - Bank Reconciliation CSV
 * 
 * These files allow escrow officers to balance their Qualia ledger
 * with the actual payments processed through EscrowPayi + Bridge.xyz
 * 
 * ============================================================================
 */

import { PayoutResult } from './qualia-executor';

// ============================================================================
// TYPES
// ============================================================================

export interface ReconciliationRecord {
  date: string;              // YYYY-MM-DD
  description: string;       // Payee name + reference
  amount: string;            // Formatted as USD (e.g., "1234.56")
  referenceId: string;       // Deal/Order number
  status: 'CLEARED' | 'PENDING' | 'FAILED' | 'VOID';
  confirmationNumber?: string;
  paymentMethod?: string;    // Wire, ACH, RTP
  notes?: string;
}

export interface ReconciliationFile {
  fileName: string;
  content: string;
  mimeType: string;
  generatedAt: string;
  recordCount: number;
  totalAmount: number;
  format: 'qualia-positive-pay' | 'bank-reconciliation' | 'detailed';
}

// ============================================================================
// QUALIA POSITIVE PAY FORMAT
// ============================================================================

/**
 * Generate a Qualia Positive Pay compatible CSV file
 * 
 * Standard Qualia Positive Pay columns:
 * - Date
 * - Check Number / Reference
 * - Payee
 * - Amount
 * - Status
 * 
 * For wires/ACH, we use the Bridge Transfer ID as the reference number
 */
export function generateQualiaPositivePayFile(
  results: PayoutResult[],
  batchId: string
): ReconciliationFile {
  const successfulResults = results.filter(r => r.status === 'success');
  
  const headers = [
    'Date',
    'Check/Wire Number',
    'Payee',
    'Amount',
    'Status',
    'Payment Type',
    'Reference ID',
    'Confirmation Number',
  ];
  
  const rows = successfulResults.map(result => {
    const date = new Date(result.processedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Use Bridge Transfer ID as check/wire number
    const wireNumber = result.bridgeTransferId?.substring(0, 20) || '';
    
    return [
      date,
      wireNumber,
      escapeCSV(result.payeeName),
      result.amount.toFixed(2),
      'CLEARED',
      result.paymentRail.toUpperCase(),
      result.referenceId,
      result.bridgeTransferId || '',
    ];
  });
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
  
  const totalAmount = successfulResults.reduce((sum, r) => sum + r.amount, 0);
  const timestamp = new Date().toISOString().split('T')[0];
  
  return {
    fileName: `EscrowPayi_PositivePay_${batchId}_${timestamp}.csv`,
    content: csvContent,
    mimeType: 'text/csv',
    generatedAt: new Date().toISOString(),
    recordCount: successfulResults.length,
    totalAmount,
    format: 'qualia-positive-pay',
  };
}

// ============================================================================
// BANK RECONCILIATION FORMAT
// ============================================================================

/**
 * Generate a Bank Reconciliation CSV for Qualia ledger balancing
 * 
 * This format includes all transactions (including failed/pending)
 * and provides more detail for accounting purposes
 */
export function generateBankReconciliationFile(
  results: PayoutResult[],
  batchId: string,
  options: {
    includeVoided?: boolean;
    includePending?: boolean;
  } = {}
): ReconciliationFile {
  const { includeVoided = true, includePending = true } = options;
  
  // Filter based on options
  let filteredResults = results.filter(r => {
    if (r.status === 'failed' && !includeVoided) return false;
    if (r.status === 'pending' && !includePending) return false;
    return true;
  });
  
  const headers = [
    'Transaction Date',
    'Posting Date',
    'Description',
    'Debit',
    'Credit',
    'Balance',
    'Reference ID',
    'Payment Type',
    'Status',
    'Confirmation Number',
    'Error Notes',
  ];
  
  let runningBalance = 0;
  
  const rows = filteredResults.map(result => {
    const transactionDate = new Date(result.processedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Posting date is typically same day for ACH/Wire
    const postingDate = transactionDate;
    
    // Calculate running balance (disbursements are debits)
    if (result.status === 'success') {
      runningBalance -= result.amount;
    }
    
    // Determine status for Qualia
    let status: string;
    switch (result.status) {
      case 'success':
        status = 'CLEARED';
        break;
      case 'pending':
        status = 'PENDING';
        break;
      case 'failed':
        status = 'VOID';
        break;
      default:
        status = 'UNKNOWN';
    }
    
    return [
      transactionDate,
      postingDate,
      escapeCSV(`${result.payeeName} - ${result.referenceId}`),
      result.status === 'success' ? result.amount.toFixed(2) : '',  // Debit
      '',  // Credit (we're only doing disbursements)
      runningBalance.toFixed(2),
      result.referenceId,
      result.paymentRail.toUpperCase(),
      status,
      result.bridgeTransferId || '',
      escapeCSV(result.errorMessage || ''),
    ];
  });
  
  // Add summary row
  const totalCleared = filteredResults
    .filter(r => r.status === 'success')
    .reduce((sum, r) => sum + r.amount, 0);
  
  const totalVoided = filteredResults
    .filter(r => r.status === 'failed')
    .reduce((sum, r) => sum + r.amount, 0);
  
  rows.push([]);  // Empty row
  rows.push([
    '',
    '',
    'TOTAL CLEARED',
    totalCleared.toFixed(2),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  
  if (totalVoided > 0) {
    rows.push([
      '',
      '',
      'TOTAL VOIDED/FAILED',
      '',
      '',
      totalVoided.toFixed(2),
      '',
      '',
      '',
      '',
      '',
    ]);
  }
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
  
  const timestamp = new Date().toISOString().split('T')[0];
  
  return {
    fileName: `EscrowPayi_BankRecon_${batchId}_${timestamp}.csv`,
    content: csvContent,
    mimeType: 'text/csv',
    generatedAt: new Date().toISOString(),
    recordCount: filteredResults.length,
    totalAmount: totalCleared,
    format: 'bank-reconciliation',
  };
}

// ============================================================================
// DETAILED REPORT FORMAT
// ============================================================================

/**
 * Generate a detailed report with all transaction information
 * Useful for auditing and compliance
 */
export function generateDetailedReport(
  results: PayoutResult[],
  batchId: string,
  batchMetadata?: {
    sourceWalletId?: string;
    originalFileName?: string;
    processedBy?: string;
    escrowId?: string;
  }
): ReconciliationFile {
  const headers = [
    'Batch ID',
    'Line Number',
    'Transaction Date',
    'Payee Name',
    'Amount',
    'Reference ID',
    'Payment Rail',
    'Status',
    'Bridge Transfer ID',
    'Bridge External Account ID',
    'Error Message',
    'Source Wallet',
    'Original File',
    'Processed By',
  ];
  
  const rows = results.map(result => {
    return [
      batchId,
      result.lineNumber.toString(),
      new Date(result.processedAt).toISOString(),
      escapeCSV(result.payeeName),
      result.amount.toFixed(2),
      result.referenceId,
      result.paymentRail.toUpperCase(),
      result.status.toUpperCase(),
      result.bridgeTransferId || '',
      result.bridgeExternalAccountId || '',
      escapeCSV(result.errorMessage || ''),
      batchMetadata?.sourceWalletId || '',
      escapeCSV(batchMetadata?.originalFileName || ''),
      escapeCSV(batchMetadata?.processedBy || ''),
    ];
  });
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
  
  const totalAmount = results
    .filter(r => r.status === 'success')
    .reduce((sum, r) => sum + r.amount, 0);
  
  const timestamp = new Date().toISOString().split('T')[0];
  
  return {
    fileName: `EscrowPayi_DetailedReport_${batchId}_${timestamp}.csv`,
    content: csvContent,
    mimeType: 'text/csv',
    generatedAt: new Date().toISOString(),
    recordCount: results.length,
    totalAmount,
    format: 'detailed',
  };
}

// ============================================================================
// COMBINED RECONCILIATION FILE
// ============================================================================

/**
 * Generate all reconciliation files as a bundle
 */
export function generateAllReconciliationFiles(
  results: PayoutResult[],
  batchId: string,
  metadata?: {
    sourceWalletId?: string;
    originalFileName?: string;
    processedBy?: string;
    escrowId?: string;
  }
): ReconciliationFile[] {
  return [
    generateQualiaPositivePayFile(results, batchId),
    generateBankReconciliationFile(results, batchId),
    generateDetailedReport(results, batchId, metadata),
  ];
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escape a value for CSV format
 * - Wrap in quotes if contains comma, newline, or quote
 * - Escape internal quotes by doubling them
 */
function escapeCSV(value: string): string {
  if (!value) return '';
  
  // Check if we need to quote
  const needsQuoting = /[",\n\r]/.test(value);
  
  if (needsQuoting) {
    // Escape internal quotes
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  
  return value;
}

/**
 * Parse a date string in various formats and return YYYY-MM-DD
 */
export function normalizeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

/**
 * Generate a summary report as text (for display in UI)
 */
export function generateSummaryText(results: PayoutResult[]): string {
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  const pending = results.filter(r => r.status === 'pending');
  const skipped = results.filter(r => r.status === 'skipped');
  
  const totalSuccess = successful.reduce((sum, r) => sum + r.amount, 0);
  const totalFailed = failed.reduce((sum, r) => sum + r.amount, 0);
  
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '                    BATCH PROCESSING SUMMARY                   ',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Total Transactions: ${results.length}`,
    '',
    `✓ Successful:  ${successful.length} transactions  ${formatCurrency(totalSuccess)}`,
    `✗ Failed:      ${failed.length} transactions  ${formatCurrency(totalFailed)}`,
    `◐ Pending:     ${pending.length} transactions`,
    `⊘ Skipped:     ${skipped.length} transactions`,
    '',
  ];
  
  if (successful.length > 0) {
    lines.push('SUCCESSFUL PAYMENTS:');
    successful.forEach(r => {
      lines.push(`  • ${r.payeeName}: ${formatCurrency(r.amount)} via ${r.paymentRail.toUpperCase()}`);
    });
    lines.push('');
  }
  
  if (failed.length > 0) {
    lines.push('FAILED PAYMENTS:');
    failed.forEach(r => {
      lines.push(`  • ${r.payeeName}: ${formatCurrency(r.amount)} - ${r.errorMessage || 'Unknown error'}`);
    });
    lines.push('');
  }
  
  lines.push('═══════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
