'use client';

/**
 * SigningModal - Shows friendly UI during transaction signing
 * 
 * This component wraps the native Coinbase popup experience with
 * additional context for the user about what they're signing.
 * 
 * The actual passkey/QR authentication is handled by Coinbase's SDK,
 * but this modal provides:
 * - Loading states
 * - Success/error feedback
 * - Transaction context (what they're approving)
 */

import { useEffect, useState } from 'react';

// ============ Types ============
interface SigningModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  status: 'idle' | 'pending' | 'confirming' | 'success' | 'error';
  errorMessage?: string;
  txHash?: string;
}

// ============ SigningModal Component ============
export function SigningModal({
  isOpen,
  onClose,
  title,
  description,
  status,
  errorMessage,
  txHash,
}: SigningModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  // Auto-close on success after delay
  useEffect(() => {
    if (status === 'success') {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={status === 'pending' ? undefined : onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        
        {/* Content based on status */}
        <div className="px-6 pb-6">
          {/* Pending - Waiting for user */}
          {status === 'pending' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="font-medium text-gray-900">Waiting for confirmation</p>
              <p className="text-sm text-gray-500 mt-2">
                Complete the authentication in the popup window
              </p>
              
              {/* Visual hint about what to expect */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg text-left">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  You should see a popup asking to:
                </p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    Enter your Windows PIN, or
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    Scan QR code with your phone
                  </li>
                </ul>
              </div>
            </div>
          )}
          
          {/* Confirming - Transaction submitted, waiting for chain */}
          {status === 'confirming' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-medium text-gray-900">Processing</p>
              <p className="text-sm text-gray-500 mt-2">
                Your transaction is being confirmed...
              </p>
              {txHash && (
                <p className="text-xs text-gray-400 mt-4 font-mono">
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </p>
              )}
            </div>
          )}
          
          {/* Success */}
          {status === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-medium text-gray-900">Success!</p>
              <p className="text-sm text-gray-500 mt-2">
                Your action has been confirmed
              </p>
            </div>
          )}
          
          {/* Error */}
          {status === 'error' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="font-medium text-gray-900">Something went wrong</p>
              <p className="text-sm text-red-600 mt-2">
                {errorMessage || 'Please try again'}
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          )}
          
          {/* Idle state - shouldn't show but just in case */}
          {status === 'idle' && (
            <div className="text-center py-8">
              <p className="text-gray-500">Ready to proceed</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ useSigningModal Hook ============
/**
 * Hook to manage signing modal state
 */
export function useSigningModal() {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    status: 'idle' | 'pending' | 'confirming' | 'success' | 'error';
    errorMessage?: string;
    txHash?: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
    status: 'idle',
  });

  const openModal = (title: string, description: string) => {
    setModalState({
      isOpen: true,
      title,
      description,
      status: 'pending',
    });
  };

  const setConfirming = (txHash: string) => {
    setModalState(prev => ({
      ...prev,
      status: 'confirming',
      txHash,
    }));
  };

  const setSuccess = () => {
    setModalState(prev => ({
      ...prev,
      status: 'success',
    }));
  };

  const setError = (message: string) => {
    setModalState(prev => ({
      ...prev,
      status: 'error',
      errorMessage: message,
    }));
  };

  const closeModal = () => {
    setModalState(prev => ({
      ...prev,
      isOpen: false,
      status: 'idle',
    }));
  };

  return {
    modalState,
    openModal,
    setConfirming,
    setSuccess,
    setError,
    closeModal,
  };
}

export default SigningModal;
