'use client';

/**
 * ============================================================================
 * LoginButton Component - Invisible Wallet Login
 * ============================================================================
 * 
 * A clean, Web2-style authentication button using Coinbase Smart Wallet.
 * 
 * LOGIN FLOW:
 * 1. User clicks "Sign In"
 * 2. Coinbase popup appears → User authenticates with passkey
 * 3. We verify the wallet address exists in our backend
 * 4. If exists → Grant session access
 * 5. If not exists → Prompt to sign up
 * 
 * KEY DESIGN DECISIONS:
 * - No "Connect Wallet" jargon - just "Sign In"
 * - No wallet addresses shown to users
 * - Passkey-first auth with automatic fallbacks for desktop
 * - Backend verification ensures only registered users can access
 * 
 * ============================================================================
 */

import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

interface LoginButtonProps {
  onSuccess?: (user: AuthenticatedUser) => void;
  onError?: (error: Error) => void;
  onNotRegistered?: (address: string) => void;
  redirectTo?: string;
  className?: string;
  variant?: 'default' | 'minimal' | 'large';
}

interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  walletAddress: string;
  role: string;
}

type AuthState = 'idle' | 'connecting' | 'verifying' | 'success' | 'not-registered' | 'error';

// ============================================================================
// COMPONENT
// ============================================================================

export function LoginButton({ 
  onSuccess, 
  onError,
  onNotRegistered,
  redirectTo = '/dashboard',
  className = '',
  variant = 'default' 
}: LoginButtonProps) {
  const router = useRouter();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const [authState, setAuthState] = useState<AuthState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  // Find the Coinbase Smart Wallet connector
  const smartWalletConnector = connectors.find(
    (connector) => connector.id === 'coinbaseWalletSDK'
  );

  // ══════════════════════════════════════════════════════════════════════════
  // EFFECT: Verify user when wallet connects
  // ══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    // Only verify if we're in the connecting state and just got an address
    if (authState === 'connecting' && isConnected && address) {
      verifyUser(address);
    }
  }, [isConnected, address, authState]);

  // ══════════════════════════════════════════════════════════════════════════
  // Auto-verify on mount if already connected (page refresh)
  // ══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    if (isConnected && address && authState === 'idle' && !user) {
      // Silently verify in background
      verifyUserSilent(address);
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: Trigger wallet connection
  // ══════════════════════════════════════════════════════════════════════════
  
  const handleSignIn = useCallback(async () => {
    if (!smartWalletConnector) {
      setError('Authentication service unavailable. Please refresh and try again.');
      onError?.(new Error('Smart Wallet not available'));
      return;
    }

    setError(null);
    setAuthState('connecting');

    try {
      // ════════════════════════════════════════════════════════════════════════
      // TRIGGER COINBASE SMART WALLET
      // This opens the popup where user authenticates with their passkey
      // ════════════════════════════════════════════════════════════════════════
      
      connect({ connector: smartWalletConnector });
      
      // Verification happens in useEffect when address is available
      
    } catch (err: any) {
      console.error('Sign in failed:', err);
      setError('Sign in failed. Please try again.');
      setAuthState('error');
      onError?.(err);
    }
  }, [smartWalletConnector, connect, onError]);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: Verify user exists in backend
  // ══════════════════════════════════════════════════════════════════════════
  
  const verifyUser = useCallback(async (walletAddress: string) => {
    setAuthState('verifying');

    try {
      // ════════════════════════════════════════════════════════════════════════
      // CHECK IF USER EXISTS IN OUR DATABASE
      // ════════════════════════════════════════════════════════════════════════
      
      const response = await fetch(`/api/auth/verify?address=${walletAddress}`);
      
      if (response.status === 404) {
        // User not registered
        setAuthState('not-registered');
        onNotRegistered?.(walletAddress);
        return;
      }

      if (!response.ok) {
        throw new Error('Verification failed');
      }

      const userData: AuthenticatedUser = await response.json();

      // ════════════════════════════════════════════════════════════════════════
      // SUCCESS: User exists and is authenticated
      // ════════════════════════════════════════════════════════════════════════
      
      setUser(userData);
      setAuthState('success');
      onSuccess?.(userData);

      // Update last login
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      }).catch(() => {}); // Fire and forget

      // Redirect to dashboard
      if (redirectTo) {
        router.push(redirectTo);
      }

    } catch (err: any) {
      console.error('Verification failed:', err);
      setError('Unable to verify account. Please try again.');
      setAuthState('error');
      onError?.(err);
      disconnect(); // Disconnect on failure
    }
  }, [router, redirectTo, onSuccess, onNotRegistered, onError, disconnect]);

  // Silent verification (no state changes for UI)
  const verifyUserSilent = useCallback(async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/auth/verify?address=${walletAddress}`);
      if (response.ok) {
        const userData: AuthenticatedUser = await response.json();
        setUser(userData);
        setAuthState('success');
      }
    } catch {}
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // Sign Out
  // ══════════════════════════════════════════════════════════════════════════
  
  const handleSignOut = useCallback(() => {
    disconnect();
    setUser(null);
    setAuthState('idle');
  }, [disconnect]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Authenticated State
  // ══════════════════════════════════════════════════════════════════════════
  
  if (authState === 'success' && user) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {/* User Info */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-full">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {user.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-700">{user.displayName}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
            {user.role === 'ADMIN' ? 'Admin' : 'Active'}
          </span>
        </div>
        
        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Not Registered State
  // ══════════════════════════════════════════════════════════════════════════
  
  if (authState === 'not-registered') {
    return (
      <div className={`flex flex-col items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl ${className}`}>
        <div className="flex items-center gap-2 text-amber-700">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-medium">Account not found</span>
        </div>
        <p className="text-sm text-amber-600 text-center">
          No account exists for this passkey. Please sign up first.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/signup')}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
          >
            Create Account
          </button>
          <button
            onClick={() => {
              disconnect();
              setAuthState('idle');
            }}
            className="px-4 py-2 text-amber-600 text-sm hover:bg-amber-100 rounded-lg"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Sign In Button
  // ══════════════════════════════════════════════════════════════════════════
  
  const isWorking = isConnecting || authState === 'connecting' || authState === 'verifying';

  // Large variant (for login page)
  if (variant === 'large') {
    return (
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm text-center">
            {error}
          </div>
        )}
        <button
          onClick={handleSignIn}
          disabled={isWorking}
          className={`w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                     hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/25 ${className}`}
        >
          {isWorking ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{authState === 'verifying' ? 'Verifying...' : 'Signing in...'}</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>Sign In</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // Minimal variant
  if (variant === 'minimal') {
    return (
      <button
        onClick={handleSignIn}
        disabled={isWorking}
        className={`px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 
                   disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isWorking ? 'Signing in...' : 'Sign In'}
      </button>
    );
  }

  // Default variant
  return (
    <button
      onClick={handleSignIn}
      disabled={isWorking}
      className={`px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg
                 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                 disabled:opacity-50 disabled:cursor-not-allowed
                 flex items-center gap-2 transition-colors ${className}`}
    >
      {isWorking ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{authState === 'verifying' ? 'Verifying...' : 'Signing in...'}</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          <span>Sign In</span>
        </>
      )}
    </button>
  );
}

// ============================================================================
// useAuth Hook - Lightweight session state
// ============================================================================

export function useAuth() {
  const { address, isConnected, isConnecting } = useAccount();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { disconnect } = useDisconnect();

  useEffect(() => {
    if (isConnected && address && !user) {
      // Verify on connection
      setIsVerifying(true);
      fetch(`/api/auth/verify?address=${address}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setUser(data);
        })
        .finally(() => setIsVerifying(false));
    } else if (!isConnected) {
      setUser(null);
    }
  }, [isConnected, address]);

  return {
    user,
    address,
    isConnected,
    isLoading: isConnecting || isVerifying,
    isAuthenticated: isConnected && !!user,
    signOut: () => {
      disconnect();
      setUser(null);
    },
  };
}

export default LoginButton;
