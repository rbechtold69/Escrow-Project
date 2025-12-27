'use client';

import { ReactNode, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

// Configure chains
const chains = [base, baseSepolia] as const;

// Create wagmi config with Coinbase Smart Wallet
const config = createConfig({
  chains,
  connectors: [
    coinbaseWallet({
      appName: 'EscrowPayi',
      preference: 'smartWalletOnly', // Use Smart Wallet for account abstraction
    }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'),
  },
  ssr: true, // Enable SSR support
});

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {mounted ? children : (
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-pulse">
              <div className="h-8 w-48 bg-gray-200 rounded mx-auto mb-4" />
              <div className="h-4 w-64 bg-gray-200 rounded mx-auto" />
            </div>
          </div>
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
