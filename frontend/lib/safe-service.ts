import Safe from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';
import { MetaTransactionData, OperationType } from '@safe-global/safe-core-sdk-types';
import { ethers } from 'ethers';

// ============================================================
// Configuration
// ============================================================

const CHAIN_ID = process.env.NODE_ENV === 'production' ? BigInt(8453) : BigInt(84532); // Base / Base Sepolia
const RPC_URL = process.env.RPC_URL!;

// Safe infrastructure addresses on Base
const SAFE_CONFIG = {
  // Base mainnet addresses
  8453: {
    safeProxyFactoryAddress: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeSingletonAddress: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
    fallbackHandlerAddress: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    multiSendAddress: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    multiSendCallOnlyAddress: '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D',
  },
  // Base Sepolia addresses
  84532: {
    safeProxyFactoryAddress: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeSingletonAddress: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
    fallbackHandlerAddress: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    multiSendAddress: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    multiSendCallOnlyAddress: '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D',
  },
};

// ============================================================
// Safe Service Class
// ============================================================

export class SafeService {
  private apiKit: SafeApiKit;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Initialize Safe API Kit for transaction service
    this.apiKit = new SafeApiKit({
      chainId: CHAIN_ID,
    });
  }

  // ============================================================
  // Safe Deployment
  // ============================================================

  /**
   * Deploys a new Safe with 2-of-3 threshold for escrow
   * Owners: Escrow Officer, Manager, Compliance Bot
   */
  async deploySafe(
    officerAddress: string,
    managerAddress: string,
    complianceBotAddress: string,
    signerPrivateKey: string
  ): Promise<{
    safeAddress: string;
    txHash: string;
  }> {
    const signer = new ethers.Wallet(signerPrivateKey, this.provider);

    // Configuration for new Safe
    const safeAccountConfig = {
      owners: [officerAddress, managerAddress, complianceBotAddress],
      threshold: 2, // 2-of-3 required
    };

    // Deploy configuration
    const chainConfig = SAFE_CONFIG[Number(CHAIN_ID) as keyof typeof SAFE_CONFIG];
    
    const predictedSafe = {
      safeAccountConfig,
      safeDeploymentConfig: {
        saltNonce: Date.now().toString(), // Unique salt
      },
    };

    // Initialize Safe with deployment config
    const protocolKit = await Safe.init({
      provider: RPC_URL,
      signer: signerPrivateKey,
      predictedSafe,
    });

    // Get predicted address before deployment
    const predictedAddress = await protocolKit.getAddress();
    console.log('Predicted Safe address:', predictedAddress);

    // Deploy the Safe
    const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();
    
    const txResponse = await signer.sendTransaction({
      to: deploymentTransaction.to,
      value: BigInt(deploymentTransaction.value),
      data: deploymentTransaction.data,
    });

    const receipt = await txResponse.wait();

    return {
      safeAddress: predictedAddress,
      txHash: receipt!.hash,
    };
  }

  /**
   * Connects to an existing Safe
   */
  async connectToSafe(
    safeAddress: string,
    signerPrivateKey: string
  ): Promise<Safe> {
    const protocolKit = await Safe.init({
      provider: RPC_URL,
      signer: signerPrivateKey,
      safeAddress,
    });

    return protocolKit;
  }

  // ============================================================
  // Transaction Creation & Signing
  // ============================================================

  /**
   * Creates a Safe transaction for payee operations
   * Used for addPayee, initiateClose, executeDisbursements
   */
  async createTransaction(
    safeAddress: string,
    signerPrivateKey: string,
    transactions: MetaTransactionData[]
  ): Promise<{
    safeTxHash: string;
    nonce: number;
  }> {
    const protocolKit = await this.connectToSafe(safeAddress, signerPrivateKey);

    // Create the transaction
    const safeTransaction = await protocolKit.createTransaction({
      transactions,
    });

    // Sign the transaction
    const signedTransaction = await protocolKit.signTransaction(safeTransaction);

    // Get the hash
    const safeTxHash = await protocolKit.getTransactionHash(signedTransaction);

    // Propose to Safe Transaction Service
    await this.apiKit.proposeTransaction({
      safeAddress,
      safeTransactionData: signedTransaction.data,
      safeTxHash,
      senderAddress: await new ethers.Wallet(signerPrivateKey).getAddress(),
      senderSignature: signedTransaction.signatures.get(
        (await new ethers.Wallet(signerPrivateKey).getAddress()).toLowerCase()
      )!.data,
    });

    return {
      safeTxHash,
      nonce: safeTransaction.data.nonce,
    };
  }

  /**
   * Creates close escrow transaction bundle
   * Combines initiateClose + executeDisbursements
   */
  async createCloseEscrowTransaction(
    safeAddress: string,
    vaultAddress: string,
    signerPrivateKey: string,
    initiateCloseData: `0x${string}`,
    executeDisbursementsData: `0x${string}`
  ): Promise<{
    safeTxHash: string;
    nonce: number;
  }> {
    const transactions: MetaTransactionData[] = [
      {
        to: vaultAddress,
        value: '0',
        data: initiateCloseData,
        operation: OperationType.Call,
      },
      {
        to: vaultAddress,
        value: '0',
        data: executeDisbursementsData,
        operation: OperationType.Call,
      },
    ];

    return this.createTransaction(safeAddress, signerPrivateKey, transactions);
  }

  /**
   * Adds a signature to an existing transaction
   */
  async addSignature(
    safeAddress: string,
    safeTxHash: string,
    signerPrivateKey: string
  ): Promise<void> {
    const protocolKit = await this.connectToSafe(safeAddress, signerPrivateKey);

    // Get the pending transaction
    const pendingTx = await this.apiKit.getTransaction(safeTxHash);

    // Create transaction from pending data
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [{
        to: pendingTx.to,
        value: pendingTx.value,
        data: pendingTx.data || '0x',
        operation: pendingTx.operation,
      }],
    });

    // Sign it
    const signedTransaction = await protocolKit.signTransaction(safeTransaction);
    
    const signerAddress = await new ethers.Wallet(signerPrivateKey).getAddress();
    const signature = signedTransaction.signatures.get(signerAddress.toLowerCase());

    if (!signature) {
      throw new Error('Failed to generate signature');
    }

    // Confirm the transaction
    await this.apiKit.confirmTransaction(safeTxHash, signature.data);
  }

  /**
   * Executes a transaction that has enough signatures
   */
  async executeTransaction(
    safeAddress: string,
    safeTxHash: string,
    signerPrivateKey: string
  ): Promise<{
    txHash: string;
    success: boolean;
  }> {
    const protocolKit = await this.connectToSafe(safeAddress, signerPrivateKey);

    // Get the pending transaction with all signatures
    const pendingTx = await this.apiKit.getTransaction(safeTxHash);

    // Check if we have enough signatures
    const threshold = await protocolKit.getThreshold();
    if (pendingTx.confirmations!.length < threshold) {
      throw new Error(`Not enough signatures. Need ${threshold}, have ${pendingTx.confirmations!.length}`);
    }

    // Create transaction from pending data
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [{
        to: pendingTx.to,
        value: pendingTx.value,
        data: pendingTx.data || '0x',
        operation: pendingTx.operation,
      }],
    });

    // Add all existing signatures
    for (const confirmation of pendingTx.confirmations!) {
      // Use type assertion for Safe SDK compatibility
      (safeTransaction as any).addSignature({
        signer: confirmation.owner,
        data: confirmation.signature,
        isContractSignature: false,
      });
    }

    // Execute the transaction
    const result = await protocolKit.executeTransaction(safeTransaction);

    return {
      txHash: result.hash,
      success: true,
    };
  }

  // ============================================================
  // Query Methods
  // ============================================================

  /**
   * Gets pending transactions for a Safe
   */
  async getPendingTransactions(safeAddress: string) {
    return this.apiKit.getPendingTransactions(safeAddress);
  }

  /**
   * Gets Safe info (owners, threshold, etc.)
   */
  async getSafeInfo(safeAddress: string) {
    return this.apiKit.getSafeInfo(safeAddress);
  }

  /**
   * Checks if address is an owner
   */
  async isOwner(
    safeAddress: string,
    ownerAddress: string,
    signerPrivateKey: string
  ): Promise<boolean> {
    const protocolKit = await this.connectToSafe(safeAddress, signerPrivateKey);
    return protocolKit.isOwner(ownerAddress);
  }

  /**
   * Gets the current threshold
   */
  async getThreshold(
    safeAddress: string,
    signerPrivateKey: string
  ): Promise<number> {
    const protocolKit = await this.connectToSafe(safeAddress, signerPrivateKey);
    return protocolKit.getThreshold();
  }

  /**
   * Gets transaction history
   */
  async getTransactionHistory(safeAddress: string) {
    return this.apiKit.getAllTransactions(safeAddress);
  }
}

// Export singleton
let safeService: SafeService | null = null;

export function getSafeService(): SafeService {
  if (!safeService) {
    safeService = new SafeService();
  }
  return safeService;
}

// ============================================================
// Helper Types for Frontend
// ============================================================

export interface PendingTransaction {
  safeTxHash: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  nonce: number;
  confirmationsRequired: number;
  confirmations: Array<{
    owner: string;
    signature: string;
    submissionDate: string;
  }>;
  isExecuted: boolean;
}

export interface SafeInfo {
  address: string;
  owners: string[];
  threshold: number;
  nonce: number;
}
