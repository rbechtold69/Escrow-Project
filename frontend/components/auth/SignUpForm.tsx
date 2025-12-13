'use client';

/**
 * ============================================================================
 * SignUpForm.tsx - Invisible Wallet Signup
 * ============================================================================
 * 
 * This component merges "Create Wallet" and "Create Account" into ONE step.
 * 
 * USER EXPERIENCE:
 * 1. User enters Name and Email
 * 2. User clicks "Create Account"
 * 3. Coinbase popup appears → User sets up Passkey (PIN/biometric)
 * 4. Wallet is created automatically (no seed phrase shown)
 * 5. We POST { address, name, email } to /api/register
 * 6. User is redirected to Dashboard
 * 
 * The user NEVER:
 * - Sees the word "wallet"
 * - Sets a password
 * - Writes down a seed phrase
 * - Installs a browser extension
 * 
 * ============================================================================
 */

import { useState, useCallback, useEffect } from 'react';
import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

interface SignUpFormProps {
  onSuccess?: (user: RegisteredUser) => void;
  redirectTo?: string;
}

interface RegisteredUser {
  id: string;
  email: string;
  displayName: string;
  walletAddress: string;
  role: string;
}

type FormStep = 'form' | 'creating-wallet' | 'registering' | 'success' | 'error';

// ============================================================================
// COMPONENT
// ============================================================================

export function SignUpForm({ onSuccess, redirectTo = '/dashboard' }: SignUpFormProps) {
  const router = useRouter();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<FormStep>('form');
  const [error, setError] = useState<string | null>(null);
  
  // Track if we're in the middle of signup flow
  const [pendingSignup, setPendingSignup] = useState(false);

  // Get Smart Wallet connector
  const smartWalletConnector = connectors.find(
    (c) => c.id === 'coinbaseWalletSDK'
  );

  // ══════════════════════════════════════════════════════════════════════════
  // EFFECT: Handle wallet connection during signup
  // ══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    // Only proceed if we're in signup flow and wallet just connected
    if (pendingSignup && isConnected && address) {
      registerUser(address);
    }
  }, [isConnected, address, pendingSignup]);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: Validate form and trigger wallet creation
  // ══════════════════════════════════════════════════════════════════════════
  
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate inputs
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    if (!smartWalletConnector) {
      setError('Wallet service unavailable. Please refresh and try again.');
      return;
    }

    // If already connected, disconnect first (fresh signup)
    if (isConnected) {
      disconnect();
    }

    // Start signup flow
    setStep('creating-wallet');
    setPendingSignup(true);

    try {
      // ════════════════════════════════════════════════════════════════════════
      // TRIGGER COINBASE SMART WALLET
      // This opens the Coinbase popup where user creates their passkey
      // ════════════════════════════════════════════════════════════════════════
      
      connect({ connector: smartWalletConnector });
      
      // The actual registration happens in the useEffect above
      // once the wallet connects and we have an address
      
    } catch (err: any) {
      console.error('Wallet creation failed:', err);
      setError('Failed to create account. Please try again.');
      setStep('form');
      setPendingSignup(false);
    }
  }, [name, email, smartWalletConnector, isConnected, disconnect, connect]);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: Register user in backend
  // ══════════════════════════════════════════════════════════════════════════
  
  const registerUser = useCallback(async (walletAddress: string) => {
    setStep('registering');

    try {
      // ════════════════════════════════════════════════════════════════════════
      // POST to backend API
      // Creates user record with wallet address as primary identifier
      // ════════════════════════════════════════════════════════════════════════
      
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          displayName: name.trim(),
          email: email.trim().toLowerCase(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Registration failed');
      }

      const user: RegisteredUser = await response.json();

      // Success!
      setStep('success');
      setPendingSignup(false);

      // Notify parent component
      onSuccess?.(user);

      // Redirect to dashboard after brief delay
      setTimeout(() => {
        router.push(redirectTo);
      }, 1500);

    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(err.message || 'Failed to complete registration');
      setStep('error');
      setPendingSignup(false);
      
      // Disconnect wallet on failed registration
      disconnect();
    }
  }, [name, email, router, redirectTo, onSuccess, disconnect]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Form Step
  // ══════════════════════════════════════════════════════════════════════════
  
  if (step === 'form' || step === 'error') {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
            <p className="text-gray-500 mt-2">Get started with your escrow dashboard</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                required
              />
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                required
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isConnecting}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl
                         hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
            >
              Create Account
            </button>

            {/* Security Note */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Secured with passkey authentication</span>
            </div>

            {/* Login Link */}
            <div className="text-center pt-2">
              <span className="text-gray-500 text-sm">Already have an account? </span>
              <a href="/login" className="text-blue-600 text-sm font-medium hover:text-blue-700">
                Sign In
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Creating Wallet Step
  // ══════════════════════════════════════════════════════════════════════════
  
  if (step === 'creating-wallet') {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
          {/* Animated Icon */}
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">Setting Up Your Account</h3>
          <p className="text-gray-500 mb-6">Complete the setup in the popup window</p>
          
          {/* Instructions */}
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">1</div>
              <span className="text-sm text-gray-600">Choose "Use Passkey" or "Scan with Phone"</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">2</div>
              <span className="text-sm text-gray-600">Enter your PIN or use biometrics</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-gray-200 text-gray-400 rounded-full flex items-center justify-center text-xs font-bold">3</div>
              <span className="text-sm text-gray-400">Account created automatically</span>
            </div>
          </div>

          {/* Cancel Button */}
          <button
            onClick={() => {
              setStep('form');
              setPendingSignup(false);
              disconnect();
            }}
            className="mt-6 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Registering Step
  // ══════════════════════════════════════════════════════════════════════════
  
  if (step === 'registering') {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
          {/* Spinner */}
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">Creating Your Account</h3>
          <p className="text-gray-500">Just a moment...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Success Step
  // ══════════════════════════════════════════════════════════════════════════
  
  if (step === 'success') {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">Account Created!</h3>
          <p className="text-gray-500 mb-4">Welcome aboard, {name.split(' ')[0]}!</p>
          
          <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return null;
}

export default SignUpForm;
