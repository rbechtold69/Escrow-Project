/**
 * ============================================================================
 * ESCROWPAYI - COMPLIANT ESCROW ARCHITECTURE
 * ============================================================================
 * 
 * LEGAL COMPLIANCE ARCHITECTURE:
 * ────────────────────────────────────────────────────────────────────────────
 * 
 * 1. GOOD FUNDS COMPLIANCE
 *    - Funds must be settled and irreversible before disbursement
 *    - We wait for deposit.completed webhook (not deposit.pending)
 *    - USDC on-chain = settled funds (T+0 finality)
 * 
 * 2. NON-COMMINGLING COMPLIANCE  
 *    - Each deal gets its own segregated virtual account
 *    - Each deal gets its own custodial wallet (Bridge Wallet-as-a-Service)
 *    - Funds never touch a "master wallet" or pool
 *    - Clear audit trail: Deal ID → Virtual Account ID → Wallet ID
 * 
 * 3. NO MONEY TRANSMISSION
 *    - We NEVER hold private keys
 *    - All wallets are custodial via Bridge.xyz (Qualified Custodian)
 *    - We only orchestrate via API calls
 * 
 * ============================================================================
 * BRIDGE.XYZ API ENDPOINTS USED
 * ============================================================================
 * 
 * PHASE 1: SETUP
 * ─────────────────────────────────────────────────────────────────────────
 * POST /v0/customers                    - Create customer (Buyer KYC)
 * POST /v0/customers/{id}/wallets       - Create custodial wallet for deal
 * POST /v0/customers/{id}/virtual_accounts - Create virtual account for deposits
 * 
 * PHASE 2: HOLDING
 * ─────────────────────────────────────────────────────────────────────────
 * GET /v0/customers/{id}/wallets/{wallet_id}/balances - Check wallet balance
 * POST /webhooks - Receive deposit.completed events
 * 
 * PHASE 3: DISBURSEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * POST /v0/customers/{id}/external_accounts - Create recipient bank accounts
 * POST /v0/transfers/payouts            - Initiate RTP/Wire payout
 * 
 * ============================================================================
 */

import { prisma } from '@/lib/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface DealInitRequest {
  dealId: string;
  buyerInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    // For KYC if needed
    dateOfBirth?: string;
    taxId?: string; // SSN for US buyers (sent directly to Bridge, never stored)
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
  propertyAddress: string;
  expectedAmount: number;
}

export interface DealInitResult {
  success: boolean;
  dealId: string;
  bridgeCustomerId: string;
  bridgeWalletId: string;
  virtualAccountId: string;
  wiringInstructions: {
    accountNumber: string;
    routingNumber: string;
    bankName: string;
    bankAddress: string;
    beneficiaryName: string;
    reference: string;
    swiftCode?: string;
  };
}

export interface Recipient {
  name: string;
  amount: number;
  paymentRail: 'rtp' | 'wire' | 'ach';
  bankDetails: {
    routingNumber: string;
    accountNumber: string;
    accountType?: 'checking' | 'savings';
    // For wire
    bankName?: string;
    bankAddress?: string;
    swiftCode?: string;
  };
  metadata?: Record<string, string>;
}

export interface DisbursementResult {
  success: boolean;
  dealId: string;
  transfers: Array<{
    recipientName: string;
    amount: number;
    transferId: string;
    status: string;
    estimatedArrival?: string;
  }>;
}

// ============================================================================
// BRIDGE API CLIENT
// ============================================================================

class BridgeComplianceClient {
  private baseUrl: string;
  private apiKey: string;
  
  constructor() {
    this.baseUrl = process.env.BRIDGE_API_URL || 'https://api.sandbox.bridge.xyz';
    this.apiKey = process.env.BRIDGE_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('BRIDGE_API_KEY not configured');
    }
  }
  
  private getHeaders(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Api-Key': this.apiKey,
    };
    
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    
    return headers;
  }
  
  private async request<T>(
    method: string,
    path: string,
    body?: object,
    idempotencyKey?: string
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.getHeaders(idempotencyKey),
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Bridge API Error: ${error.message || error.code || response.status}`);
    }
    
    return response.json();
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // CUSTOMER MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════
  
  /**
   * Create a new customer in Bridge for KYC/compliance purposes
   * 
   * API: POST /v0/customers
   * Docs: https://docs.bridge.xyz/docs/customers
   */
  async createCustomer(params: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    type: 'individual' | 'business';
    // TODO: Check Bridge docs for exact KYC field names
    // These may include: date_of_birth, tax_id, address, etc.
  }): Promise<{ id: string; status: string }> {
    return this.request('POST', '/v0/customers', {
      type: params.type,
      first_name: params.firstName,
      last_name: params.lastName,
      email: params.email,
      phone: params.phone,
      // TODO: Add KYC fields based on Bridge documentation
      // kyc: {
      //   date_of_birth: params.dateOfBirth,
      //   tax_id: params.taxId,
      //   address: params.address,
      // }
    }, `customer-${params.email}`);
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // CUSTODIAL WALLETS (Segregated Per-Deal)
  // ════════════════════════════════════════════════════════════════════════
  
  /**
   * Create a segregated custodial wallet for a specific deal
   * This ensures non-commingling - each deal has its own wallet
   * 
   * API: POST /v0/customers/{customer_id}/wallets
   * Docs: https://docs.bridge.xyz/docs/wallets
   */
  async createCustodialWallet(params: {
    customerId: string;
    dealId: string;
    chain: 'base' | 'ethereum' | 'polygon';
  }): Promise<{
    id: string;
    address: string;
    chain: string;
    status: string;
  }> {
    return this.request(
      'POST',
      `/v0/customers/${params.customerId}/wallets`,
      {
        chain: params.chain,
        // TODO: Check Bridge docs for additional wallet creation params
        // Possible fields: label, metadata, etc.
        label: `Escrow-${params.dealId}`,
        metadata: {
          deal_id: params.dealId,
          type: 'escrow_holding',
        },
      },
      `wallet-${params.dealId}`
    );
  }
  
  /**
   * Get wallet balance
   * 
   * API: GET /v0/customers/{customer_id}/wallets/{wallet_id}/balances
   */
  async getWalletBalance(params: {
    customerId: string;
    walletId: string;
  }): Promise<{
    balances: Array<{
      currency: string;
      amount: string;
      available: string;
    }>;
  }> {
    return this.request(
      'GET',
      `/v0/customers/${params.customerId}/wallets/${params.walletId}/balances`
    );
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // VIRTUAL ACCOUNTS (Wire/ACH Deposit Rails)
  // ════════════════════════════════════════════════════════════════════════
  
  /**
   * Create a virtual account for receiving wire/ACH deposits
   * The destination is the deal's segregated custodial wallet
   * 
   * API: POST /v0/customers/{customer_id}/virtual_accounts
   * Docs: https://docs.bridge.xyz/docs/virtual-accounts
   */
  async createVirtualAccount(params: {
    customerId: string;
    dealId: string;
    destinationWalletAddress: string;
    buyerName: string;
  }): Promise<{
    id: string;
    source_deposit_instructions: {
      bank_account_number: string;
      bank_routing_number: string;
      bank_name: string;
      bank_address?: string;
      bank_beneficiary_name: string;
    };
    status: string;
  }> {
    return this.request(
      'POST',
      `/v0/customers/${params.customerId}/virtual_accounts`,
      {
        source: {
          currency: 'usd',
          payment_rail: 'wire', // Can also be 'ach'
        },
        destination: {
          currency: 'usdc',
          payment_rail: 'base', // USDC on Base
          address: params.destinationWalletAddress,
        },
        // TODO: Check Bridge docs for beneficiary_name format requirements
        beneficiary_name: `EscrowPayi FBO ${params.buyerName}`,
        external_id: params.dealId,
        metadata: {
          deal_id: params.dealId,
          type: 'escrow_deposit',
        },
      },
      `va-${params.dealId}`
    );
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // EXTERNAL ACCOUNTS (Payout Destinations)
  // ════════════════════════════════════════════════════════════════════════
  
  /**
   * Create an external account for RTP/Wire/ACH payouts
   * 
   * API: POST /v0/customers/{customer_id}/external_accounts
   * Docs: https://docs.bridge.xyz/docs/external-accounts
   */
  async createExternalAccount(params: {
    customerId: string;
    accountOwnerName: string;
    routingNumber: string;
    accountNumber: string;
    accountType: 'checking' | 'savings';
    bankName?: string;
    // For wire
    bankAddress?: string;
    swiftCode?: string;
  }): Promise<{
    id: string;
    type: string;
    status: string;
    last_4: string;
  }> {
    return this.request(
      'POST',
      `/v0/customers/${params.customerId}/external_accounts`,
      {
        // TODO: Check Bridge docs for exact field names
        account_owner_name: params.accountOwnerName,
        routing_number: params.routingNumber,
        account_number: params.accountNumber,
        account_type: params.accountType,
        bank_name: params.bankName,
        // For international wires
        // swift_code: params.swiftCode,
        // bank_address: params.bankAddress,
      },
      `ext-${params.routingNumber}-${params.accountNumber.slice(-4)}`
    );
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // PAYOUTS (RTP/Wire/ACH Disbursements)
  // ════════════════════════════════════════════════════════════════════════
  
  /**
   * Initiate a payout from the deal's custodial wallet to an external account
   * Uses RTP (Real-Time Payments) for instant settlement when possible
   * 
   * API: POST /v0/transfers/payouts
   * Docs: https://docs.bridge.xyz/docs/payouts
   */
  async initiatePayout(params: {
    customerId: string;
    sourceWalletId: string;
    destinationExternalAccountId: string;
    amount: number; // In USD
    paymentRail: 'rtp' | 'wire' | 'ach';
    memo?: string;
    metadata?: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{
    id: string;
    status: string;
    amount: string;
    currency: string;
    payment_rail: string;
    estimated_arrival?: string;
  }> {
    return this.request(
      'POST',
      '/v0/transfers/payouts',
      {
        // Source: The deal's custodial wallet
        source: {
          customer_id: params.customerId,
          wallet_id: params.sourceWalletId,
          currency: 'usdc',
          payment_rail: 'base',
        },
        // Destination: Recipient's bank account
        destination: {
          external_account_id: params.destinationExternalAccountId,
          currency: 'usd',
          payment_rail: params.paymentRail,
        },
        amount: params.amount.toFixed(2),
        // TODO: Check Bridge docs for memo/reference field name
        memo: params.memo,
        metadata: params.metadata,
      },
      params.idempotencyKey
    );
  }
  
  /**
   * Get payout status
   * 
   * API: GET /v0/transfers/{transfer_id}
   */
  async getPayoutStatus(transferId: string): Promise<{
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    amount: string;
    currency: string;
    failure_reason?: string;
  }> {
    return this.request('GET', `/v0/transfers/${transferId}`);
  }
}

// ============================================================================
// PHASE 1: INITIALIZE DEAL
// ============================================================================

/**
 * Initialize a new Real Estate Deal with segregated accounts
 * 
 * This function:
 * 1. Creates a Customer in Bridge (Buyer KYC)
 * 2. Creates a Custodial Wallet for this specific deal (segregation)
 * 3. Creates a Virtual Account pointing to that wallet
 * 4. Returns wiring instructions for the buyer
 * 
 * COMPLIANCE:
 * ✅ Non-Commingling: Each deal gets its own wallet
 * ✅ No Money Transmission: Wallet is custodial (Bridge holds keys)
 * ✅ Audit Trail: All IDs are linked in our database
 */
export async function initializeDeal(request: DealInitRequest): Promise<DealInitResult> {
  const bridge = new BridgeComplianceClient();
  
  console.log(`[DEAL:${request.dealId}] Initializing compliant escrow...`);
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: Create Customer (Buyer) in Bridge
  // ════════════════════════════════════════════════════════════════════════
  // This establishes the legal entity receiving funds
  
  const customer = await bridge.createCustomer({
    firstName: request.buyerInfo.firstName,
    lastName: request.buyerInfo.lastName,
    email: request.buyerInfo.email,
    phone: request.buyerInfo.phone,
    type: 'individual',
  });
  
  console.log(`[DEAL:${request.dealId}] Created customer: ${customer.id}`);
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: Create Segregated Custodial Wallet for this Deal
  // ════════════════════════════════════════════════════════════════════════
  // This is the KEY to non-commingling - each deal has its own wallet
  
  const wallet = await bridge.createCustodialWallet({
    customerId: customer.id,
    dealId: request.dealId,
    chain: 'base', // USDC on Base for low fees
  });
  
  console.log(`[DEAL:${request.dealId}] Created segregated wallet: ${wallet.id} (${wallet.address})`);
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: Create Virtual Account pointing to the Deal's Wallet
  // ════════════════════════════════════════════════════════════════════════
  // Wire transfers to this account automatically convert USD → USDC
  // and deposit into the deal's segregated wallet
  
  const virtualAccount = await bridge.createVirtualAccount({
    customerId: customer.id,
    dealId: request.dealId,
    destinationWalletAddress: wallet.address,
    buyerName: `${request.buyerInfo.firstName} ${request.buyerInfo.lastName}`,
  });
  
  console.log(`[DEAL:${request.dealId}] Created virtual account: ${virtualAccount.id}`);
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: Store in Database (Audit Trail)
  // ════════════════════════════════════════════════════════════════════════
  
  // First, ensure we have a user (could be system or escrow officer)
  const systemUser = await prisma.user.upsert({
    where: { walletAddress: '0x0000000000000000000000000000000000000000' },
    update: {},
    create: {
      walletAddress: '0x0000000000000000000000000000000000000000',
      displayName: 'System',
      role: 'ADMIN',
    },
  });
  
  // Create or update escrow with Bridge IDs
  await prisma.escrow.upsert({
    where: { escrowId: request.dealId },
    update: {
      bridgeCustomerId: customer.id,
      bridgeWalletId: wallet.id,
      bridgeWalletAddress: wallet.address,
      bridgeVirtualAccountId: virtualAccount.id,
      status: 'CREATED',
    },
    create: {
      escrowId: request.dealId,
      propertyAddress: request.propertyAddress,
      city: '',
      state: '',
      zipCode: '',
      purchasePrice: request.expectedAmount,
      buyerFirstName: request.buyerInfo.firstName,
      buyerLastName: request.buyerInfo.lastName,
      buyerEmail: request.buyerInfo.email,
      bridgeCustomerId: customer.id,
      bridgeWalletId: wallet.id,
      bridgeWalletAddress: wallet.address,
      bridgeVirtualAccountId: virtualAccount.id,
      status: 'CREATED',
      createdById: systemUser.id,
    },
  });
  
  // Create activity log
  await prisma.activityLog.create({
    data: {
      escrowId: (await prisma.escrow.findUnique({ where: { escrowId: request.dealId } }))!.id,
      action: 'DEAL_INITIALIZED',
      details: {
        bridgeCustomerId: customer.id,
        bridgeWalletId: wallet.id,
        bridgeWalletAddress: wallet.address,
        bridgeVirtualAccountId: virtualAccount.id,
        expectedAmount: request.expectedAmount,
      },
    },
  });
  
  console.log(`[DEAL:${request.dealId}] ✅ Deal initialized successfully`);
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: Return Wiring Instructions
  // ════════════════════════════════════════════════════════════════════════
  
  const depositInstructions = virtualAccount.source_deposit_instructions;
  
  return {
    success: true,
    dealId: request.dealId,
    bridgeCustomerId: customer.id,
    bridgeWalletId: wallet.id,
    virtualAccountId: virtualAccount.id,
    wiringInstructions: {
      accountNumber: depositInstructions.bank_account_number,
      routingNumber: depositInstructions.bank_routing_number,
      bankName: depositInstructions.bank_name,
      bankAddress: depositInstructions.bank_address || '30 W. 26th Street, Sixth Floor, New York, NY 10010',
      beneficiaryName: depositInstructions.bank_beneficiary_name,
      reference: request.dealId,
      swiftCode: 'MCLOINUS1', // TODO: Check Bridge docs for actual SWIFT code
    },
  };
}

// ============================================================================
// PHASE 2: WEBHOOK HANDLER (Deposit Received)
// ============================================================================

export interface DepositWebhookEvent {
  id: string;
  type: 'deposit.received' | 'deposit.completed' | 'deposit.failed';
  data: {
    virtual_account_id: string;
    amount: string;
    currency: string;
    status: string;
    external_id?: string; // Our dealId
    metadata?: Record<string, string>;
    source?: {
      sender_name?: string;
      bank_name?: string;
    };
    destination?: {
      wallet_id: string;
      address: string;
    };
    transaction_hash?: string;
    created_at: string;
  };
}

/**
 * Handle deposit.received webhook from Bridge
 * 
 * This function:
 * 1. Verifies the deposit is associated with a valid deal
 * 2. Verifies funds are in the correct segregated wallet
 * 3. Updates database status to FUNDS_SECURED
 * 
 * COMPLIANCE:
 * ✅ Good Funds: We only mark as SECURED after deposit.completed (not pending)
 * ✅ Non-Commingling: We verify wallet address matches the deal's wallet
 * ✅ Audit Trail: Full logging of deposit details
 */
export async function handleDepositReceived(event: DepositWebhookEvent): Promise<{
  success: boolean;
  dealId?: string;
  error?: string;
}> {
  console.log(`[WEBHOOK] Deposit event: ${event.type} for ${event.data.virtual_account_id}`);
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: Get Deal ID from metadata or external_id
  // ════════════════════════════════════════════════════════════════════════
  
  const dealId = event.data.external_id || event.data.metadata?.deal_id;
  
  if (!dealId) {
    console.error('[WEBHOOK] No deal_id in deposit event');
    return { success: false, error: 'Missing deal_id in webhook' };
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: Fetch Escrow from Database
  // ════════════════════════════════════════════════════════════════════════
  
  const escrow = await prisma.escrow.findUnique({
    where: { escrowId: dealId },
  });
  
  if (!escrow) {
    console.error(`[WEBHOOK] Escrow not found: ${dealId}`);
    return { success: false, error: 'Escrow not found' };
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: CRITICAL - Verify funds are in the correct wallet
  // ════════════════════════════════════════════════════════════════════════
  // This is the non-commingling verification step
  
  const destinationWallet = event.data.destination;
  
  if (destinationWallet && escrow.bridgeWalletAddress) {
    if (destinationWallet.address.toLowerCase() !== escrow.bridgeWalletAddress.toLowerCase()) {
      console.error(`[WEBHOOK] CRITICAL: Deposit to wrong wallet!`);
      console.error(`  Expected: ${escrow.bridgeWalletAddress}`);
      console.error(`  Received: ${destinationWallet.address}`);
      
      // This should NEVER happen - indicates a serious configuration issue
      await prisma.activityLog.create({
        data: {
          escrowId: escrow.id,
          action: 'DEPOSIT_WALLET_MISMATCH',
          details: {
            expected: escrow.bridgeWalletAddress,
            received: destinationWallet.address,
            amount: event.data.amount,
          },
        },
      });
      
      return { success: false, error: 'Wallet address mismatch' };
    }
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: Update Escrow Status based on event type
  // ════════════════════════════════════════════════════════════════════════
  
  const amount = parseFloat(event.data.amount);
  
  if (event.type === 'deposit.completed') {
    // ✅ GOOD FUNDS - Deposit is complete and irreversible
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'FUNDS_RECEIVED',
        fundedAt: new Date(),
        currentBalance: amount,
        depositTxHash: event.data.transaction_hash,
      },
    });
    
    console.log(`[WEBHOOK] ✅ Deal ${dealId} FUNDS_SECURED: $${amount}`);
    
  } else if (event.type === 'deposit.received') {
    // ⏳ Funds received but not yet confirmed
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'DEPOSIT_PENDING',
        // Don't update currentBalance until confirmed
      },
    });
    
    console.log(`[WEBHOOK] ⏳ Deal ${dealId} deposit pending: $${amount}`);
    
  } else if (event.type === 'deposit.failed') {
    // ❌ Deposit failed
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'CREATED', // Back to awaiting funds
      },
    });
    
    console.log(`[WEBHOOK] ❌ Deal ${dealId} deposit failed`);
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: Create Audit Log
  // ════════════════════════════════════════════════════════════════════════
  
  await prisma.activityLog.create({
    data: {
      escrowId: escrow.id,
      action: `DEPOSIT_${event.type.split('.')[1].toUpperCase()}`,
      details: {
        amount: event.data.amount,
        currency: event.data.currency,
        virtualAccountId: event.data.virtual_account_id,
        transactionHash: event.data.transaction_hash,
        senderName: event.data.source?.sender_name,
        senderBank: event.data.source?.bank_name,
      },
    },
  });
  
  return { success: true, dealId };
}

// ============================================================================
// PHASE 3: DISBURSE FUNDS (Close Escrow)
// ============================================================================

/**
 * Disburse funds to all recipients
 * 
 * This function:
 * 1. Validates escrow is in FUNDS_RECEIVED status (Good Funds)
 * 2. Creates external accounts for each recipient
 * 3. Initiates RTP payouts from the deal's wallet
 * 4. Uses idempotency keys to prevent double-payments
 * 
 * COMPLIANCE:
 * ✅ Good Funds: Only disburses after funds are settled
 * ✅ Non-Commingling: Pays from the deal's specific wallet
 * ✅ RTP Rails: Uses Real-Time Payments for instant settlement
 * ✅ Idempotency: Prevents double-payment on retry
 */
export async function disburseFunds(
  dealId: string,
  recipients: Recipient[]
): Promise<DisbursementResult> {
  const bridge = new BridgeComplianceClient();
  
  console.log(`[DISBURSE:${dealId}] Starting disbursement to ${recipients.length} recipients...`);
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: Fetch and Validate Escrow
  // ════════════════════════════════════════════════════════════════════════
  
  const escrow = await prisma.escrow.findUnique({
    where: { escrowId: dealId },
    include: { payees: true },
  });
  
  if (!escrow) {
    throw new Error(`Escrow not found: ${dealId}`);
  }
  
  if (escrow.status !== 'FUNDS_RECEIVED' && escrow.status !== 'READY_TO_CLOSE') {
    throw new Error(`Cannot disburse: Escrow status is ${escrow.status}. Must be FUNDS_RECEIVED.`);
  }
  
  if (!escrow.bridgeCustomerId || !escrow.bridgeWalletId) {
    throw new Error('Escrow missing Bridge credentials');
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: Verify Total Amount Matches Balance (Good Funds Check)
  // ════════════════════════════════════════════════════════════════════════
  
  const totalToDisburse = recipients.reduce((sum, r) => sum + r.amount, 0);
  const currentBalance = Number(escrow.currentBalance) || 0;
  
  if (totalToDisburse > currentBalance) {
    throw new Error(
      `Disbursement total ($${totalToDisburse}) exceeds balance ($${currentBalance})`
    );
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: Update Status to CLOSING
  // ════════════════════════════════════════════════════════════════════════
  
  await prisma.escrow.update({
    where: { id: escrow.id },
    data: { status: 'CLOSING' },
  });
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: Process Each Recipient
  // ════════════════════════════════════════════════════════════════════════
  
  const results: DisbursementResult['transfers'] = [];
  
  for (const recipient of recipients) {
    try {
      // ════════════════════════════════════════════════════════════════════
      // 4a: Create External Account for Recipient
      // ════════════════════════════════════════════════════════════════════
      
      const externalAccount = await bridge.createExternalAccount({
        customerId: escrow.bridgeCustomerId!,
        accountOwnerName: recipient.name,
        routingNumber: recipient.bankDetails.routingNumber,
        accountNumber: recipient.bankDetails.accountNumber,
        accountType: recipient.bankDetails.accountType || 'checking',
        bankName: recipient.bankDetails.bankName,
      });
      
      console.log(`[DISBURSE:${dealId}] Created external account for ${recipient.name}: ${externalAccount.id}`);
      
      // ════════════════════════════════════════════════════════════════════
      // 4b: Initiate RTP Payout
      // ════════════════════════════════════════════════════════════════════
      // Idempotency key prevents double-payment if this function is retried
      
      const idempotencyKey = `payout-${dealId}-${recipient.name.replace(/\s+/g, '-')}-${recipient.amount}`;
      
      const payout = await bridge.initiatePayout({
        customerId: escrow.bridgeCustomerId!,
        sourceWalletId: escrow.bridgeWalletId!,
        destinationExternalAccountId: externalAccount.id,
        amount: recipient.amount,
        paymentRail: recipient.paymentRail,
        memo: `Escrow ${dealId} - ${recipient.metadata?.description || 'Disbursement'}`,
        metadata: {
          deal_id: dealId,
          recipient_name: recipient.name,
          ...recipient.metadata,
        },
        idempotencyKey,
      });
      
      console.log(`[DISBURSE:${dealId}] ✅ Initiated ${recipient.paymentRail.toUpperCase()} to ${recipient.name}: $${recipient.amount}`);
      
      results.push({
        recipientName: recipient.name,
        amount: recipient.amount,
        transferId: payout.id,
        status: payout.status,
        estimatedArrival: payout.estimated_arrival,
      });
      
      // ════════════════════════════════════════════════════════════════════
      // 4c: Update Payee in Database (if exists)
      // ════════════════════════════════════════════════════════════════════
      
      const existingPayee = escrow.payees.find(
        p => `${p.firstName} ${p.lastName}`.toLowerCase() === recipient.name.toLowerCase()
      );
      
      if (existingPayee) {
        await prisma.payee.update({
          where: { id: existingPayee.id },
          data: {
            status: 'PROCESSING',
            bridgeTransferId: payout.id,
            bridgeBeneficiaryId: externalAccount.id,
          },
        });
      }
      
    } catch (error: any) {
      console.error(`[DISBURSE:${dealId}] ❌ Failed for ${recipient.name}:`, error.message);
      
      results.push({
        recipientName: recipient.name,
        amount: recipient.amount,
        transferId: '',
        status: 'failed',
      });
    }
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: Check if All Payouts Succeeded
  // ════════════════════════════════════════════════════════════════════════
  
  const allSucceeded = results.every(r => r.status !== 'failed');
  
  if (allSucceeded) {
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
  } else {
    // Some failed - revert to FUNDS_RECEIVED so we can retry
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'FUNDS_RECEIVED',
      },
    });
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // STEP 6: Audit Log
  // ════════════════════════════════════════════════════════════════════════
  
  await prisma.activityLog.create({
    data: {
      escrowId: escrow.id,
      action: allSucceeded ? 'DISBURSEMENT_COMPLETED' : 'DISBURSEMENT_PARTIAL',
      details: {
        totalDisbursed: results.filter(r => r.status !== 'failed').reduce((s, r) => s + r.amount, 0),
        recipientCount: recipients.length,
        successCount: results.filter(r => r.status !== 'failed').length,
        failedCount: results.filter(r => r.status === 'failed').length,
        transfers: results,
      },
    },
  });
  
  console.log(`[DISBURSE:${dealId}] ${allSucceeded ? '✅ Complete' : '⚠️ Partial'}`);
  
  return {
    success: allSucceeded,
    dealId,
    transfers: results,
  };
}

// ============================================================================
// UTILITY: Get Wallet Balance
// ============================================================================

/**
 * Get current balance of a deal's segregated wallet
 * Useful for UI display and validation
 */
export async function getDealBalance(dealId: string): Promise<{
  usdcBalance: number;
  usdBalance: number;
  lastUpdated: Date;
}> {
  const bridge = new BridgeComplianceClient();
  
  const escrow = await prisma.escrow.findUnique({
    where: { escrowId: dealId },
  });
  
  if (!escrow || !escrow.bridgeCustomerId || !escrow.bridgeWalletId) {
    throw new Error('Escrow or wallet not found');
  }
  
  const balances = await bridge.getWalletBalance({
    customerId: escrow.bridgeCustomerId,
    walletId: escrow.bridgeWalletId,
  });
  
  const usdcBalance = balances.balances.find(b => b.currency === 'usdc');
  
  return {
    usdcBalance: parseFloat(usdcBalance?.available || '0'),
    usdBalance: parseFloat(usdcBalance?.available || '0'), // USDC is 1:1 with USD
    lastUpdated: new Date(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { BridgeComplianceClient };
