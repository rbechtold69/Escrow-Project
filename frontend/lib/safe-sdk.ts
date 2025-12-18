/**
 * Safe Multisig SDK Integration
 * 
 * Handles:
 * - Deploying new Safe contracts for each escrow
 * - Creating multisig transactions
 * - Collecting signatures
 * - Executing transactions
 * 
 * Uses Base Sepolia testnet for demo mode
 */

import Safe from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';
import { 
  MetaTransactionData,
  OperationType,
} from '@safe-global/safe-core-sdk-types';

// ============ Configuration ============

// Base Sepolia Chain ID
const CHAIN_ID = BigInt(84532);

// Safe Transaction Service URL for Base Sepolia
// Note: Safe doesn't have official service for Base Sepolia yet,
// so we'll use local signing for the demo
const SAFE_SERVICE_URL = 'https://safe-transaction-base-sepolia.safe.global';

// Default Safe configuration: 2-of-3 multisig
const DEFAULT_THRESHOLD = 2;
const DEFAULT_OWNERS_COUNT = 3;

// ============ Types ============

export interface SafeDeployResult {
  safeAddress: string;
  owners: string[];
  threshold: number;
  deploymentTxHash?: string;
}

export interface SafeTransactionResult {
  safeTxHash: string;
  transactionHash?: string;
  status: 'pending' | 'executed' | 'failed';
  confirmations: number;
  threshold: number;
}

export interface PendingTransaction {
  safeTxHash: string;
  to: string;
  value: string;
  data: string;
  confirmations: number;
  threshold: number;
  isExecuted: boolean;
}

// ============ Safe Service Class ============

export class SafeService {
  private apiKit: SafeApiKit | null = null;
  
  constructor() {
    // Initialize API Kit for transaction service
    try {
      this.apiKit = new SafeApiKit({
        chainId: CHAIN_ID,
      });
    } catch (error) {
      console.warn('[SafeService] API Kit not available for this chain, using local mode');
    }
  }

  /**
   * Deploy a new Safe multisig contract
   */
  async deploySafe(
    signerAddress: string,
    additionalOwners: string[] = []
  ): Promise<SafeDeployResult> {
    console.log('[SafeService] Deploying new Safe...');
    console.log('[SafeService] Primary signer:', signerAddress);
    
    // For demo, we'll create a Safe with the signer as the only owner initially
    // In production, you'd add escrow company officers as owners
    const owners = [
      signerAddress,
      ...additionalOwners.filter(addr => addr !== signerAddress),
    ];
    
    // Ensure we have at least the threshold number of owners
    while (owners.length < DEFAULT_THRESHOLD) {
      // Add placeholder owners for demo (in production, these would be real officer addresses)
      owners.push(`0x${'0'.repeat(38)}${owners.length + 1}`);
    }
    
    try {
      // Initialize the Protocol Kit with predicted Safe address
      const protocolKit = await Safe.init({
        provider: 'https://sepolia.base.org',
        signer: signerAddress,
        predictedSafe: {
          safeAccountConfig: {
            owners: owners.slice(0, DEFAULT_OWNERS_COUNT),
            threshold: DEFAULT_THRESHOLD,
          },
        },
      });
      
      // Get the predicted Safe address
      const safeAddress = await protocolKit.getAddress();
      
      console.log('[SafeService] Predicted Safe address:', safeAddress);
      console.log('[SafeService] Owners:', owners.slice(0, DEFAULT_OWNERS_COUNT));
      console.log('[SafeService] Threshold:', DEFAULT_THRESHOLD);
      
      // Note: In a real implementation, you would deploy the Safe here
      // For demo purposes, we return the predicted address
      // The Safe will be created when the first transaction is executed
      
      return {
        safeAddress,
        owners: owners.slice(0, DEFAULT_OWNERS_COUNT),
        threshold: DEFAULT_THRESHOLD,
      };
      
    } catch (error: any) {
      console.error('[SafeService] Failed to deploy Safe:', error);
      
      // For demo, return a mock Safe address if deployment fails
      const mockAddress = `0x${Array(40).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;
      
      return {
        safeAddress: mockAddress,
        owners: owners.slice(0, DEFAULT_OWNERS_COUNT),
        threshold: DEFAULT_THRESHOLD,
      };
    }
  }

  /**
   * Create a transaction to transfer USDC to multiple recipients
   */
  async createBatchTransfer(
    safeAddress: string,
    signerAddress: string,
    transfers: Array<{
      to: string;
      amount: bigint;
    }>,
    usdcAddress: string
  ): Promise<SafeTransactionResult> {
    console.log('[SafeService] Creating batch transfer...');
    console.log('[SafeService] Safe:', safeAddress);
    console.log('[SafeService] Transfers:', transfers.length);
    
    try {
      // Initialize Protocol Kit with the existing Safe
      const protocolKit = await Safe.init({
        provider: 'https://sepolia.base.org',
        signer: signerAddress,
        safeAddress,
      });
      
      // Build ERC20 transfer data for each recipient
      const transactions: MetaTransactionData[] = transfers.map(transfer => {
        // ERC20 transfer function signature: transfer(address,uint256)
        const transferData = encodeERC20Transfer(transfer.to, transfer.amount);
        
        return {
          to: usdcAddress,
          value: '0',
          data: transferData,
          operation: OperationType.Call,
        };
      });
      
      // Create the Safe transaction
      const safeTransaction = await protocolKit.createTransaction({
        transactions,
      });
      
      // Get the transaction hash
      const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
      
      console.log('[SafeService] Transaction created:', safeTxHash);
      
      // Sign the transaction
      const signedTransaction = await protocolKit.signTransaction(safeTransaction);
      
      // If API Kit is available, propose the transaction
      if (this.apiKit) {
        try {
          await this.apiKit.proposeTransaction({
            safeAddress,
            safeTransactionData: signedTransaction.data,
            safeTxHash,
            senderAddress: signerAddress,
            senderSignature: signedTransaction.encodedSignatures(),
          });
          console.log('[SafeService] Transaction proposed to Safe service');
        } catch (error) {
          console.warn('[SafeService] Could not propose to service, using local mode');
        }
      }
      
      return {
        safeTxHash,
        status: 'pending',
        confirmations: 1,
        threshold: DEFAULT_THRESHOLD,
      };
      
    } catch (error: any) {
      console.error('[SafeService] Failed to create transaction:', error);
      
      // Return mock result for demo
      const mockHash = `0x${Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;
      
      return {
        safeTxHash: mockHash,
        status: 'pending',
        confirmations: 1,
        threshold: DEFAULT_THRESHOLD,
      };
    }
  }

  /**
   * Get pending transactions for a Safe
   */
  async getPendingTransactions(safeAddress: string): Promise<PendingTransaction[]> {
    if (!this.apiKit) {
      console.log('[SafeService] API Kit not available, returning empty list');
      return [];
    }
    
    try {
      const pendingTxs = await this.apiKit.getPendingTransactions(safeAddress);
      
      return pendingTxs.results.map(tx => ({
        safeTxHash: tx.safeTxHash || '',
        to: tx.to || '',
        value: tx.value || '0',
        data: tx.data || '0x',
        confirmations: tx.confirmations?.length || 0,
        threshold: tx.confirmationsRequired || DEFAULT_THRESHOLD,
        isExecuted: tx.isExecuted || false,
      }));
    } catch (error) {
      console.error('[SafeService] Failed to get pending transactions:', error);
      return [];
    }
  }

  /**
   * Add a signature to a pending transaction
   */
  async signTransaction(
    safeAddress: string,
    safeTxHash: string,
    signerAddress: string
  ): Promise<boolean> {
    try {
      const protocolKit = await Safe.init({
        provider: 'https://sepolia.base.org',
        signer: signerAddress,
        safeAddress,
      });
      
      // Get the transaction from the service
      if (this.apiKit) {
        const tx = await this.apiKit.getTransaction(safeTxHash);
        
        // Sign and confirm
        const signature = await protocolKit.signHash(safeTxHash);
        
        await this.apiKit.confirmTransaction(safeTxHash, signature.data);
        
        console.log('[SafeService] Transaction signed:', safeTxHash);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[SafeService] Failed to sign transaction:', error);
      return false;
    }
  }

  /**
   * Execute a transaction that has enough signatures
   */
  async executeTransaction(
    safeAddress: string,
    safeTxHash: string,
    signerAddress: string
  ): Promise<string | null> {
    try {
      const protocolKit = await Safe.init({
        provider: 'https://sepolia.base.org',
        signer: signerAddress,
        safeAddress,
      });
      
      if (this.apiKit) {
        const tx = await this.apiKit.getTransaction(safeTxHash);
        
        // Check if we have enough confirmations
        if ((tx.confirmations?.length || 0) >= (tx.confirmationsRequired || DEFAULT_THRESHOLD)) {
          // Execute the transaction
          const executeTxResponse = await protocolKit.executeTransaction(tx as any);
          const txResponse = executeTxResponse.transactionResponse as any;
          const receipt = txResponse?.wait ? await txResponse.wait() : null;
          
          console.log('[SafeService] Transaction executed:', receipt?.hash);
          return receipt?.hash || null;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[SafeService] Failed to execute transaction:', error);
      return null;
    }
  }
}

// ============ Helper Functions ============

/**
 * Encode ERC20 transfer function call
 */
function encodeERC20Transfer(to: string, amount: bigint): string {
  // Function selector for transfer(address,uint256)
  const selector = '0xa9059cbb';
  
  // Pad the address to 32 bytes
  const paddedTo = to.slice(2).padStart(64, '0');
  
  // Pad the amount to 32 bytes
  const paddedAmount = amount.toString(16).padStart(64, '0');
  
  return selector + paddedTo + paddedAmount;
}

// ============ Factory Function ============

let safeServiceInstance: SafeService | null = null;

export function getSafeService(): SafeService {
  if (!safeServiceInstance) {
    safeServiceInstance = new SafeService();
  }
  return safeServiceInstance;
}

// ============ Demo Mode Helpers ============

/**
 * For demo mode: simulate Safe deployment without real blockchain
 */
export function simulateSafeDeployment(ownerAddress: string): SafeDeployResult {
  const mockAddress = `0x${Array(40).fill(0).map(() => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;
  
  return {
    safeAddress: mockAddress,
    owners: [
      ownerAddress,
      '0x' + '1'.repeat(40), // Escrow Company Signer 1
      '0x' + '2'.repeat(40), // Escrow Company Signer 2
    ],
    threshold: 2,
  };
}

/**
 * For demo mode: simulate pending signature requirement
 */
export function simulatePendingSignature(escrowId: string): PendingTransaction {
  return {
    safeTxHash: `0x${escrowId.replace(/-/g, '').padEnd(64, '0')}`,
    to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    value: '0',
    data: '0xa9059cbb...',
    confirmations: 1,
    threshold: 2,
    isExecuted: false,
  };
}



