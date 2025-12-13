/**
 * Web3 Configuration - Coinbase Smart Wallet
 * 
 * Configures "invisible wallet" experience:
 * - Passkey-first authentication
 * - Desktop fallback (QR code / Windows Hello / PIN)
 * - No seed phrases, no browser extensions
 * 
 * Supports both TESTNET (Base Sepolia) and MAINNET (Base)
 */

import { http, createConfig, createStorage } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

// ============ Environment Detection ============
const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532');
const isMainnet = chainId === 8453;
const chain = isMainnet ? base : baseSepolia;

console.log(`[Web3] Chain: ${chain.name} (${chain.id}) - ${isMainnet ? 'MAINNET' : 'TESTNET'}`);

// ============ RPC URLs ============
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || (
  isMainnet ? 'https://mainnet.base.org' : 'https://sepolia.base.org'
);

// ============ Coinbase Smart Wallet Connector ============
/**
 * Smart Wallet Configuration
 * 
 * Key settings:
 * - preference: 'smartWalletOnly' - Forces Smart Wallet, no EOA fallback
 * - This enables passkey-based auth with automatic desktop fallbacks
 */
const coinbaseSmartWallet = coinbaseWallet({
  appName: 'EscrowBase',
  appLogoUrl: 'https://escrowbase.io/logo.png',
  preference: 'smartWalletOnly',
});

// ============ Wagmi Configuration ============
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  
  connectors: [
    coinbaseSmartWallet,
  ],
  
  transports: {
    [base.id]: http(isMainnet ? rpcUrl : 'https://mainnet.base.org'),
    [baseSepolia.id]: http(!isMainnet ? rpcUrl : 'https://sepolia.base.org'),
  },
  
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    key: 'escrowbase-wallet',
  }),
  
  syncConnectedChain: true,
});

// ============ Contract Addresses ============
export const CONTRACTS = {
  // USDC Token
  USDC: isMainnet
    ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Mainnet
    : (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS || ''),  // Testnet (deploy your own)
    
  // USDM Token (Mountain Protocol)
  USDM: isMainnet
    ? '0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C'  // Base Mainnet
    : (process.env.NEXT_PUBLIC_MOCK_USDM_ADDRESS || ''),  // Testnet (deploy your own)
    
  // Aerodrome DEX (mainnet only)
  AERODROME_ROUTER: isMainnet
    ? '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'
    : '',
    
  AERODROME_FACTORY: isMainnet
    ? '0x420DD381b31aEf6683db6B902084cB0FFECe40Da'
    : '',
    
  // Our Escrow Factory
  ESCROW_FACTORY: process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS || '',
  
  // Test Vault (testnet only)
  TEST_VAULT: process.env.NEXT_PUBLIC_TEST_VAULT_ADDRESS || '',
} as const;

// ============ Chain Configuration ============
export const CHAIN_CONFIG = {
  id: chain.id,
  name: chain.name,
  isTestnet: !isMainnet,
  rpcUrl,
  blockExplorer: isMainnet
    ? 'https://basescan.org'
    : 'https://sepolia.basescan.org',
    
  getExplorerUrl: (type: 'address' | 'tx', hash: string) => {
    const base = isMainnet ? 'https://basescan.org' : 'https://sepolia.basescan.org';
    return `${base}/${type}/${hash}`;
  },
};

export const activeChain = chain;
export const activeChainId = chain.id;

// ============ Smart Wallet Feature Flags ============
export const SMART_WALLET_CONFIG = {
  appName: 'EscrowBase',
  appDescription: 'Secure Real Estate Escrow',
  defaultChainId: chain.id,
  sessionDurationMs: 24 * 60 * 60 * 1000,
  
  ui: {
    hideWalletAddress: true,
    useWeb2Language: true,
    loginButtonText: 'Sign In',
    logoutButtonText: 'Sign Out',
    signingPromptText: 'Confirm this action',
  },
};

export default wagmiConfig;
