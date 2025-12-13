'use client';

/**
 * Combined Providers
 * 
 * Wraps the app with all necessary providers:
 * - Web3Provider (Wagmi + Coinbase Smart Wallet)
 * - Any future providers (e.g., Theme, Analytics)
 */

import { ReactNode } from 'react';
import { Web3Provider } from '@/lib/web3-provider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <Web3Provider>
      {children}
    </Web3Provider>
  );
}

export default Providers;
