'use client';

/**
 * Smart Wallet Signing Hooks
 * 
 * These hooks handle signing with Coinbase Smart Wallet.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE USER SEES ON DESKTOP WHEN SIGNING:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * When you call `signMessage()` or `sendTransaction()`, a Coinbase popup appears:
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     EscrowBase                                  │
 * │                                                                 │
 * │              Confirm this action                                │
 * │                                                                 │
 * │   ┌─────────────────────────────────────────────────────────┐  │
 * │   │  You're signing a message:                              │  │
 * │   │  "Close Escrow ESC-2024-001847"                         │  │
 * │   └─────────────────────────────────────────────────────────┘  │
 * │                                                                 │
 * │   ┌──────────────────┐    ┌──────────────────┐                 │
 * │   │   Use Passkey    │    │  Scan with Phone │                 │
 * │   │   (Windows PIN)  │    │    [QR CODE]     │                 │
 * │   └──────────────────┘    └──────────────────┘                 │
 * │                                                                 │
 * │                      [ Cancel ]                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Option A: "Use Passkey" 
 *   → Windows Hello popup appears asking for PIN or security key
 *   → User enters PIN → Transaction signed
 * 
 * Option B: "Scan with Phone"
 *   → User scans QR with phone camera
 *   → Coinbase Wallet app (or browser) opens on phone
 *   → User approves with FaceID/TouchID on phone
 *   → Transaction signed
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useState } from 'react';
import { 
  useAccount, 
  useSignMessage as useWagmiSignMessage,
  useSendTransaction as useWagmiSendTransaction,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseEther, parseUnits, type Hash, type Address } from 'viem';

// ============ Types ============
interface SigningState {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
}

interface UseSignMessageReturn extends SigningState {
  signMessage: (message: string) => Promise<string | undefined>;
  signature: string | undefined;
  reset: () => void;
}

interface UseSendTransactionReturn extends SigningState {
  sendTransaction: (params: {
    to: Address;
    value?: bigint;
    data?: `0x${string}`;
  }) => Promise<Hash | undefined>;
  txHash: Hash | undefined;
  reset: () => void;
}

// ============ useSignMessage Hook ============
/**
 * Hook for signing messages with Smart Wallet
 * 
 * Usage:
 * ```tsx
 * const { signMessage, isPending, signature } = useSignMessage();
 * 
 * const handleSign = async () => {
 *   const sig = await signMessage("Confirm escrow closure");
 *   // sig = "0x..." signed message
 * };
 * ```
 * 
 * User Experience:
 * - Popup appears with message preview
 * - User confirms with passkey (PIN) or phone scan
 * - Returns signature string
 */
export function useSignMessage(): UseSignMessageReturn {
  const { isConnected } = useAccount();
  const [signature, setSignature] = useState<string | undefined>();
  
  const { 
    signMessageAsync,
    isPending,
    isSuccess,
    isError,
    error,
    reset: resetWagmi,
  } = useWagmiSignMessage();

  const signMessage = useCallback(async (message: string): Promise<string | undefined> => {
    if (!isConnected) {
      throw new Error('Please sign in first');
    }

    try {
      // This triggers the Coinbase popup with passkey/QR options
      const sig = await signMessageAsync({ message });
      setSignature(sig);
      return sig;
    } catch (err: any) {
      console.error('Sign message error:', err);
      
      // Re-throw with user-friendly message
      if (err.message?.includes('User rejected')) {
        throw new Error('Signature cancelled');
      }
      throw err;
    }
  }, [isConnected, signMessageAsync]);

  const reset = useCallback(() => {
    setSignature(undefined);
    resetWagmi();
  }, [resetWagmi]);

  return {
    signMessage,
    signature,
    isPending,
    isSuccess,
    isError,
    error: error as Error | null,
    reset,
  };
}

// ============ useSendTransaction Hook ============
/**
 * Hook for sending transactions (ETH transfers, contract calls)
 * 
 * Usage:
 * ```tsx
 * const { sendTransaction, isPending, txHash } = useSendTransaction();
 * 
 * const handleSend = async () => {
 *   const hash = await sendTransaction({
 *     to: "0x...",
 *     value: parseEther("0.01"),
 *   });
 * };
 * ```
 * 
 * User Experience:
 * - Popup shows transaction details (to, value, gas estimate)
 * - User confirms with passkey or phone scan
 * - Returns transaction hash
 */
export function useSendTransaction(): UseSendTransactionReturn {
  const { isConnected } = useAccount();
  const [txHash, setTxHash] = useState<Hash | undefined>();
  
  const {
    sendTransactionAsync,
    isPending,
    isSuccess,
    isError,
    error,
    reset: resetWagmi,
  } = useWagmiSendTransaction();

  const sendTransaction = useCallback(async (params: {
    to: Address;
    value?: bigint;
    data?: `0x${string}`;
  }): Promise<Hash | undefined> => {
    if (!isConnected) {
      throw new Error('Please sign in first');
    }

    try {
      const hash = await sendTransactionAsync({
        to: params.to,
        value: params.value,
        data: params.data,
      });
      setTxHash(hash);
      return hash;
    } catch (err: any) {
      console.error('Send transaction error:', err);
      
      if (err.message?.includes('User rejected')) {
        throw new Error('Transaction cancelled');
      }
      throw err;
    }
  }, [isConnected, sendTransactionAsync]);

  const reset = useCallback(() => {
    setTxHash(undefined);
    resetWagmi();
  }, [resetWagmi]);

  return {
    sendTransaction,
    txHash,
    isPending,
    isSuccess,
    isError,
    error: error as Error | null,
    reset,
  };
}

// ============ useContractWrite Hook ============
/**
 * Hook for calling smart contract functions
 * 
 * Usage:
 * ```tsx
 * const { writeContract, isPending } = useContractWrite();
 * 
 * const handleCloseEscrow = async () => {
 *   const hash = await writeContract({
 *     address: vaultAddress,
 *     abi: ESCROW_VAULT_ABI,
 *     functionName: 'closeEscrow',
 *     args: [minUSDCOut],
 *   });
 * };
 * ```
 */
export function useContractWrite() {
  const { isConnected } = useAccount();
  const [txHash, setTxHash] = useState<Hash | undefined>();
  
  const {
    writeContractAsync,
    isPending,
    isSuccess,
    isError,
    error,
    reset: resetWagmi,
  } = useWriteContract();

  // Wait for transaction confirmation
  const { 
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const writeContract = useCallback(async (params: {
    address: Address;
    abi: any;
    functionName: string;
    args?: any[];
    value?: bigint;
  }): Promise<Hash | undefined> => {
    if (!isConnected) {
      throw new Error('Please sign in first');
    }

    try {
      const hash = await writeContractAsync({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args || [],
        value: params.value,
      });
      setTxHash(hash);
      return hash;
    } catch (err: any) {
      console.error('Contract write error:', err);
      
      if (err.message?.includes('User rejected')) {
        throw new Error('Transaction cancelled');
      }
      throw err;
    }
  }, [isConnected, writeContractAsync]);

  const reset = useCallback(() => {
    setTxHash(undefined);
    resetWagmi();
  }, [resetWagmi]);

  return {
    writeContract,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    isConfirmed,
    isError,
    error: error as Error | null,
    reset,
  };
}

// ============ useAuth Hook ============
/**
 * Convenience hook for auth state
 */
export function useAuth() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  
  return {
    address,
    isConnected,
    isLoading: isConnecting || isReconnecting,
    // Shorten address for display (though we hide it in Web2 mode)
    shortAddress: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null,
  };
}

export default useSignMessage;
