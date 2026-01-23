/**
 * ============================================================================
 * QUALIA FILE PARSER - Ingest Engine
 * ============================================================================
 * 
 * Parses wire batch export files from Qualia:
 * - NACHA format (ACH batch files)
 * - Standard CSV format
 * 
 * Extracts payee details for processing via Bridge.xyz
 * 
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedPayoutItem {
  lineNumber: number;
  payeeName: string;
  routingNumber: string;
  accountNumber: string;
  amount: number;           // In cents to avoid floating point issues
  amountDollars: number;    // Convenience: amount in dollars
  referenceId: string;      // Deal/Order number from Qualia
  accountType?: 'checking' | 'savings';
  memo?: string;
  rawLine?: string;         // Original line for debugging
}

export interface ParseResult {
  success: boolean;
  items: ParsedPayoutItem[];
  totalAmount: number;      // Total in dollars
  totalItems: number;
  errors: ParseError[];
  fileType: 'nacha' | 'csv' | 'unknown';
  fileName: string;
}

export interface ParseError {
  lineNumber: number;
  message: string;
  rawLine?: string;
}

// ============================================================================
// NACHA RECORD TYPE CODES
// ============================================================================
// 
// NACHA files have fixed-width records (94 characters each)
// Record Type is always the first character
//
// 1 - File Header
// 5 - Batch Header
// 6 - Entry Detail (this contains the actual payment info)
// 7 - Addenda Record
// 8 - Batch Control
// 9 - File Control
//
// ============================================================================

const NACHA_RECORD_LENGTH = 94;

// ============================================================================
// MAIN PARSER FUNCTION
// ============================================================================

/**
 * Parse a Qualia export file (NACHA or CSV)
 * Automatically detects file format
 */
export function parseQualiaExport(
  fileContent: string,
  fileName: string
): ParseResult {
  const content = fileContent.trim();
  
  // Detect file type
  if (isNACHAFormat(content)) {
    return parseNACHAFile(content, fileName);
  } else if (isCSVFormat(content, fileName)) {
    return parseCSVFile(content, fileName);
  }
  
  return {
    success: false,
    items: [],
    totalAmount: 0,
    totalItems: 0,
    errors: [{ lineNumber: 0, message: 'Unable to determine file format. Expected NACHA or CSV.' }],
    fileType: 'unknown',
    fileName,
  };
}

// ============================================================================
// FORMAT DETECTION
// ============================================================================

function isNACHAFormat(content: string): boolean {
  const lines = content.split('\n');
  if (lines.length === 0) return false;
  
  const firstLine = lines[0];
  
  // NACHA files start with a File Header Record (type 1)
  // and are exactly 94 characters per line
  return (
    firstLine.length >= NACHA_RECORD_LENGTH &&
    firstLine.charAt(0) === '1' &&
    /^1\d{2}/.test(firstLine)
  );
}

function isCSVFormat(content: string, fileName: string): boolean {
  // Check file extension
  if (fileName.toLowerCase().endsWith('.csv')) return true;
  
  // Check for common CSV headers
  const firstLine = content.split('\n')[0]?.toLowerCase() || '';
  const csvHeaders = ['payee', 'amount', 'routing', 'account', 'reference', 'name'];
  
  return csvHeaders.some(header => firstLine.includes(header));
}

// ============================================================================
// NACHA PARSER
// ============================================================================

function parseNACHAFile(content: string, fileName: string): ParseResult {
  const lines = content.split('\n');
  const items: ParsedPayoutItem[] = [];
  const errors: ParseError[] = [];
  let currentBatchReference = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    // Skip lines that are too short or empty
    if (line.length < NACHA_RECORD_LENGTH) continue;
    
    const recordType = line.charAt(0);
    
    switch (recordType) {
      case '5': // Batch Header - contains company reference
        // Positions 54-63: Company Entry Description (used as reference)
        currentBatchReference = line.substring(53, 63).trim();
        break;
        
      case '6': // Entry Detail - the actual payment record
        try {
          const item = parseNACHAEntryDetail(line, lineNumber, currentBatchReference);
          if (item) {
            items.push(item);
          }
        } catch (error) {
          errors.push({
            lineNumber,
            message: error instanceof Error ? error.message : 'Failed to parse entry',
            rawLine: line,
          });
        }
        break;
        
      // Records 1, 7, 8, 9 are metadata/control records - we skip them
    }
  }
  
  const totalAmount = items.reduce((sum, item) => sum + item.amountDollars, 0);
  
  return {
    success: errors.length === 0,
    items,
    totalAmount,
    totalItems: items.length,
    errors,
    fileType: 'nacha',
    fileName,
  };
}

/**
 * Parse a NACHA Entry Detail Record (Type 6)
 * 
 * NACHA Entry Detail Layout (positions are 1-indexed):
 * Pos 1:       Record Type (6)
 * Pos 2-3:     Transaction Code (22=Credit, 23=Prenote, 27=Debit, etc.)
 * Pos 4-11:    Receiving DFI ID (Routing Number, first 8 digits)
 * Pos 12:      Check Digit (9th digit of routing)
 * Pos 13-29:   DFI Account Number (right-justified, may include spaces)
 * Pos 30-39:   Amount (in cents, zero-filled)
 * Pos 40-54:   Individual ID Number (our Reference ID)
 * Pos 55-76:   Individual Name (Payee Name)
 * Pos 77-78:   Discretionary Data
 * Pos 79:      Addenda Record Indicator
 * Pos 80-94:   Trace Number
 */
function parseNACHAEntryDetail(
  line: string,
  lineNumber: number,
  batchReference: string
): ParsedPayoutItem | null {
  // Transaction code - we only want credits (22, 32, 33)
  const transactionCode = line.substring(1, 3);
  const validCreditCodes = ['22', '32', '33', '42', '52']; // Various credit types
  
  if (!validCreditCodes.includes(transactionCode)) {
    // This is a debit or prenote, skip it
    return null;
  }
  
  // Extract routing number (8 digits + check digit)
  const routingNumber = line.substring(3, 12).trim();
  
  // Validate routing number format
  if (!/^\d{9}$/.test(routingNumber)) {
    throw new Error(`Invalid routing number format: ${routingNumber}`);
  }
  
  // Extract account number (positions 13-29, 17 characters)
  const accountNumber = line.substring(12, 29).trim();
  
  if (!accountNumber) {
    throw new Error('Missing account number');
  }
  
  // Extract amount (positions 30-39, in cents)
  const amountStr = line.substring(29, 39).trim();
  const amountCents = parseInt(amountStr, 10);
  
  if (isNaN(amountCents) || amountCents <= 0) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }
  
  // Extract reference ID (positions 40-54)
  const referenceId = line.substring(39, 54).trim() || batchReference;
  
  // Extract payee name (positions 55-76)
  const payeeName = line.substring(54, 76).trim();
  
  if (!payeeName) {
    throw new Error('Missing payee name');
  }
  
  // Determine account type from transaction code
  // 22/32 = Checking, 33/42/52 = Savings
  const accountType: 'checking' | 'savings' = 
    ['33', '42', '52'].includes(transactionCode) ? 'savings' : 'checking';
  
  return {
    lineNumber,
    payeeName,
    routingNumber,
    accountNumber,
    amount: amountCents,
    amountDollars: amountCents / 100,
    referenceId: referenceId || `LINE-${lineNumber}`,
    accountType,
    rawLine: line,
  };
}

// ============================================================================
// CSV PARSER
// ============================================================================

/**
 * Parse a standard CSV export from Qualia
 * 
 * Expected columns (flexible matching):
 * - Payee Name / Beneficiary / Name
 * - Routing Number / ABA / Routing
 * - Account Number / Account
 * - Amount / Wire Amount / Payment
 * - Reference / Deal Number / Order Number / File Number
 */
function parseCSVFile(content: string, fileName: string): ParseResult {
  const lines = content.split('\n');
  const items: ParsedPayoutItem[] = [];
  const errors: ParseError[] = [];
  
  if (lines.length < 2) {
    return {
      success: false,
      items: [],
      totalAmount: 0,
      totalItems: 0,
      errors: [{ lineNumber: 0, message: 'CSV file appears to be empty or missing data rows' }],
      fileType: 'csv',
      fileName,
    };
  }
  
  // Parse header row to determine column mapping
  const headerRow = lines[0];
  const columnMap = detectCSVColumns(headerRow);
  
  if (columnMap.payeeName === null || columnMap.amount === null) {
    return {
      success: false,
      items: [],
      totalAmount: 0,
      totalItems: 0,
      errors: [{ 
        lineNumber: 1, 
        message: 'Required columns not found. Expected: Payee Name, Routing, Account, Amount, Reference' 
      }],
      fileType: 'csv',
      fileName,
    };
  }
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    const lineNumber = i + 1;
    
    try {
      const item = parseCSVRow(line, lineNumber, columnMap);
      if (item) {
        items.push(item);
      }
    } catch (error) {
      errors.push({
        lineNumber,
        message: error instanceof Error ? error.message : 'Failed to parse row',
        rawLine: line,
      });
    }
  }
  
  const totalAmount = items.reduce((sum, item) => sum + item.amountDollars, 0);
  
  return {
    success: errors.length === 0,
    items,
    totalAmount,
    totalItems: items.length,
    errors,
    fileType: 'csv',
    fileName,
  };
}

interface CSVColumnMap {
  payeeName: number | null;
  routingNumber: number | null;
  accountNumber: number | null;
  amount: number | null;
  referenceId: number | null;
  accountType: number | null;
  memo: number | null;
}

function detectCSVColumns(headerRow: string): CSVColumnMap {
  const columns = parseCSVLine(headerRow).map(col => col.toLowerCase().trim());
  
  const map: CSVColumnMap = {
    payeeName: null,
    routingNumber: null,
    accountNumber: null,
    amount: null,
    referenceId: null,
    accountType: null,
    memo: null,
  };
  
  columns.forEach((col, index) => {
    // Payee Name variations
    if (/payee|beneficiary|recipient|name|vendor/i.test(col) && !col.includes('bank')) {
      map.payeeName = map.payeeName ?? index;
    }
    // Routing Number variations
    if (/routing|aba|transit/i.test(col)) {
      map.routingNumber = map.routingNumber ?? index;
    }
    // Account Number variations
    if (/account.*(number|#|no)|acct/i.test(col) && !/type/i.test(col)) {
      map.accountNumber = map.accountNumber ?? index;
    }
    // Amount variations
    if (/amount|wire.*amount|payment|total|sum/i.test(col)) {
      map.amount = map.amount ?? index;
    }
    // Reference ID variations
    if (/reference|deal|order|file.*number|escrow.*number|transaction/i.test(col)) {
      map.referenceId = map.referenceId ?? index;
    }
    // Account Type variations
    if (/account.*type|type.*account/i.test(col)) {
      map.accountType = map.accountType ?? index;
    }
    // Memo variations
    if (/memo|note|description|purpose/i.test(col)) {
      map.memo = map.memo ?? index;
    }
  });
  
  return map;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function parseCSVRow(
  line: string,
  lineNumber: number,
  columnMap: CSVColumnMap
): ParsedPayoutItem | null {
  const values = parseCSVLine(line);
  
  // Extract payee name (required)
  const payeeName = columnMap.payeeName !== null 
    ? values[columnMap.payeeName]?.trim()
    : null;
  
  if (!payeeName) {
    throw new Error('Missing payee name');
  }
  
  // Extract routing number
  const routingNumber = columnMap.routingNumber !== null
    ? values[columnMap.routingNumber]?.replace(/\D/g, '').trim()
    : '';
  
  // Extract account number
  const accountNumber = columnMap.accountNumber !== null
    ? values[columnMap.accountNumber]?.replace(/[^\d]/g, '').trim()
    : '';
  
  // Validate bank details if present (for wire/ACH we need them)
  if (!routingNumber || !accountNumber) {
    console.warn(`Line ${lineNumber}: Missing bank details for ${payeeName}, may need manual entry`);
  }
  
  // Extract and parse amount (required)
  const amountStr = columnMap.amount !== null
    ? values[columnMap.amount]
    : null;
  
  if (!amountStr) {
    throw new Error('Missing amount');
  }
  
  // Clean and parse amount (handle currency formatting)
  const cleanAmount = amountStr.replace(/[$,\s]/g, '');
  const amountDollars = parseFloat(cleanAmount);
  
  if (isNaN(amountDollars) || amountDollars <= 0) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }
  
  // Extract reference ID
  const referenceId = columnMap.referenceId !== null
    ? values[columnMap.referenceId]?.trim()
    : `LINE-${lineNumber}`;
  
  // Extract account type
  let accountType: 'checking' | 'savings' = 'checking';
  if (columnMap.accountType !== null) {
    const typeStr = values[columnMap.accountType]?.toLowerCase();
    if (typeStr?.includes('saving')) {
      accountType = 'savings';
    }
  }
  
  // Extract memo
  const memo = columnMap.memo !== null
    ? values[columnMap.memo]?.trim()
    : undefined;
  
  return {
    lineNumber,
    payeeName,
    routingNumber: routingNumber || '',
    accountNumber: accountNumber || '',
    amount: Math.round(amountDollars * 100), // Convert to cents
    amountDollars,
    referenceId: referenceId || `LINE-${lineNumber}`,
    accountType,
    memo,
    rawLine: line,
  };
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate a routing number using the ABA checksum algorithm
 */
export function validateRoutingNumber(routingNumber: string): boolean {
  if (!/^\d{9}$/.test(routingNumber)) return false;
  
  const digits = routingNumber.split('').map(Number);
  
  // ABA checksum: 3*d1 + 7*d2 + 1*d3 + 3*d4 + 7*d5 + 1*d6 + 3*d7 + 7*d8 + 1*d9
  // Result must be divisible by 10
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  
  return sum % 10 === 0;
}

/**
 * Format amount for display
 */
export function formatAmount(amountDollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountDollars);
}

/**
 * Determine payment rail based on amount
 * - Amounts > $100,000 → Fedwire (for Mortgage Payoffs, Seller Proceeds)
 * - Amounts ≤ $100,000 → RTP (for Agent Commissions)
 */
export function determinePaymentRail(amountDollars: number): 'wire' | 'rtp' {
  const WIRE_THRESHOLD = 100000; // $100,000
  return amountDollars > WIRE_THRESHOLD ? 'wire' : 'rtp';
}
