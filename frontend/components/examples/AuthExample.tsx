'use client';

/**
 * Example: Using Smart Wallet in the Escrow App
 * 
 * This shows how to integrate the auth layer with your escrow functionality.
 */

import { useState } from 'react';
import { LoginButton } from '@/components/auth/LoginButton';
import { SigningModal, useSigningModal } from '@/components/auth/SigningModal';
import { useAuth, useContractWrite, useSignMessage } from '@/hooks/useSmartWallet';
import { parseUnits, type Address } from 'viem';

// Example ABI for EscrowVault (simplified)
const ESCROW_VAULT_ABI = [
  {
    name: 'closeEscrow',
    type: 'function',
    inputs: [{ name: 'minUSDCOut', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'addPayee',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'payeeType', type: 'string' },
    ],
    outputs: [],
  },
] as const;

// ============ Example: Close Escrow Button ============
interface CloseEscrowButtonProps {
  vaultAddress: Address;
  escrowId: string;
  onSuccess?: () => void;
}

export function CloseEscrowButton({ vaultAddress, escrowId, onSuccess }: CloseEscrowButtonProps) {
  const { isConnected } = useAuth();
  const { writeContract, isPending, isConfirming } = useContractWrite();
  const { modalState, openModal, setConfirming, setSuccess, setError, closeModal } = useSigningModal();

  const handleClose = async () => {
    if (!isConnected) {
      alert('Please sign in first');
      return;
    }

    // Open modal to show user what's happening
    openModal(
      'Close Escrow',
      `Confirm closure of ${escrowId}. This will distribute funds to all payees.`
    );

    try {
      // Calculate minimum USDC out (allow 0.5% slippage)
      const minUSDCOut = parseUnits('0', 6); // In production, calculate actual minimum
      
      const hash = await writeContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'closeEscrow',
        args: [minUSDCOut],
      });

      if (hash) {
        setConfirming(hash);
        // In production, wait for confirmation then call setSuccess()
        setTimeout(() => {
          setSuccess();
          onSuccess?.();
        }, 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to close escrow');
    }
  };

  return (
    <>
      <button
        onClick={handleClose}
        disabled={isPending || isConfirming || !isConnected}
        className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 
                   disabled:opacity-50 disabled:cursor-not-allowed font-medium
                   flex items-center justify-center gap-2"
      >
        {isPending || isConfirming ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Processing...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Close Escrow & Disburse</span>
          </>
        )}
      </button>

      <SigningModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.title}
        description={modalState.description}
        status={modalState.status}
        errorMessage={modalState.errorMessage}
        txHash={modalState.txHash}
      />
    </>
  );
}

// ============ Example: Add Payee with Signature ============
interface AddPayeeFormProps {
  vaultAddress: Address;
  onSuccess?: () => void;
}

export function AddPayeeForm({ vaultAddress, onSuccess }: AddPayeeFormProps) {
  const { isConnected } = useAuth();
  const { writeContract, isPending } = useContractWrite();
  const { modalState, openModal, setConfirming, setSuccess, setError, closeModal } = useSigningModal();
  
  const [form, setForm] = useState({
    recipient: '',
    amount: '',
    payeeType: 'SELLER',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected) {
      alert('Please sign in first');
      return;
    }

    openModal(
      'Add Payee',
      `Add ${form.payeeType} to receive ${form.amount}`
    );

    try {
      const hash = await writeContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'addPayee',
        args: [
          form.recipient as Address,
          parseUnits(form.amount.replace(/[^0-9]/g, ''), 6),
          form.payeeType,
        ],
      });

      if (hash) {
        setConfirming(hash);
        setTimeout(() => {
          setSuccess();
          onSuccess?.();
        }, 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add payee');
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={form.recipient}
            onChange={(e) => setForm({ ...form, recipient: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Amount (USD)</label>
          <input
            type="text"
            placeholder="$50,000"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Payee Type</label>
          <select
            value={form.payeeType}
            onChange={(e) => setForm({ ...form, payeeType: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg bg-white"
          >
            <option value="SELLER">Seller</option>
            <option value="LISTING_AGENT">Listing Agent</option>
            <option value="BUYER_AGENT">Buyer's Agent</option>
            <option value="TITLE_INSURANCE">Title Insurance</option>
          </select>
        </div>
        
        <button
          type="submit"
          disabled={isPending || !isConnected}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Adding...' : 'Add Payee'}
        </button>
      </form>

      <SigningModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.title}
        description={modalState.description}
        status={modalState.status}
        errorMessage={modalState.errorMessage}
        txHash={modalState.txHash}
      />
    </>
  );
}

// ============ Example: Full Page with Auth ============
export function EscrowPageExample() {
  const { isConnected, address } = useAuth();
  
  // Mock vault address
  const VAULT_ADDRESS = '0x1234567890123456789012345678901234567890' as Address;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-bold text-xl">EscrowBase</span>
          <LoginButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {!isConnected ? (
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold mb-4">Welcome to EscrowBase</h1>
            <p className="text-gray-600 mb-8">Sign in to manage your escrow accounts</p>
            <LoginButton variant="large" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Escrow Actions</h2>
              <p className="text-sm text-gray-500 mb-6">
                Click any action below to see the signing flow.
                You'll be prompted to confirm with your passkey or phone.
              </p>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-3">Close Escrow</h3>
                  <CloseEscrowButton 
                    vaultAddress={VAULT_ADDRESS}
                    escrowId="ESC-2024-001847"
                    onSuccess={() => console.log('Escrow closed!')}
                  />
                </div>
                
                <div>
                  <h3 className="font-medium mb-3">Add Payee</h3>
                  <AddPayeeForm 
                    vaultAddress={VAULT_ADDRESS}
                    onSuccess={() => console.log('Payee added!')}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default EscrowPageExample;
