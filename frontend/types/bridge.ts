// ============================================================
// Bridge.xyz Type Definitions
// ============================================================

export interface BridgeConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  webhookSecret: string;
}

export interface VirtualAccountRequest {
  customerId: string;
  accountName: string;
  destinationAddress: string;        // Safe multisig address on Base
  destinationChain: 'base';
  destinationCurrency: 'usdc';
  sourceNetwork: 'wire' | 'ach';
  metadata: {
    escrowId: string;
    propertyId: string;
    purchasePrice: string;
  };
}

export interface VirtualAccountResponse {
  id: string;
  customerId: string;
  status: 'active' | 'pending' | 'closed';
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  bankAddress: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  wireInstructions: WireInstructions;
  achInstructions: ACHInstructions;
  createdAt: string;
  destinationAddress: string;
  destinationChain: string;
}

export interface WireInstructions {
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  bankAddress: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  reference: string;
  swiftCode?: string;
}

export interface ACHInstructions {
  accountNumber: string;
  routingNumber: string;
  accountType: 'checking' | 'savings';
  bankName: string;
}

export interface LiquidationRequest {
  amount: string;                    // Amount in USDC
  destinationPaymentRail: 'wire' | 'ach' | 'check';
  externalAccountId?: string;        // For wire/ACH
  checkDetails?: CheckDetails;       // For physical checks
  metadata: {
    escrowId: string;
    payeeIndex: number;
    payeeType: string;
  };
}

export interface CheckDetails {
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  memo?: string;
}

export interface LiquidationResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: string;
  destinationPaymentRail: string;
  estimatedArrival: string;
  trackingNumber?: string;           // For checks
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  data: WebhookEventData;
  createdAt: string;
  signature: string;
}

export type WebhookEventType = 
  | 'deposit.completed'
  | 'deposit.failed'
  | 'liquidation.completed'
  | 'liquidation.failed'
  | 'account.updated';

export interface WebhookEventData {
  accountId?: string;
  amount?: string;
  currency?: string;
  txHash?: string;
  destinationAddress?: string;
  metadata?: Record<string, string>;
}

// ============================================================
// External Account Types (for Wire/ACH disbursements)
// ============================================================

export interface ExternalAccountRequest {
  customerId: string;
  accountType: 'wire' | 'ach';
  accountHolderName: string;
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  bankAddress?: string;
  accountHolderType: 'individual' | 'business';
  metadata?: Record<string, string>;
}

export interface ExternalAccountResponse {
  id: string;
  customerId: string;
  status: 'active' | 'pending_verification' | 'verified';
  accountType: string;
  accountHolderName: string;
  lastFourDigits: string;
  bankName: string;
  createdAt: string;
}

// ============================================================
// Customer Types
// ============================================================

export interface CustomerRequest {
  type: 'individual' | 'business';
  email: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  taxId?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  metadata?: Record<string, string>;
}

export interface CustomerResponse {
  id: string;
  type: string;
  email: string;
  status: 'active' | 'pending_kyc' | 'verified';
  createdAt: string;
}

// ============================================================
// Yield/Treasury Types (Bridge Meow Integration)
// ============================================================

export interface TreasuryBalanceResponse {
  accountId: string;
  balance: string;
  currency: 'usdc';
  yieldRate: string;                 // APY as decimal (e.g., "0.0450" for 4.5%)
  accruedYield: string;
  lastYieldUpdate: string;
  underlyingAsset: 'us_treasuries';
}

export interface TreasuryYieldHistory {
  accountId: string;
  entries: YieldEntry[];
}

export interface YieldEntry {
  date: string;
  balance: string;
  yieldEarned: string;
  cumulativeYield: string;
  rate: string;
}
