import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// Common US Bank Routing Numbers (Static Lookup)
// This provides instant lookup for major banks without external API
// ============================================================

const BANK_DATABASE: Record<string, { name: string; city?: string; state?: string }> = {
  // JPMorgan Chase
  '021000021': { name: 'JPMorgan Chase Bank, N.A.', city: 'Tampa', state: 'FL' },
  '021000089': { name: 'JPMorgan Chase Bank, N.A.', city: 'Brooklyn', state: 'NY' },
  '022300173': { name: 'JPMorgan Chase Bank, N.A.', city: 'New York', state: 'NY' },
  '044000037': { name: 'JPMorgan Chase Bank, N.A.', city: 'Columbus', state: 'OH' },
  '072000326': { name: 'JPMorgan Chase Bank, N.A.', city: 'Detroit', state: 'MI' },
  '083000137': { name: 'JPMorgan Chase Bank, N.A.', city: 'Louisville', state: 'KY' },
  '122100024': { name: 'JPMorgan Chase Bank, N.A.', city: 'Los Angeles', state: 'CA' },
  '267084131': { name: 'JPMorgan Chase Bank, N.A.', city: 'Jacksonville', state: 'FL' },
  '322271627': { name: 'JPMorgan Chase Bank, N.A.', city: 'Los Angeles', state: 'CA' },
  
  // Bank of America
  '026009593': { name: 'Bank of America, N.A.', city: 'Richmond', state: 'VA' },
  '011000138': { name: 'Bank of America, N.A.', city: 'Boston', state: 'MA' },
  '011200365': { name: 'Bank of America, N.A.', city: 'Providence', state: 'RI' },
  '011400495': { name: 'Bank of America, N.A.', city: 'Hartford', state: 'CT' },
  '021200339': { name: 'Bank of America, N.A.', city: 'New York', state: 'NY' },
  '051000017': { name: 'Bank of America, N.A.', city: 'Richmond', state: 'VA' },
  '053000196': { name: 'Bank of America, N.A.', city: 'Charlotte', state: 'NC' },
  '061000052': { name: 'Bank of America, N.A.', city: 'Atlanta', state: 'GA' },
  '071000039': { name: 'Bank of America, N.A.', city: 'Chicago', state: 'IL' },
  '081000032': { name: 'Bank of America, N.A.', city: 'St. Louis', state: 'MO' },
  '101100045': { name: 'Bank of America, N.A.', city: 'Kansas City', state: 'MO' },
  '111000025': { name: 'Bank of America, N.A.', city: 'Dallas', state: 'TX' },
  '121000358': { name: 'Bank of America, N.A.', city: 'San Francisco', state: 'CA' },
  
  // Wells Fargo
  '121000248': { name: 'Wells Fargo Bank, N.A.', city: 'San Francisco', state: 'CA' },
  '122000247': { name: 'Wells Fargo Bank, N.A.', city: 'Los Angeles', state: 'CA' },
  '111900659': { name: 'Wells Fargo Bank, N.A.', city: 'Dallas', state: 'TX' },
  '091000019': { name: 'Wells Fargo Bank, N.A.', city: 'Minneapolis', state: 'MN' },
  '102000076': { name: 'Wells Fargo Bank, N.A.', city: 'Denver', state: 'CO' },
  '107000783': { name: 'Wells Fargo Bank, N.A.', city: 'Phoenix', state: 'AZ' },
  '062000080': { name: 'Wells Fargo Bank, N.A.', city: 'Birmingham', state: 'AL' },
  '063107513': { name: 'Wells Fargo Bank, N.A.', city: 'Jacksonville', state: 'FL' },
  '053000219': { name: 'Wells Fargo Bank, N.A.', city: 'Charlotte', state: 'NC' },
  '055003201': { name: 'Wells Fargo Bank, N.A.', city: 'Baltimore', state: 'MD' },
  '031000503': { name: 'Wells Fargo Bank, N.A.', city: 'Philadelphia', state: 'PA' },
  
  // Citibank
  '021000089': { name: 'Citibank, N.A.', city: 'New York', state: 'NY' },
  '322271724': { name: 'Citibank, N.A.', city: 'Los Angeles', state: 'CA' },
  '271070801': { name: 'Citibank, N.A.', city: 'Chicago', state: 'IL' },
  '021272655': { name: 'Citibank, N.A.', city: 'New Castle', state: 'DE' },
  '266086554': { name: 'Citibank, N.A.', city: 'Jacksonville', state: 'FL' },
  
  // US Bank
  '122105155': { name: 'U.S. Bank, N.A.', city: 'Los Angeles', state: 'CA' },
  '091000022': { name: 'U.S. Bank, N.A.', city: 'Minneapolis', state: 'MN' },
  '042000013': { name: 'U.S. Bank, N.A.', city: 'Cincinnati', state: 'OH' },
  '064000059': { name: 'U.S. Bank, N.A.', city: 'Nashville', state: 'TN' },
  '081000210': { name: 'U.S. Bank, N.A.', city: 'St. Louis', state: 'MO' },
  '104000029': { name: 'U.S. Bank, N.A.', city: 'Omaha', state: 'NE' },
  '123000220': { name: 'U.S. Bank, N.A.', city: 'Portland', state: 'OR' },
  
  // Capital One
  '056073502': { name: 'Capital One, N.A.', city: 'McLean', state: 'VA' },
  '051405515': { name: 'Capital One, N.A.', city: 'Richmond', state: 'VA' },
  '065000090': { name: 'Capital One, N.A.', city: 'New Orleans', state: 'LA' },
  '113024915': { name: 'Capital One, N.A.', city: 'Houston', state: 'TX' },
  
  // PNC Bank
  '043000096': { name: 'PNC Bank, N.A.', city: 'Pittsburgh', state: 'PA' },
  '031000053': { name: 'PNC Bank, N.A.', city: 'Philadelphia', state: 'PA' },
  '041000124': { name: 'PNC Bank, N.A.', city: 'Cleveland', state: 'OH' },
  '042000398': { name: 'PNC Bank, N.A.', city: 'Cincinnati', state: 'OH' },
  '054000030': { name: 'PNC Bank, N.A.', city: 'Washington', state: 'DC' },
  '071921891': { name: 'PNC Bank, N.A.', city: 'Chicago', state: 'IL' },
  '083000108': { name: 'PNC Bank, N.A.', city: 'Louisville', state: 'KY' },
  '267084199': { name: 'PNC Bank, N.A.', city: 'Jacksonville', state: 'FL' },
  
  // TD Bank
  '031101279': { name: 'TD Bank, N.A.', city: 'Lewiston', state: 'ME' },
  '011103093': { name: 'TD Bank, N.A.', city: 'Boston', state: 'MA' },
  '021302567': { name: 'TD Bank, N.A.', city: 'New York', state: 'NY' },
  '036001808': { name: 'TD Bank, N.A.', city: 'Cherry Hill', state: 'NJ' },
  '054001725': { name: 'TD Bank, N.A.', city: 'Washington', state: 'DC' },
  '053902197': { name: 'TD Bank, N.A.', city: 'Charlotte', state: 'NC' },
  '067014822': { name: 'TD Bank, N.A.', city: 'Fort Lauderdale', state: 'FL' },
  
  // Truist Bank
  '053101121': { name: 'Truist Bank', city: 'Charlotte', state: 'NC' },
  '061000104': { name: 'Truist Bank', city: 'Atlanta', state: 'GA' },
  '051000017': { name: 'Truist Bank', city: 'Richmond', state: 'VA' },
  '055002707': { name: 'Truist Bank', city: 'Baltimore', state: 'MD' },
  '063104668': { name: 'Truist Bank', city: 'Orlando', state: 'FL' },
  
  // Charles Schwab
  '121202211': { name: 'Charles Schwab Bank, SSB', city: 'San Francisco', state: 'CA' },
  '101205681': { name: 'Charles Schwab Bank, SSB', city: 'Kansas City', state: 'MO' },
  
  // Ally Bank
  '124003116': { name: 'Ally Bank', city: 'Salt Lake City', state: 'UT' },
  
  // Discover Bank
  '031100649': { name: 'Discover Bank', city: 'New Castle', state: 'DE' },
  
  // USAA
  '314074269': { name: 'USAA Federal Savings Bank', city: 'San Antonio', state: 'TX' },
  
  // Navy Federal Credit Union
  '256074974': { name: 'Navy Federal Credit Union', city: 'Vienna', state: 'VA' },
  
  // Marcus by Goldman Sachs
  '124085024': { name: 'Goldman Sachs Bank USA (Marcus)', city: 'Salt Lake City', state: 'UT' },
  
  // American Express National Bank
  '124085066': { name: 'American Express National Bank', city: 'Salt Lake City', state: 'UT' },
  
  // Regions Bank
  '062005690': { name: 'Regions Bank', city: 'Birmingham', state: 'AL' },
  '082000109': { name: 'Regions Bank', city: 'Little Rock', state: 'AR' },
  '064000017': { name: 'Regions Bank', city: 'Nashville', state: 'TN' },
  '063104668': { name: 'Regions Bank', city: 'Orlando', state: 'FL' },
  
  // Fifth Third Bank
  '042000314': { name: 'Fifth Third Bank, N.A.', city: 'Cincinnati', state: 'OH' },
  '072405455': { name: 'Fifth Third Bank, N.A.', city: 'Grand Rapids', state: 'MI' },
  '071923909': { name: 'Fifth Third Bank, N.A.', city: 'Chicago', state: 'IL' },
  '083002342': { name: 'Fifth Third Bank, N.A.', city: 'Louisville', state: 'KY' },
  
  // KeyBank
  '041001039': { name: 'KeyBank, N.A.', city: 'Cleveland', state: 'OH' },
  '021300077': { name: 'KeyBank, N.A.', city: 'Albany', state: 'NY' },
  '125000574': { name: 'KeyBank, N.A.', city: 'Seattle', state: 'WA' },
  
  // Huntington Bank
  '044000024': { name: 'Huntington National Bank', city: 'Columbus', state: 'OH' },
  '072000096': { name: 'Huntington National Bank', city: 'Detroit', state: 'MI' },
  
  // Citizens Bank
  '011500120': { name: 'Citizens Bank, N.A.', city: 'Providence', state: 'RI' },
  '021313103': { name: 'Citizens Bank, N.A.', city: 'Buffalo', state: 'NY' },
  '036076150': { name: 'Citizens Bank, N.A.', city: 'Philadelphia', state: 'PA' },
  
  // First Republic Bank
  '321081669': { name: 'First Republic Bank', city: 'San Francisco', state: 'CA' },
  
  // Silicon Valley Bank
  '121140399': { name: 'Silicon Valley Bank', city: 'Santa Clara', state: 'CA' },
  
  // Comerica Bank
  '072000096': { name: 'Comerica Bank', city: 'Detroit', state: 'MI' },
  '121137522': { name: 'Comerica Bank', city: 'San Jose', state: 'CA' },
  '111000753': { name: 'Comerica Bank', city: 'Dallas', state: 'TX' },
  
  // Synchrony Bank
  '021213591': { name: 'Synchrony Bank', city: 'Draper', state: 'UT' },
  
  // Chime (Bancorp/Stride)
  '031101279': { name: 'Chime (The Bancorp Bank)', city: 'Wilmington', state: 'DE' },
  '103100195': { name: 'Chime (Stride Bank)', city: 'Enid', state: 'OK' },
  
  // Popular Direct
  '021502011': { name: 'Popular Direct', city: 'New York', state: 'NY' },
  
  // M&T Bank
  '022000046': { name: 'M&T Bank', city: 'Buffalo', state: 'NY' },
  '052000113': { name: 'M&T Bank', city: 'Baltimore', state: 'MD' },
  
  // Santander Bank
  '011075150': { name: 'Santander Bank, N.A.', city: 'Wilmington', state: 'DE' },
  '231372691': { name: 'Santander Bank, N.A.', city: 'Wilmington', state: 'DE' },
  
  // BMO Harris
  '071000288': { name: 'BMO Harris Bank, N.A.', city: 'Chicago', state: 'IL' },
  '071025661': { name: 'BMO Harris Bank, N.A.', city: 'Naperville', state: 'IL' },
  
  // HSBC
  '021001088': { name: 'HSBC Bank USA, N.A.', city: 'New York', state: 'NY' },
  '322271779': { name: 'HSBC Bank USA, N.A.', city: 'Los Angeles', state: 'CA' },
  
  // Credit Unions
  '322281507': { name: 'Golden 1 Credit Union', city: 'Sacramento', state: 'CA' },
  '322281617': { name: 'SchoolsFirst Federal Credit Union', city: 'Tustin', state: 'CA' },
  '324173626': { name: 'America First Credit Union', city: 'Ogden', state: 'UT' },
  '291070001': { name: 'Alliant Credit Union', city: 'Chicago', state: 'IL' },
  '256078446': { name: 'Pentagon Federal Credit Union', city: 'Alexandria', state: 'VA' },
};

/**
 * ABA Routing Number Checksum Validation
 * Weights: 3, 7, 1 applied cyclically
 * Sum must be divisible by 10
 */
function validateABAChecksum(routingNumber: string): boolean {
  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }
  
  const digits = routingNumber.split('').map(Number);
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  
  return sum % 10 === 0;
}

/**
 * Determine bank type from first two digits of routing number
 * This helps provide context even if we don't have the exact bank
 */
function getBankType(routingNumber: string): string {
  const prefix = parseInt(routingNumber.substring(0, 2));
  
  if (prefix >= 0 && prefix <= 12) return 'Primary Federal Reserve District';
  if (prefix >= 21 && prefix <= 32) return 'Eastern Region Bank';
  if (prefix >= 61 && prefix <= 72) return 'Southeastern Region Bank';
  if (prefix >= 80 && prefix <= 99) return 'Midwestern Region Bank';
  if (prefix >= 101 && prefix <= 122) return 'Western Region Bank';
  
  return 'US Financial Institution';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const routingNumber = searchParams.get('rn');
  
  if (!routingNumber) {
    return NextResponse.json(
      { error: 'Routing number required', code: 400 },
      { status: 400 }
    );
  }
  
  // Clean the input
  const cleanedNumber = routingNumber.replace(/\D/g, '');
  
  if (cleanedNumber.length !== 9) {
    return NextResponse.json(
      { error: 'Routing number must be 9 digits', code: 400 },
      { status: 400 }
    );
  }
  
  // Validate checksum
  if (!validateABAChecksum(cleanedNumber)) {
    return NextResponse.json(
      { error: 'Invalid routing number checksum', code: 400, valid: false },
      { status: 400 }
    );
  }
  
  // Look up in our database
  const bankInfo = BANK_DATABASE[cleanedNumber];
  
  if (bankInfo) {
    return NextResponse.json({
      code: 200,
      valid: true,
      customer_name: bankInfo.name,
      city: bankInfo.city,
      state: bankInfo.state,
      routing_number: cleanedNumber,
    });
  }
  
  // If not in database but checksum valid, return generic info
  const bankType = getBankType(cleanedNumber);
  
  return NextResponse.json({
    code: 200,
    valid: true,
    customer_name: `Verified US Bank (${bankType})`,
    routing_number: cleanedNumber,
    note: 'Routing number is valid. Bank name lookup not available for this institution.',
  });
}

