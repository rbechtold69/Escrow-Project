/**
 * Contract Client - EscrowVault & EscrowFactory Interaction
 * 
 * Uses viem for type-safe contract interactions on Base L2
 * Provides real-time yield data for the live ticker
 */

import { createPublicClient, createWalletClient, http, parseAbi, formatUnits } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ============ Contract ABIs ============

const ESCROW_VAULT_ABI = parseAbi([
  // Read functions
  'function getCurrentUSDMBalance() view returns (uint256)',
  'function getEstimatedUSDCValue() view returns (uint256)',
  'function getEstimatedYield() view returns (uint256)',
  'function getTimeElapsed() view returns (uint256)',
  'function getPayeeCount() view returns (uint256)',
  'function getEscrowSummary() view returns (uint256, uint256, uint256, uint256, bool, bool, uint256)',
  'function initialDepositUSDC() view returns (uint256)',
  'function initialUSDMReceived() view returns (uint256)',
  'function depositTimestamp() view returns (uint256)',
  'function isActive() view returns (bool)',
  'function isClosed() view returns (bool)',
  'function buyer() view returns (address)',
  'function safe() view returns (address)',
  'function escrowId() view returns (string)',
  'function propertyAddress() view returns (string)',
  
  // Write functions
  'function deposit(uint256 amount, uint256 minUSDMOut)',
  'function addPayee(address recipient, uint256 amount, string payeeType)',
  'function closeEscrow(uint256 minUSDCOut)',
  'function setBuyer(address _buyer)',
  
  // Events
  'event FundsDeposited(uint256 usdcAmount, uint256 usdmReceived, uint256 timestamp)',
  'event EscrowClosed(uint256 totalUSDMRedeemed, uint256 totalUSDCReceived, uint256 totalYield, uint256 platformFee, uint256 buyerRebate)',
  'event PayeeAdded(address indexed recipient, uint256 amount, string payeeType)',
  'event PayeePaid(address indexed recipient, uint256 amount, string payeeType)',
  'event YieldRebateSent(address indexed buyer, uint256 amount)',
]);

const ESCROW_FACTORY_ABI = parseAbi([
  'function createEscrow(string escrowId, string propertyAddress, address buyer, address[] owners, uint256 threshold) returns (address vault, address safe)',
  'function getVault(string escrowId) view returns (address)',
  'function getSafe(string escrowId) view returns (address)',
  'function getAllEscrowIds() view returns (string[])',
  'function escrowExists(string escrowId) view returns (bool)',
  'function escrowCount() view returns (uint256)',
  'event EscrowCreated(string indexed escrowId, address indexed vault, address indexed safe, string propertyAddress, address buyer, address[] owners, uint256 threshold)',
]);

const USDC_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const USDM_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
]);

// ============ Contract Addresses ============

export const CONTRACTS = {
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    USDM: '0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C' as `0x${string}`,
    AERODROME_ROUTER: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as `0x${string}`,
    // Factory address will be set after deployment
    ESCROW_FACTORY: (process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS || '0x0') as `0x${string}`,
  },
  baseSepolia: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
    USDM: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Not on testnet
    AERODROME_ROUTER: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    ESCROW_FACTORY: (process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS || '0x0') as `0x${string}`,
  },
};

// ============ Types ============

export interface EscrowSummary {
  escrowId: string;
  propertyAddress: string;
  initialDepositUSDC: bigint;
  initialUSDMReceived: bigint;
  currentUSDMBalance: bigint;
  estimatedUSDCValue: bigint;
  estimatedYield: bigint;
  depositTimestamp: bigint;
  timeElapsed: bigint;
  isActive: boolean;
  isClosed: boolean;
  payeeCount: number;
  buyer: string;
  safe: string;
  vaultAddress: string;
}

export interface YieldData {
  currentBalance: string;
  estimatedValue: string;
  accruedYield: string;
  yieldPercentage: string;
  apy: string;
  timeElapsedSeconds: number;
  timeElapsedDays: number;
}

// ============ Client Setup ============

const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ID === '8453';
const chain = isMainnet ? base : baseSepolia;
const contracts = isMainnet ? CONTRACTS.base : CONTRACTS.baseSepolia;

export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
});

// Server-side wallet client (for backend operations)
export function getWalletClient() {
  const privateKey = process.env.SERVER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SERVER_PRIVATE_KEY not configured');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  return createWalletClient({
    account,
    chain,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  });
}

// ============ Read Functions ============

/**
 * Get comprehensive escrow summary including yield data
 */
export async function getEscrowSummary(vaultAddress: `0x${string}`): Promise<EscrowSummary> {
  const [
    summary,
    estimatedUSDCValue,
    estimatedYield,
    timeElapsed,
    escrowId,
    propertyAddress,
    buyer,
    safe,
  ] = await Promise.all([
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'getEscrowSummary',
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'getEstimatedUSDCValue',
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'getEstimatedYield',
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'getTimeElapsed',
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'escrowId',
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'propertyAddress',
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'buyer',
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'safe',
    }),
  ]);

  const [
    initialDepositUSDC,
    initialUSDMReceived,
    currentUSDMBalance,
    depositTimestamp,
    isActive,
    isClosed,
    payeeCount,
  ] = summary as [bigint, bigint, bigint, bigint, boolean, boolean, bigint];

  return {
    escrowId: escrowId as string,
    propertyAddress: propertyAddress as string,
    initialDepositUSDC,
    initialUSDMReceived,
    currentUSDMBalance,
    estimatedUSDCValue: estimatedUSDCValue as bigint,
    estimatedYield: estimatedYield as bigint,
    depositTimestamp,
    timeElapsed: timeElapsed as bigint,
    isActive,
    isClosed,
    payeeCount: Number(payeeCount),
    buyer: buyer as string,
    safe: safe as string,
    vaultAddress,
  };
}

/**
 * Get formatted yield data for display
 */
export async function getYieldData(vaultAddress: `0x${string}`): Promise<YieldData> {
  const summary = await getEscrowSummary(vaultAddress);
  
  // Format values (USDC is 6 decimals, USDM is 18 decimals)
  const currentBalance = formatUnits(summary.currentUSDMBalance, 18);
  const estimatedValue = formatUnits(summary.estimatedUSDCValue, 6);
  const accruedYield = formatUnits(summary.estimatedYield, 6);
  const initialDeposit = formatUnits(summary.initialDepositUSDC, 6);
  
  // Calculate yield percentage
  const yieldPercentage = summary.initialDepositUSDC > 0n
    ? (Number(summary.estimatedYield) / Number(summary.initialDepositUSDC) * 100).toFixed(4)
    : '0';
  
  // Calculate annualized APY
  const timeElapsedSeconds = Number(summary.timeElapsed);
  const timeElapsedDays = timeElapsedSeconds / 86400;
  const annualizedYield = timeElapsedDays > 0
    ? (Number(yieldPercentage) / timeElapsedDays * 365).toFixed(2)
    : '5.00'; // Default 5% APY
  
  return {
    currentBalance,
    estimatedValue,
    accruedYield,
    yieldPercentage,
    apy: annualizedYield,
    timeElapsedSeconds,
    timeElapsedDays,
  };
}

/**
 * Get real-time yield updates (for live ticker)
 * Returns yield in USD cents per second based on 5% APY
 */
export function calculateYieldPerSecond(principalUSDC: number): number {
  const APY = 0.05; // 5% annual yield from USDM
  const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
  return (principalUSDC * APY) / SECONDS_PER_YEAR;
}

/**
 * Get vault address from escrow ID
 */
export async function getVaultAddress(escrowId: string): Promise<`0x${string}` | null> {
  try {
    const vault = await publicClient.readContract({
      address: contracts.ESCROW_FACTORY,
      abi: ESCROW_FACTORY_ABI,
      functionName: 'getVault',
      args: [escrowId],
    });
    
    const vaultAddress = vault as `0x${string}`;
    return vaultAddress === '0x0000000000000000000000000000000000000000' ? null : vaultAddress;
  } catch {
    return null;
  }
}

/**
 * Check if escrow exists
 */
export async function escrowExists(escrowId: string): Promise<boolean> {
  try {
    const exists = await publicClient.readContract({
      address: contracts.ESCROW_FACTORY,
      abi: ESCROW_FACTORY_ABI,
      functionName: 'escrowExists',
      args: [escrowId],
    });
    return exists as boolean;
  } catch {
    return false;
  }
}

/**
 * Get all escrow IDs from factory
 */
export async function getAllEscrowIds(): Promise<string[]> {
  try {
    const ids = await publicClient.readContract({
      address: contracts.ESCROW_FACTORY,
      abi: ESCROW_FACTORY_ABI,
      functionName: 'getAllEscrowIds',
    });
    return ids as string[];
  } catch {
    return [];
  }
}

// ============ Write Functions (Server-side) ============

/**
 * Create a new escrow via the factory
 */
export async function createEscrow(params: {
  escrowId: string;
  propertyAddress: string;
  buyerAddress: `0x${string}`;
  owners: `0x${string}`[];
  threshold: number;
}): Promise<{ vaultAddress: string; safeAddress: string; txHash: string }> {
  const walletClient = getWalletClient();
  
  const { request } = await publicClient.simulateContract({
    address: contracts.ESCROW_FACTORY,
    abi: ESCROW_FACTORY_ABI,
    functionName: 'createEscrow',
    args: [
      params.escrowId,
      params.propertyAddress,
      params.buyerAddress,
      params.owners,
      BigInt(params.threshold),
    ],
    account: walletClient.account,
  });
  
  const txHash = await walletClient.writeContract(request);
  
  // Wait for transaction and get the created addresses from events
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  
  // Parse the EscrowCreated event to get addresses
  const vaultAddress = await getVaultAddress(params.escrowId);
  const safeAddress = await publicClient.readContract({
    address: contracts.ESCROW_FACTORY,
    abi: ESCROW_FACTORY_ABI,
    functionName: 'getSafe',
    args: [params.escrowId],
  });
  
  return {
    vaultAddress: vaultAddress || '',
    safeAddress: safeAddress as string,
    txHash,
  };
}

/**
 * Deposit USDC to vault (swaps to USDM)
 */
export async function depositToVault(
  vaultAddress: `0x${string}`,
  amountUSDC: bigint,
  minUSDMOut: bigint
): Promise<string> {
  const walletClient = getWalletClient();
  
  // First approve USDC spend
  const { request: approveRequest } = await publicClient.simulateContract({
    address: contracts.USDC,
    abi: USDC_ABI,
    functionName: 'approve',
    args: [vaultAddress, amountUSDC],
    account: walletClient.account,
  });
  
  await walletClient.writeContract(approveRequest);
  
  // Then deposit
  const { request: depositRequest } = await publicClient.simulateContract({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    functionName: 'deposit',
    args: [amountUSDC, minUSDMOut],
    account: walletClient.account,
  });
  
  const txHash = await walletClient.writeContract(depositRequest);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  
  return txHash;
}

// ============ Event Watching ============

/**
 * Watch for deposit events on a vault
 */
export function watchDeposits(
  vaultAddress: `0x${string}`,
  callback: (amount: bigint, usdmReceived: bigint, timestamp: bigint) => void
) {
  return publicClient.watchContractEvent({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    eventName: 'FundsDeposited',
    onLogs: (logs) => {
      for (const log of logs) {
        const { usdcAmount, usdmReceived, timestamp } = log.args as {
          usdcAmount: bigint;
          usdmReceived: bigint;
          timestamp: bigint;
        };
        callback(usdcAmount, usdmReceived, timestamp);
      }
    },
  });
}

/**
 * Watch for escrow close events
 */
export function watchEscrowClose(
  vaultAddress: `0x${string}`,
  callback: (totalYield: bigint, buyerRebate: bigint) => void
) {
  return publicClient.watchContractEvent({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    eventName: 'EscrowClosed',
    onLogs: (logs) => {
      for (const log of logs) {
        const { totalYield, buyerRebate } = log.args as {
          totalUSDMRedeemed: bigint;
          totalUSDCReceived: bigint;
          totalYield: bigint;
          platformFee: bigint;
          buyerRebate: bigint;
        };
        callback(totalYield, buyerRebate);
      }
    },
  });
}

export { ESCROW_VAULT_ABI, ESCROW_FACTORY_ABI, USDC_ABI, USDM_ABI };
