'use client';

/**
 * Web3Provider - Wraps app with Wagmi + Smart Wallet support
 * 
 * This provider:
 * - Initializes Wagmi with Coinbase Smart Wallet
 * - Handles auto-reconnection on page load
 * - Provides React Query for caching
 */

import { ReactNode, useState, useEffect } from 'react';
import { WagmiProvider, State } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './web3-config';

// ============ Query Client ============
// React Query for caching blockchain data
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus for blockchain data
      refetchOnWindowFocus: false,
      // Cache for 30 seconds
      staleTime: 30 * 1000,
      // Retry failed queries
      retry: 2,
    },
  },
});

// ============ Provider Props ============
interface Web3ProviderProps {
  children: ReactNode;
  initialState?: State;
}

// ============ Web3Provider Component ============
export function Web3Provider({ children, initialState }: Web3ProviderProps) {
  // Prevent hydration mismatch by only rendering after mount
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {/* Render children only after client-side mount to prevent hydration issues */}
        {mounted ? children : null}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default Web3Provider;
