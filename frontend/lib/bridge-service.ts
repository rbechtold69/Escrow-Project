/**
 * BridgeService - Bridge.xyz API Integration
 * 
 * Handles:
 * - Creating virtual bank accounts for escrows
 * - Processing incoming wire transfers
 * - Initiating outbound payments (wire/ACH/check)
 * - Webhook handling for fund events
 */

import crypto from 'crypto';

// ============ Types ============

export interface BridgeConfig {
  apiKey: string;
  baseUrl: string;
  webhookPublicKey?: string;
  customerId?: string;
}

export interface VirtualAccount {
  id: string;
  account_number: string;
  routing_number: string;
  bank_name: string;
  beneficiary_name: string;
  beneficiary_address: string;
  status: 'active' | 'pending' | 'closed';
  created_at: string;
}

export interface CreateVirtualAccountRequest {
  escrowId: string;
  propertyAddress: string;
  buyerName: string;
  buyerEmail: string;
  expectedAmount: number;
}

export interface LiquidationAddress {
  id: string;
  chain: string;
  address: string;
  currency: string;
}

export interface ExternalAccount {
  id: string;
  account_type: 'wire' | 'ach' | 'check';
  bank_name?: string;
  routing_number?: string;
  account_number?: string;
  beneficiary_name: string;
  beneficiary_address?: string;
}

export interface TransferRequest {
  amount: number;
  currency: string;
  destination_account_id: string;
  memo?: string;
  metadata?: Record<string, string>;
}

export interface WebhookEvent {
  id: string;
  type: 'deposit.completed' | 'deposit.pending' | 'liquidation.completed' | 'transfer.completed' | 'transfer.failed';
  data: {
    amount: number;
    currency: string;
    virtual_account_id?: string;
    liquidation_address_id?: string;
    transaction_hash?: string;
    metadata?: Record<string, string>;
  };
  created_at: string;
}

// ============ BridgeService Class ============

export class BridgeService {
  private config: BridgeConfig;

  constructor(config: BridgeConfig) {
    this.config = config;
  }

  // ============ Authentication ============

  private getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Api-Key': this.config.apiKey,
    };
  }

  // ============ Virtual Accounts ============

  /**
   * Create a virtual bank account for a new escrow
   * This generates unique routing/account numbers for wire transfers
   */
  async createVirtualAccount(
    request: CreateVirtualAccountRequest
  ): Promise<VirtualAccount> {
    const customerId = this.config.customerId;
    if (!customerId) {
      throw new Error('Bridge customer ID not configured');
    }

    // Generate unique idempotency key for this request
    const idempotencyKey = `escrow-${request.escrowId}-${Date.now()}`;
    
    // Use a placeholder destination address (in production, use the actual Safe/vault address)
    const destinationAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bB91';

    const response = await fetch(
      `${this.config.baseUrl}/v0/customers/${customerId}/virtual_accounts`,
      {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          source: {
            currency: 'usd',
            payment_rail: 'wire',
          },
          destination: {
            currency: 'usdc',
            payment_rail: 'base',
            address: destinationAddress,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Bridge API error: ${error.message || error.code || response.statusText}`);
    }

    const data = await response.json();
    const depositInstructions = data.source_deposit_instructions;

    return {
      id: data.id,
      account_number: depositInstructions.bank_account_number,
      routing_number: depositInstructions.bank_routing_number,
      bank_name: depositInstructions.bank_name || 'Bridge Bank',
      beneficiary_name: depositInstructions.bank_beneficiary_name || `FBO ${request.buyerName}`,
      beneficiary_address: depositInstructions.bank_beneficiary_address || depositInstructions.bank_address || '',
      status: data.status === 'activated' ? 'active' : data.status,
      created_at: data.created_at,
    };
  }

  /**
   * Get virtual account details by ID
   */
  async getVirtualAccount(accountId: string): Promise<VirtualAccount> {
    const response = await fetch(
      `${this.config.baseUrl}/v0/customers/virtual_accounts/${accountId}`,
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get virtual account: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List all virtual accounts
   */
  async listVirtualAccounts(): Promise<VirtualAccount[]> {
    const response = await fetch(
      `${this.config.baseUrl}/v0/customers/virtual_accounts`,
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list virtual accounts: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  // ============ Liquidation Addresses ============

  /**
   * Get or create a liquidation address for USDC on Base
   * This is where we send USDC to convert to fiat
   */
  async getLiquidationAddress(): Promise<LiquidationAddress> {
    // First, try to get existing address
    const listResponse = await fetch(
      `${this.config.baseUrl}/v0/liquidation_addresses?chain=base&currency=usdc`,
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      }
    );

    if (listResponse.ok) {
      const data = await listResponse.json();
      if (data.data && data.data.length > 0) {
        return data.data[0];
      }
    }

    // Create new liquidation address if none exists
    const createResponse = await fetch(
      `${this.config.baseUrl}/v0/liquidation_addresses`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          chain: 'base',
          currency: 'usdc',
          destination_currency: 'usd',
        }),
      }
    );

    if (!createResponse.ok) {
      throw new Error(`Failed to create liquidation address: ${createResponse.statusText}`);
    }

    return createResponse.json();
  }

  // ============ External Accounts (Payees) ============

  /**
   * Create an external account for wire transfers
   */
  async createWireAccount(params: {
    bankName: string;
    routingNumber: string;
    accountNumber: string;
    beneficiaryName: string;
    beneficiaryAddress: string;
    swiftCode?: string;
  }): Promise<ExternalAccount> {
    const response = await fetch(
      `${this.config.baseUrl}/v0/external_accounts`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          account_type: 'wire',
          bank_name: params.bankName,
          routing_number: params.routingNumber,
          account_number: params.accountNumber,
          beneficiary_name: params.beneficiaryName,
          beneficiary_address: params.beneficiaryAddress,
          swift_code: params.swiftCode,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create wire account: ${error.message}`);
    }

    return response.json();
  }

  /**
   * Create an external account for ACH transfers
   */
  async createACHAccount(params: {
    routingNumber: string;
    accountNumber: string;
    accountType: 'checking' | 'savings';
    beneficiaryName: string;
  }): Promise<ExternalAccount> {
    const response = await fetch(
      `${this.config.baseUrl}/v0/external_accounts`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          account_type: 'ach',
          routing_number: params.routingNumber,
          account_number: params.accountNumber,
          account_class: params.accountType,
          beneficiary_name: params.beneficiaryName,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create ACH account: ${error.message}`);
    }

    return response.json();
  }

  /**
   * Create an external account for physical checks
   */
  async createCheckAccount(params: {
    recipientName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): Promise<ExternalAccount> {
    const response = await fetch(
      `${this.config.baseUrl}/v0/external_accounts`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          account_type: 'check',
          beneficiary_name: params.recipientName,
          beneficiary_address: {
            street_line_1: params.addressLine1,
            street_line_2: params.addressLine2,
            city: params.city,
            state: params.state,
            postal_code: params.postalCode,
            country: params.country,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create check account: ${error.message}`);
    }

    return response.json();
  }

  // ============ Transfers ============

  /**
   * Initiate a transfer to an external account
   */
  async initiateTransfer(request: TransferRequest): Promise<{ id: string; status: string }> {
    const response = await fetch(
      `${this.config.baseUrl}/v0/transfers`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          amount: request.amount,
          currency: request.currency,
          destination_account_id: request.destination_account_id,
          memo: request.memo,
          metadata: request.metadata,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to initiate transfer: ${error.message}`);
    }

    return response.json();
  }

  /**
   * Get transfer status
   */
  async getTransferStatus(transferId: string): Promise<{
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    amount: number;
    currency: string;
  }> {
    const response = await fetch(
      `${this.config.baseUrl}/v0/transfers/${transferId}`,
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get transfer status: ${response.statusText}`);
    }

    return response.json();
  }

  // ============ Webhooks ============

  /**
   * Verify webhook signature using RSA public key
   * Bridge uses X-Webhook-Signature header with format: t=<timestamp>,v0=<signature>
   */
  verifyWebhookSignature(
    payload: string,
    signatureHeader: string
  ): boolean {
    if (!this.config.webhookPublicKey) {
      console.warn('Webhook public key not configured');
      return false;
    }

    try {
      const parts = signatureHeader.split(',');
      const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
      const signature = parts.find(p => p.startsWith('v0='))?.split('=')[1];

      if (!timestamp || !signature) return false;

      const signedPayload = `${timestamp}.${payload}`;
      const hash = crypto.createHash('sha256').update(signedPayload).digest();
      const signatureBytes = Buffer.from(signature, 'base64');

      return crypto.verify(
        'sha256',
        hash,
        {
          key: this.config.webhookPublicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        signatureBytes
      );
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Parse webhook event
   */
  parseWebhookEvent(payload: string): WebhookEvent {
    return JSON.parse(payload) as WebhookEvent;
  }
}

// ============ Webhook Handler ============

export interface WebhookHandlers {
  onDepositCompleted?: (event: WebhookEvent) => Promise<void>;
  onDepositPending?: (event: WebhookEvent) => Promise<void>;
  onLiquidationCompleted?: (event: WebhookEvent) => Promise<void>;
  onTransferCompleted?: (event: WebhookEvent) => Promise<void>;
  onTransferFailed?: (event: WebhookEvent) => Promise<void>;
}

export async function handleBridgeWebhook(
  event: WebhookEvent,
  handlers: WebhookHandlers
): Promise<void> {
  switch (event.type) {
    case 'deposit.completed':
      if (handlers.onDepositCompleted) {
        await handlers.onDepositCompleted(event);
      }
      break;
    case 'deposit.pending':
      if (handlers.onDepositPending) {
        await handlers.onDepositPending(event);
      }
      break;
    case 'liquidation.completed':
      if (handlers.onLiquidationCompleted) {
        await handlers.onLiquidationCompleted(event);
      }
      break;
    case 'transfer.completed':
      if (handlers.onTransferCompleted) {
        await handlers.onTransferCompleted(event);
      }
      break;
    case 'transfer.failed':
      if (handlers.onTransferFailed) {
        await handlers.onTransferFailed(event);
      }
      break;
  }
}

// ============ Factory Function ============

export function createBridgeService(): BridgeService {
  // Fallback customer ID for sandbox testing
  const SANDBOX_CUSTOMER_ID = '07c667aa-4d2d-41eb-96ec-e776342c5326';
  
  const config: BridgeConfig = {
    apiKey: process.env.BRIDGE_API_KEY || '',
    baseUrl: process.env.BRIDGE_API_URL || 'https://api.sandbox.bridge.xyz',
    webhookPublicKey: process.env.BRIDGE_WEBHOOK_PUBLIC_KEY || '',
    customerId: process.env.BRIDGE_CUSTOMER_ID || SANDBOX_CUSTOMER_ID,
  };

  if (!config.apiKey) {
    throw new Error('Bridge API key not configured');
  }

  return new BridgeService(config);
}
