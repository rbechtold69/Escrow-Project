/**
 * ============================================================================
 * BRIDGE.XYZ API CLIENT
 * ============================================================================
 * 
 * Complete client for Bridge.xyz payment infrastructure
 * 
 * ARCHITECTURE:
 * - EscrowPayi NEVER touches money or holds private keys
 * - All funds custody is handled by Bridge.xyz
 * - We only orchestrate via API calls
 * 
 * FLOW:
 * 1. Create Wallet (per escrow) → Segregated fund holding
 * 2. Create Virtual Account → Wire/ACH deposit instructions
 * 3. Create External Account → Payee bank accounts
 * 4. Create Transfer → Disburse funds
 * 
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

// ════════════════════════════════════════════════════════════════════════════
// CUSTOMER TYPES (KYB/KYC)
// ════════════════════════════════════════════════════════════════════════════

export interface BridgeBusinessCustomer {
  id: string;
  type: 'business';
  business_name: string;
  email: string;
  created_at: string;
  updated_at?: string;
  endorsements?: Array<{
    name: string;
    status: 'approved' | 'pending' | 'incomplete' | 'rejected';
    requirements?: {
      complete: string[];
      pending: string[];
      missing: { all_of?: string[] } | null;
      issues: string[];
    };
  }>;
}

export interface BridgeAssociatedPerson {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  title?: string;
  is_control_person: boolean;
  ownership_percentage?: number;
  created_at: string;
}

export interface BridgeKycLink {
  id: string;
  full_name: string;
  email: string;
  type: 'individual' | 'business';
  kyc_link: string;       // URL for identity verification
  tos_link: string;       // URL for terms of service acceptance
  kyc_status: 'not_started' | 'under_review' | 'incomplete' | 'approved' | 'rejected';
  tos_status: 'pending' | 'approved';
  rejection_reasons: string[];
  created_at: string;
  customer_id: string;
}

// ════════════════════════════════════════════════════════════════════════════
// WALLET & ACCOUNT TYPES
// ════════════════════════════════════════════════════════════════════════════

export interface BridgeWallet {
  id: string;
  chain: string;
  address: string;
  created_at: string;
  updated_at?: string;
  balances?: Array<{
    balance: string;
    currency: string;
    chain: string;
    contract_address?: string;
  }>;
}

export interface BridgeVirtualAccount {
  id: string;
  status: 'activated' | 'pending' | 'deactivated';
  customer_id: string;
  created_at: string;
  developer_fee_percent?: string;
  source_deposit_instructions: {
    currency: string;
    bank_name: string;
    bank_address: string;
    bank_routing_number: string;
    bank_account_number: string;
    bank_beneficiary_name: string;
    bank_beneficiary_address?: string;
    payment_rail: string;
    payment_rails: string[];
  };
  destination: {
    currency: string;
    payment_rail: string;
    bridge_wallet_id?: string;
    address?: string;
  };
}

export interface VirtualAccountEvent {
  id: string;
  type: 'funds_received' | 'payment_submitted' | 'payment_processed' | 'funds_scheduled' | 'in_review' | 'refunded' | 'microdeposit';
  currency: string;
  created_at: string;
  customer_id: string;
  virtual_account_id: string;
  amount: string;
  developer_fee_amount?: string;
  exchange_fee_amount?: string;
  subtotal_amount?: string;
  gas_fee?: string;
  deposit_id?: string;
  source?: {
    payment_rail: string;
    description?: string;
    sender_name?: string;
    sender_bank_routing_number?: string;
    trace_number?: string;
  };
  destination_tx_hash?: string;
  receipt?: {
    initial_amount: string;
    developer_fee: string;
    exchange_fee: string;
    subtotal_amount: string;
    url?: string;
    gas_fee: string;
    final_amount: string;
    destination_tx_hash?: string;
  };
}

export interface BridgeExternalAccount {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  bank_name: string;
  account_name: string;
  account_owner_name: string;
  active: boolean;
  currency: string;
  account_owner_type: 'individual' | 'business';
  account_type: string;
  first_name: string;
  last_name: string;
  business_name?: string;
  account?: {
    last_4: string;
    routing_number: string;
    checking_or_savings: string;
  };
  last_4: string;
}

export interface BridgeTransfer {
  id: string;
  state: 'awaiting_funds' | 'payment_submitted' | 'payment_processed' | 'failed';
  amount: string;
  on_behalf_of?: string;
  developer_fee?: string;
  source: {
    payment_rail: string;
    currency: string;
    bridge_wallet_id?: string;
  };
  destination: {
    payment_rail: string;
    currency: string;
    external_account_id?: string;
    to_address?: string;
  };
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// BRIDGE CLIENT CLASS
// ============================================================================

export class BridgeClient {
  private baseUrl: string;
  private apiKey: string;
  private customerId: string;

  constructor() {
    this.baseUrl = process.env.BRIDGE_API_URL || 'https://api.sandbox.bridge.xyz';
    this.apiKey = process.env.BRIDGE_API_KEY || '';
    this.customerId = process.env.BRIDGE_CUSTOMER_ID || '';

    if (!this.apiKey) {
      throw new Error('BRIDGE_API_KEY environment variable is required');
    }
    if (!this.customerId) {
      throw new Error('BRIDGE_CUSTOMER_ID environment variable is required');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════

  private getHeaders(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Api-Key': this.apiKey,
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    return headers;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: object,
    idempotencyKey?: string
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    console.log(`[Bridge] ${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers: this.getHeaders(idempotencyKey),
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = `Bridge API Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = `Bridge API Error: ${errorData.message || errorData.error || response.statusText}`;
        console.error('[Bridge] Error:', errorData);
      } catch {
        console.error('[Bridge] Error:', responseText);
      }
      throw new Error(errorMessage);
    }

    return responseText ? JSON.parse(responseText) : ({} as T);
  }

  // ════════════════════════════════════════════════════════════════════════
  // WALLETS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create a new custodial wallet for an escrow
   * Each escrow gets its own wallet for fund segregation
   * 
   * @param escrowId - Unique escrow identifier (used as idempotency key)
   * @param chain - Blockchain: 'base', 'ethereum', 'solana'
   */
  async createWallet(escrowId: string, chain: string = 'base'): Promise<BridgeWallet> {
    return this.request<BridgeWallet>(
      'POST',
      `/v0/customers/${this.customerId}/wallets`,
      { chain },
      `wallet-${escrowId}`
    );
  }

  /**
   * Get wallet details including balances
   */
  async getWallet(walletId: string): Promise<BridgeWallet> {
    return this.request<BridgeWallet>(
      'GET',
      `/v0/customers/${this.customerId}/wallets/${walletId}`
    );
  }

  /**
   * List all wallets for the customer
   */
  async listWallets(): Promise<{ data: BridgeWallet[] }> {
    return this.request<{ data: BridgeWallet[] }>(
      'GET',
      `/v0/customers/${this.customerId}/wallets`
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // VIRTUAL ACCOUNTS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create a virtual account that receives USD and deposits to a wallet
   * 
   * Currency options:
   * - USDB (yieldEnabled=true): Yield-earning stablecoin, 1:1 with USD
   * - USDC (yieldEnabled=false): Standard stablecoin, no yield
   * 
   * LEGAL COMPLIANCE: If USDB is used, 100% of yield earned MUST be 
   * returned to the buyer (depositor) at escrow close.
   * 
   * @param escrowId - Unique escrow identifier (used as idempotency key)
   * @param walletId - Bridge wallet ID to receive the converted stablecoin
   * @param yieldEnabled - true = USDB (yield), false = USDC (no yield)
   */
  async createVirtualAccount(
    escrowId: string,
    walletId: string,
    yieldEnabled: boolean = true
  ): Promise<BridgeVirtualAccount> {
    // Buyer's choice: USDB for yield, USDC for no yield
    const destinationCurrency = yieldEnabled ? 'usdb' : 'usdc';
    
    const body: Record<string, any> = {
      source: {
        currency: 'usd',
      },
      destination: {
        payment_rail: 'base',
        currency: destinationCurrency,
        bridge_wallet_id: walletId,
      },
    };

    // NOTE: We intentionally do NOT set developer_fee_percent for escrow
    // All yield must go to the buyer (depositor) per legal requirements

    console.log(`[Bridge] Creating virtual account with ${destinationCurrency.toUpperCase()} (yield ${yieldEnabled ? 'ON' : 'OFF'})`);

    return this.request<BridgeVirtualAccount>(
      'POST',
      `/v0/customers/${this.customerId}/virtual_accounts`,
      body,
      `va-${escrowId}`
    );
  }

  /**
   * Get virtual account details
   */
  async getVirtualAccount(virtualAccountId: string): Promise<BridgeVirtualAccount> {
    return this.request<BridgeVirtualAccount>(
      'GET',
      `/v0/customers/${this.customerId}/virtual_accounts/${virtualAccountId}`
    );
  }

  /**
   * List all virtual accounts
   */
  async listVirtualAccounts(): Promise<{ data: BridgeVirtualAccount[] }> {
    return this.request<{ data: BridgeVirtualAccount[] }>(
      'GET',
      `/v0/customers/${this.customerId}/virtual_accounts`
    );
  }

  /**
   * Get virtual account activity/history
   * 
   * Returns all deposit events for a virtual account including:
   * - funds_received: Fiat funds arrived
   * - payment_submitted: Crypto conversion in progress
   * - payment_processed: Funds delivered on-chain (final state)
   * - funds_scheduled: ACH funds in transit
   * - in_review: Under manual review
   * - refunded: Funds returned to sender
   * 
   * @param virtualAccountId - Virtual account ID
   */
  async getVirtualAccountHistory(virtualAccountId: string): Promise<{
    count: number;
    data: VirtualAccountEvent[];
  }> {
    return this.request<{ count: number; data: VirtualAccountEvent[] }>(
      'GET',
      `/v0/customers/${this.customerId}/virtual_accounts/${virtualAccountId}/history`
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // EXTERNAL ACCOUNTS (Payee Bank Accounts)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create a US bank account for a payee
   * 
   * @param payeeId - Unique payee identifier (used as idempotency key)
   * @param params - Bank account details
   */
  async createExternalAccount(
    payeeId: string,
    params: {
      firstName: string;
      lastName: string;
      bankName: string;
      routingNumber: string;
      accountNumber: string;
      accountType: 'checking' | 'savings';
      address: {
        streetLine1: string;
        streetLine2?: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
    }
  ): Promise<BridgeExternalAccount> {
    return this.request<BridgeExternalAccount>(
      'POST',
      `/v0/customers/${this.customerId}/external_accounts`,
      {
        currency: 'usd',
        account_type: 'us',
        bank_name: params.bankName,
        account_name: `${params.firstName} ${params.lastName} Account`,
        first_name: params.firstName,
        last_name: params.lastName,
        account_owner_type: 'individual',
        account_owner_name: `${params.firstName} ${params.lastName}`,
        account: {
          routing_number: params.routingNumber,
          account_number: params.accountNumber,
          checking_or_savings: params.accountType,
        },
        address: {
          street_line_1: params.address.streetLine1,
          street_line_2: params.address.streetLine2,
          city: params.address.city,
          state: params.address.state,
          postal_code: params.address.postalCode,
          country: params.address.country || 'USA',
        },
      },
      `ext-${payeeId}`
    );
  }

  /**
   * Get external account details
   */
  async getExternalAccount(externalAccountId: string): Promise<BridgeExternalAccount> {
    return this.request<BridgeExternalAccount>(
      'GET',
      `/v0/customers/${this.customerId}/external_accounts/${externalAccountId}`
    );
  }

  /**
   * List all external accounts
   */
  async listExternalAccounts(): Promise<{ data: BridgeExternalAccount[] }> {
    return this.request<{ data: BridgeExternalAccount[] }>(
      'GET',
      `/v0/customers/${this.customerId}/external_accounts`
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // TRANSFERS (Payouts)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Transfer funds from a Bridge wallet to an external bank account (ACH/Wire)
   * 
   * Converts USDB/USDC to USD for the bank transfer.
   * 
   * @param transferId - Unique transfer identifier (used as idempotency key)
   * @param params - Transfer details
   */
  async transferToBank(
    transferId: string,
    params: {
      amount: string;
      sourceWalletId: string;
      destinationExternalAccountId: string;
      paymentRail: 'ach' | 'wire';
      sourceCurrency?: 'usdb' | 'usdc';  // Based on escrow's yieldEnabled setting
    }
  ): Promise<BridgeTransfer> {
    return this.request<BridgeTransfer>(
      'POST',
      '/v0/transfers',
      {
        amount: params.amount,
        on_behalf_of: this.customerId,
        source: {
          payment_rail: 'bridge_wallet',
          currency: params.sourceCurrency || 'usdb',  // Default to USDB
          bridge_wallet_id: params.sourceWalletId,
        },
        destination: {
          payment_rail: params.paymentRail,
          currency: 'usd',
          external_account_id: params.destinationExternalAccountId,
        },
      },
      transferId
    );
  }

  /**
   * Transfer stablecoin directly to a crypto wallet address
   * 
   * Note: For crypto payouts, we convert to USDC for the recipient
   * since USDC is more widely accepted/liquid.
   * 
   * @param transferId - Unique transfer identifier (used as idempotency key)
   * @param params - Transfer details
   */
  async transferToCrypto(
    transferId: string,
    params: {
      amount: string;
      sourceWalletId: string;
      destinationAddress: string;
      destinationChain?: string;
      sourceCurrency?: 'usdb' | 'usdc';  // Based on escrow's yieldEnabled setting
    }
  ): Promise<BridgeTransfer> {
    return this.request<BridgeTransfer>(
      'POST',
      '/v0/transfers',
      {
        amount: params.amount,
        on_behalf_of: this.customerId,
        source: {
          payment_rail: 'bridge_wallet',
          currency: params.sourceCurrency || 'usdb',  // Default to USDB
          bridge_wallet_id: params.sourceWalletId,
        },
        destination: {
          payment_rail: params.destinationChain || 'base',
          currency: 'usdc',  // Convert to USDC for recipient (more liquid)
          to_address: params.destinationAddress,
        },
      },
      transferId
    );
  }

  /**
   * Get transfer status
   */
  async getTransfer(transferId: string): Promise<BridgeTransfer> {
    return this.request<BridgeTransfer>(
      'GET',
      `/v0/transfers/${transferId}`
    );
  }

  /**
   * List all transfers
   */
  async listTransfers(): Promise<{ data: BridgeTransfer[] }> {
    return this.request<{ data: BridgeTransfer[] }>(
      'GET',
      '/v0/transfers'
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // BUSINESS CUSTOMERS (KYB)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create a Business Customer for an Escrow Company
   * 
   * This is Step 1 of the KYB process. After creating the customer,
   * you must add associated persons and generate KYC links.
   * 
   * @param idempotencyKey - Unique key to prevent duplicate customers
   * @param params - Business customer details
   */
  async createBusinessCustomer(
    idempotencyKey: string,
    params: {
      companyName: string;
      email: string;
      einTaxId: string;
      website?: string;
      address: {
        streetLine1: string;
        streetLine2?: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
    }
  ): Promise<BridgeBusinessCustomer> {
    return this.request<BridgeBusinessCustomer>(
      'POST',
      '/v0/customers',
      {
        type: 'business',
        business_name: params.companyName,
        email: params.email,
        tax_identification_number: params.einTaxId,
        website: params.website,
        address: {
          street_line_1: params.address.streetLine1,
          street_line_2: params.address.streetLine2,
          city: params.address.city,
          subdivision: params.address.state,
          postal_code: params.address.postalCode,
          country: params.address.country || 'USA',
        },
      },
      idempotencyKey
    );
  }

  /**
   * Get a customer by ID
   */
  async getCustomer(customerId: string): Promise<BridgeBusinessCustomer> {
    return this.request<BridgeBusinessCustomer>(
      'GET',
      `/v0/customers/${customerId}`
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ASSOCIATED PERSONS (Control Persons / UBOs)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Add an Associated Person (Control Person/UBO) to a Business Customer
   * 
   * Bridge requires at least one control person for business customers.
   * This is typically the Escrow Officer or company owner.
   * 
   * @param customerId - The Bridge Business Customer ID
   * @param idempotencyKey - Unique key to prevent duplicates
   * @param params - Person details
   */
  async addAssociatedPerson(
    customerId: string,
    idempotencyKey: string,
    params: {
      firstName: string;
      lastName: string;
      email?: string;
      title: string;
      isControlPerson?: boolean;
      ownershipPercentage?: number;
    }
  ): Promise<BridgeAssociatedPerson> {
    return this.request<BridgeAssociatedPerson>(
      'POST',
      `/v0/customers/${customerId}/associated_persons`,
      {
        first_name: params.firstName,
        last_name: params.lastName,
        email: params.email,
        title: params.title,
        is_control_person: params.isControlPerson ?? true,
        ownership_percentage: params.ownershipPercentage,
      },
      idempotencyKey
    );
  }

  /**
   * List all associated persons for a customer
   */
  async listAssociatedPersons(customerId: string): Promise<{ data: BridgeAssociatedPerson[] }> {
    return this.request<{ data: BridgeAssociatedPerson[] }>(
      'GET',
      `/v0/customers/${customerId}/associated_persons`
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // KYC LINKS (Hosted Identity Verification)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Generate a KYC Link for a customer
   * 
   * This creates a hosted verification flow where the user can:
   * 1. Accept Terms of Service (tos_link)
   * 2. Complete identity verification with photo ID (kyc_link)
   * 
   * Bridge handles all PII collection securely - we never see the
   * SSN, driver's license, or other sensitive documents.
   * 
   * @param idempotencyKey - Unique key to prevent duplicates
   * @param params - KYC link parameters
   */
  async createKycLink(
    idempotencyKey: string,
    params: {
      fullName: string;
      email: string;
      type: 'individual' | 'business';
      customerId?: string;  // Optional: link to existing customer
    }
  ): Promise<BridgeKycLink> {
    const body: Record<string, unknown> = {
      full_name: params.fullName,
      email: params.email,
      type: params.type,
    };

    if (params.customerId) {
      body.customer_id = params.customerId;
    }

    return this.request<BridgeKycLink>(
      'POST',
      '/v0/kyc_links',
      body,
      idempotencyKey
    );
  }

  /**
   * Get KYC Link status
   */
  async getKycLink(kycLinkId: string): Promise<BridgeKycLink> {
    return this.request<BridgeKycLink>(
      'GET',
      `/v0/kyc_links/${kycLinkId}`
    );
  }

  /**
   * List all KYC links
   */
  async listKycLinks(): Promise<{ data: BridgeKycLink[] }> {
    return this.request<{ data: BridgeKycLink[] }>(
      'GET',
      '/v0/kyc_links'
    );
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let bridgeClientInstance: BridgeClient | null = null;

export function getBridgeClient(): BridgeClient {
  if (!bridgeClientInstance) {
    bridgeClientInstance = new BridgeClient();
  }
  return bridgeClientInstance;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format wallet balance for display
 * 
 * Now supports both USDB (yield-earning) and USDC balances.
 * USDB is the primary holding currency for escrow funds.
 */
export function formatWalletBalance(wallet: BridgeWallet): {
  usdb: number;
  usdc: number;
  total: number;
  formatted: string;
} {
  const usdbBalance = wallet.balances?.find(b => b.currency === 'usdb');
  const usdcBalance = wallet.balances?.find(b => b.currency === 'usdc');
  
  const usdb = parseFloat(usdbBalance?.balance || '0');
  const usdc = parseFloat(usdcBalance?.balance || '0');
  const total = usdb + usdc; // USDB and USDC are both 1:1 with USD
  
  return {
    usdb,
    usdc,
    total,
    formatted: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(total),
  };
}

/**
 * Calculate yield earned on escrow funds
 * 
 * LEGAL REQUIREMENT: 100% of yield must be returned to the buyer.
 * This function calculates the difference between current balance
 * and initial deposit.
 * 
 * @param currentBalance - Current wallet balance (USDB)
 * @param initialDeposit - Original deposit amount
 * @returns Yield earned (must go to buyer at close)
 */
export function calculateYieldEarned(
  currentBalance: number,
  initialDeposit: number
): {
  yieldAmount: number;
  yieldPercent: number;
  formatted: string;
} {
  const yieldAmount = Math.max(0, currentBalance - initialDeposit);
  const yieldPercent = initialDeposit > 0 ? (yieldAmount / initialDeposit) * 100 : 0;
  
  return {
    yieldAmount,
    yieldPercent,
    formatted: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(yieldAmount),
  };
}

/**
 * Generate wiring instructions from virtual account
 */
export function formatWiringInstructions(virtualAccount: BridgeVirtualAccount): {
  bankName: string;
  bankAddress: string;
  routingNumber: string;
  accountNumber: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  reference: string;
  paymentMethods: string[];
} {
  const instructions = virtualAccount.source_deposit_instructions;
  
  return {
    bankName: instructions.bank_name,
    bankAddress: instructions.bank_address,
    routingNumber: instructions.bank_routing_number,
    accountNumber: instructions.bank_account_number,
    beneficiaryName: instructions.bank_beneficiary_name,
    beneficiaryAddress: instructions.bank_beneficiary_address || '',
    reference: virtualAccount.id,
    paymentMethods: instructions.payment_rails,
  };
}
