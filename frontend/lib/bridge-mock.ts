/**
 * MockBridgeService - Simulates Bridge.xyz API for Testing
 * 
 * Use this when you don't have Bridge.xyz credentials yet.
 * Provides realistic fake responses for:
 * - Virtual bank accounts
 * - External accounts (wire/ACH)
 * - Transfers
 * - Webhooks
 */

import {
  BridgeConfig,
  VirtualAccount,
  CreateVirtualAccountRequest,
  LiquidationAddress,
  ExternalAccount,
  TransferRequest,
  WebhookEvent,
  BridgeService,
} from './bridge-service';

// ============ Mock Data Generators ============

function generateId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_mock_${random}`;
}

function generateAccountNumber(): string {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

function generateRoutingNumber(): string {
  // Use a realistic-looking routing number format
  return '0210' + Math.floor(10000 + Math.random() * 90000).toString();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Mock Storage (in-memory) ============

interface MockStorage {
  virtualAccounts: Map<string, VirtualAccount>;
  externalAccounts: Map<string, ExternalAccount>;
  transfers: Map<string, { id: string; status: string; amount: number; currency: string }>;
  liquidationAddress: LiquidationAddress | null;
}

const mockStorage: MockStorage = {
  virtualAccounts: new Map(),
  externalAccounts: new Map(),
  transfers: new Map(),
  liquidationAddress: null,
};

// ============ MockBridgeService Class ============

export class MockBridgeService {
  private simulateDelay: boolean;

  constructor(options: { simulateDelay?: boolean } = {}) {
    this.simulateDelay = options.simulateDelay ?? true;
  }

  private async maybeDelay(): Promise<void> {
    if (this.simulateDelay) {
      // Simulate network latency (100-300ms)
      await delay(100 + Math.random() * 200);
    }
  }

  // ============ Virtual Accounts ============

  async createVirtualAccount(
    request: CreateVirtualAccountRequest
  ): Promise<VirtualAccount> {
    await this.maybeDelay();

    const account: VirtualAccount = {
      id: generateId('va'),
      account_number: generateAccountNumber(),
      routing_number: generateRoutingNumber(),
      bank_name: 'Mock Trust Bank (TEST)',
      beneficiary_name: `EscrowBase FBO ${request.buyerName}`,
      beneficiary_address: '123 Test Street, San Francisco, CA 94102',
      status: 'active',
      created_at: new Date().toISOString(),
    };

    mockStorage.virtualAccounts.set(account.id, account);

    console.log('[MockBridge] Created virtual account:', {
      id: account.id,
      escrowId: request.escrowId,
      accountNumber: `****${account.account_number.slice(-4)}`,
    });

    return account;
  }

  async getVirtualAccount(accountId: string): Promise<VirtualAccount> {
    await this.maybeDelay();

    const account = mockStorage.virtualAccounts.get(accountId);
    if (!account) {
      throw new Error(`Virtual account not found: ${accountId}`);
    }

    return account;
  }

  async listVirtualAccounts(): Promise<VirtualAccount[]> {
    await this.maybeDelay();
    return Array.from(mockStorage.virtualAccounts.values());
  }

  // ============ Liquidation Addresses ============

  async getLiquidationAddress(): Promise<LiquidationAddress> {
    await this.maybeDelay();

    if (!mockStorage.liquidationAddress) {
      mockStorage.liquidationAddress = {
        id: generateId('la'),
        chain: 'base',
        address: '0x' + Array(40).fill(0).map(() => 
          Math.floor(Math.random() * 16).toString(16)
        ).join(''),
        currency: 'usdc',
      };
    }

    console.log('[MockBridge] Liquidation address:', mockStorage.liquidationAddress.address);

    return mockStorage.liquidationAddress;
  }

  // ============ External Accounts (Payees) ============

  async createWireAccount(params: {
    bankName: string;
    routingNumber: string;
    accountNumber: string;
    beneficiaryName: string;
    beneficiaryAddress: string;
    swiftCode?: string;
  }): Promise<ExternalAccount> {
    await this.maybeDelay();

    const account: ExternalAccount = {
      id: generateId('ea'),
      account_type: 'wire',
      bank_name: params.bankName,
      routing_number: params.routingNumber,
      account_number: params.accountNumber,
      beneficiary_name: params.beneficiaryName,
      beneficiary_address: params.beneficiaryAddress,
    };

    mockStorage.externalAccounts.set(account.id, account);

    console.log('[MockBridge] Created wire account:', {
      id: account.id,
      beneficiary: params.beneficiaryName,
      bank: params.bankName,
    });

    return account;
  }

  async createACHAccount(params: {
    routingNumber: string;
    accountNumber: string;
    accountType: 'checking' | 'savings';
    beneficiaryName: string;
  }): Promise<ExternalAccount> {
    await this.maybeDelay();

    const account: ExternalAccount = {
      id: generateId('ea'),
      account_type: 'ach',
      routing_number: params.routingNumber,
      account_number: params.accountNumber,
      beneficiary_name: params.beneficiaryName,
    };

    mockStorage.externalAccounts.set(account.id, account);

    console.log('[MockBridge] Created ACH account:', {
      id: account.id,
      beneficiary: params.beneficiaryName,
      type: params.accountType,
    });

    return account;
  }

  async createCheckAccount(params: {
    recipientName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): Promise<ExternalAccount> {
    await this.maybeDelay();

    const account: ExternalAccount = {
      id: generateId('ea'),
      account_type: 'check',
      beneficiary_name: params.recipientName,
      beneficiary_address: `${params.addressLine1}, ${params.city}, ${params.state} ${params.postalCode}`,
    };

    mockStorage.externalAccounts.set(account.id, account);

    console.log('[MockBridge] Created check account:', {
      id: account.id,
      recipient: params.recipientName,
      city: params.city,
    });

    return account;
  }

  // ============ Transfers ============

  async initiateTransfer(request: TransferRequest): Promise<{ id: string; status: string }> {
    await this.maybeDelay();

    const transfer = {
      id: generateId('txn'),
      status: 'pending',
      amount: request.amount,
      currency: request.currency,
    };

    mockStorage.transfers.set(transfer.id, transfer);

    console.log('[MockBridge] Initiated transfer:', {
      id: transfer.id,
      amount: `$${(request.amount / 100).toLocaleString()}`,
      destination: request.destination_account_id,
    });

    // Simulate async processing - status changes after 2 seconds
    setTimeout(() => {
      const t = mockStorage.transfers.get(transfer.id);
      if (t) {
        t.status = 'processing';
        console.log(`[MockBridge] Transfer ${transfer.id} now processing`);
        
        // Complete after another 3 seconds
        setTimeout(() => {
          const t2 = mockStorage.transfers.get(transfer.id);
          if (t2) {
            t2.status = 'completed';
            console.log(`[MockBridge] Transfer ${transfer.id} completed ✓`);
          }
        }, 3000);
      }
    }, 2000);

    return { id: transfer.id, status: transfer.status };
  }

  async getTransferStatus(transferId: string): Promise<{
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    amount: number;
    currency: string;
  }> {
    await this.maybeDelay();

    const transfer = mockStorage.transfers.get(transferId);
    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    return transfer as any;
  }

  // ============ Webhooks ============

  verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string
  ): boolean {
    // In mock mode, always return true
    console.log('[MockBridge] Webhook signature verified (mock)');
    return true;
  }

  parseWebhookEvent(payload: string): WebhookEvent {
    return JSON.parse(payload) as WebhookEvent;
  }

  // ============ Test Helpers ============

  /**
   * Simulate a deposit arriving (for testing)
   */
  simulateDeposit(virtualAccountId: string, amount: number): WebhookEvent {
    const event: WebhookEvent = {
      id: generateId('evt'),
      type: 'deposit.completed',
      data: {
        amount,
        currency: 'usd',
        virtual_account_id: virtualAccountId,
      },
      created_at: new Date().toISOString(),
    };

    console.log('[MockBridge] Simulated deposit:', {
      accountId: virtualAccountId,
      amount: `$${(amount / 100).toLocaleString()}`,
    });

    return event;
  }

  /**
   * Get all mock data (for debugging)
   */
  getMockState(): MockStorage {
    return {
      virtualAccounts: new Map(mockStorage.virtualAccounts),
      externalAccounts: new Map(mockStorage.externalAccounts),
      transfers: new Map(mockStorage.transfers),
      liquidationAddress: mockStorage.liquidationAddress,
    };
  }

  /**
   * Clear all mock data (for test reset)
   */
  clearMockState(): void {
    mockStorage.virtualAccounts.clear();
    mockStorage.externalAccounts.clear();
    mockStorage.transfers.clear();
    mockStorage.liquidationAddress = null;
    console.log('[MockBridge] Mock state cleared');
  }
}

// ============ Factory Function ============

let mockServiceInstance: MockBridgeService | null = null;

export function createMockBridgeService(options?: { simulateDelay?: boolean }): MockBridgeService {
  if (!mockServiceInstance) {
    mockServiceInstance = new MockBridgeService(options);
  }
  return mockServiceInstance;
}

// ============ Smart Factory - Auto-detect Mock vs Real ============

export function createBridgeServiceAuto(): BridgeService | MockBridgeService {
  const apiKey = process.env.BRIDGE_API_KEY;
  
  // Use real Bridge API if API key is present
  // Only use mock if no API key is configured
  if (apiKey) {
    console.log('[Bridge] Using REAL Bridge API - sandbox mode');
    const { createBridgeService } = require('./bridge-service');
    return createBridgeService();
  }

  // Fall back to mock mode only when no API key
  console.log('[Bridge] Using MOCK mode - no API key configured');
  return createMockBridgeService();
}

// ============ Type Guard ============

export function isMockBridgeService(
  service: BridgeService | MockBridgeService
): service is MockBridgeService {
  return 'simulateDeposit' in service;
}
