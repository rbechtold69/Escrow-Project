'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Shield,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  AlertTriangle,
  Phone,
  Mail,
  Building2,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface LinkStatus {
  id: string;
  token: string;
  status: string;
  expiresAt: string;
  isExpired: boolean;
  accessedAt: string | null;
  verifiedAt: string | null;
  viewedAt: string | null;
  attemptsRemaining: number;
}

interface EscrowInfo {
  id: string;
  escrowId: string;
  propertyAddress: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
}

interface WireInstructions {
  bankName: string;
  bankAddress: string;
  routingNumber: string;
  accountNumber: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  reference: string;
  swiftCode?: string;
  accountLast4: string;
}

type PageState = 'loading' | 'verification' | 'verified' | 'error';

// ============================================================================
// COMPONENT
// ============================================================================

export default function VerifyWirePage() {
  const params = useParams();
  const token = params?.token as string;

  // State
  const [pageState, setPageState] = useState<PageState>('loading');
  const [link, setLink] = useState<LinkStatus | null>(null);
  const [escrow, setEscrow] = useState<EscrowInfo | null>(null);
  const [instructions, setInstructions] = useState<WireInstructions | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Verification state
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [isResending, setIsResending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);

  // Copy state
  const [copied, setCopied] = useState<string | null>(null);

  // Input refs for code fields
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ══════════════════════════════════════════════════════════════════════════
  // FETCH LINK STATUS
  // ══════════════════════════════════════════════════════════════════════════

  const fetchLinkStatus = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`/api/wire-instructions/${token}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Link not found or has expired');
        setPageState('error');
        return;
      }

      setLink(data.link);
      setEscrow(data.escrow);
      setAttemptsRemaining(data.link.attemptsRemaining);

      // Determine page state based on link status
      if (data.link.status === 'VERIFIED' || data.link.status === 'VIEWED') {
        // Already verified - fetch instructions
        await fetchInstructions();
      } else if (data.link.status === 'EXPIRED') {
        setError('This link has expired. Please contact your escrow officer.');
        setPageState('error');
      } else if (data.link.status === 'REVOKED') {
        setError('This link has been revoked. Please contact your escrow officer.');
        setPageState('error');
      } else if (data.link.attemptsRemaining <= 0) {
        setError('Too many verification attempts. Please contact your escrow officer.');
        setPageState('error');
      } else {
        setPageState('verification');
      }
    } catch (err) {
      console.error('Failed to fetch link status:', err);
      setError('Unable to load. Please try again.');
      setPageState('error');
    }
  }, [token]);

  // ══════════════════════════════════════════════════════════════════════════
  // FETCH WIRE INSTRUCTIONS
  // ══════════════════════════════════════════════════════════════════════════

  const fetchInstructions = async () => {
    try {
      const response = await fetch(`/api/wire-instructions/${token}?instructions=true`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load instructions');
        setPageState('error');
        return;
      }

      setLink(data.link);
      setEscrow(data.escrow);
      setInstructions(data.instructions);
      setPageState('verified');
    } catch (err) {
      console.error('Failed to fetch instructions:', err);
      setError('Unable to load instructions. Please try again.');
      setPageState('error');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // REQUEST VERIFICATION CODE
  // ══════════════════════════════════════════════════════════════════════════

  const requestCode = async () => {
    setIsResending(true);
    setVerifyError(null);

    try {
      const response = await fetch(`/api/wire-instructions/${token}/resend-code`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setVerifyError(data.error || 'Failed to send code');
        return;
      }

      setCodeSent(true);
      setCodeExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      console.error('Failed to request code:', err);
      setVerifyError('Failed to send verification code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // VERIFY CODE
  // ══════════════════════════════════════════════════════════════════════════

  const verifyCode = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setVerifyError('Please enter the 6-digit code');
      return;
    }

    setIsVerifying(true);
    setVerifyError(null);

    try {
      const response = await fetch('/api/wire-instructions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code: fullCode }),
      });
      const data = await response.json();

      if (data.locked) {
        setError('Too many verification attempts. Please contact your escrow officer.');
        setPageState('error');
        return;
      }

      if (!data.verified) {
        setAttemptsRemaining(data.attemptsRemaining);
        setVerifyError(`Incorrect code. ${data.attemptsRemaining} attempts remaining.`);
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      // Success! Fetch instructions
      await fetchInstructions();
    } catch (err) {
      console.error('Verification failed:', err);
      setVerifyError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // CODE INPUT HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Auto-advance to next field
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (digit && index === 5 && newCode.every(d => d)) {
      setTimeout(() => verifyCode(), 100);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      inputRefs.current[5]?.focus();
      setTimeout(() => verifyCode(), 100);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // COPY TO CLIPBOARD
  // ══════════════════════════════════════════════════════════════════════════

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // EFFECTS
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    fetchLinkStatus();
  }, [fetchLinkStatus]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: LOADING STATE
  // ══════════════════════════════════════════════════════════════════════════

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading secure portal...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: ERROR STATE
  // ══════════════════════════════════════════════════════════════════════════

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Unable to Access</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
              <p className="font-medium mb-1">Need help?</p>
              <p>Contact your escrow officer for a new secure link.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: VERIFICATION STATE
  // ══════════════════════════════════════════════════════════════════════════

  if (pageState === 'verification') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Secure Wire Instructions</h1>
            <p className="text-gray-600 mt-2">Verify your identity to view wire details</p>
          </div>

          {/* Escrow Summary Card */}
          {escrow && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500">Property</p>
                  <p className="font-medium text-gray-900">{escrow.propertyAddress}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Escrow ID</p>
                  <p className="font-medium text-gray-900">{escrow.escrowId}</p>
                </div>
              </div>
            </div>
          )}

          {/* Verification Card */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            {!codeSent ? (
              // Request Code State
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  SMS Verification Required
                </h2>
                <p className="text-gray-600 text-sm mb-6">
                  We'll send a 6-digit code to the phone number on file ending in{' '}
                  <span className="font-mono font-medium">
                    ***{escrow?.buyerPhone?.slice(-4) || '****'}
                  </span>
                </p>
                <button
                  onClick={requestCode}
                  disabled={isResending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isResending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    'Send Verification Code'
                  )}
                </button>
              </div>
            ) : (
              // Enter Code State
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2 text-center">
                  Enter Verification Code
                </h2>
                <p className="text-gray-600 text-sm mb-6 text-center">
                  Enter the 6-digit code sent to your phone
                </p>

                {/* Code Input */}
                <div className="flex justify-center gap-2 mb-4">
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      onPaste={handleCodePaste}
                      className="w-12 h-14 text-center text-2xl font-mono font-bold border-2 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  ))}
                </div>

                {/* Error Message */}
                {verifyError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm mb-4 justify-center">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{verifyError}</span>
                  </div>
                )}

                {/* Verify Button */}
                <button
                  onClick={verifyCode}
                  disabled={isVerifying || code.some(d => !d)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 mb-4"
                >
                  {isVerifying ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    'Verify Code'
                  )}
                </button>

                {/* Resend Link */}
                <div className="text-center">
                  <button
                    onClick={requestCode}
                    disabled={isResending}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
                  >
                    <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
                    Resend code
                  </button>
                </div>

                {/* Attempts Warning */}
                {attemptsRemaining < 3 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm text-center">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    {attemptsRemaining} verification {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="mt-6 text-center text-xs text-gray-500">
            <Shield className="h-4 w-4 inline mr-1" />
            Secured by EscrowPayi
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: VERIFIED - SHOW INSTRUCTIONS
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Wire Instructions Verified</h1>
          <p className="text-gray-600 mt-2">
            You've verified your identity. Here are your wire instructions.
          </p>
        </div>

        {/* SMS Confirmation Notice */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Phone className="h-5 w-5 text-green-600 mt-0.5" />
          <div>
            <p className="font-medium text-green-800">SMS Confirmation Sent</p>
            <p className="text-sm text-green-700">
              You should receive an SMS confirming the account ending in{' '}
              <span className="font-mono font-bold">{instructions?.accountLast4}</span>.
              Verify this matches the instructions below.
            </p>
          </div>
        </div>

        {/* Escrow Summary */}
        {escrow && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Escrow Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Escrow ID</p>
                <p className="font-medium text-gray-900">{escrow.escrowId}</p>
              </div>
              <div>
                <p className="text-gray-500">Buyer</p>
                <p className="font-medium text-gray-900">{escrow.buyerName}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">Property</p>
                <p className="font-medium text-gray-900">{escrow.propertyAddress}</p>
              </div>
            </div>
          </div>
        )}

        {/* Wire Instructions */}
        {instructions && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-gray-900 text-lg">Wire Transfer Instructions</h2>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                Domestic Wire
              </span>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Bank Name', value: instructions.bankName, key: 'bankName' },
                { label: 'Bank Address', value: instructions.bankAddress, key: 'bankAddress' },
                { label: 'Routing Number (ABA)', value: instructions.routingNumber, key: 'routingNumber' },
                { label: 'Account Number', value: instructions.accountNumber, key: 'accountNumber' },
                { label: 'SWIFT Code', value: instructions.swiftCode, key: 'swiftCode' },
                { label: 'Beneficiary Name', value: instructions.beneficiaryName, key: 'beneficiaryName' },
                { label: 'Beneficiary Address', value: instructions.beneficiaryAddress, key: 'beneficiaryAddress' },
                { label: 'Reference / Memo', value: instructions.reference, key: 'reference' },
              ].filter(item => item.value).map(({ label, value, key }) => (
                <div key={key} className="flex justify-between items-start gap-4 py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-500 shrink-0">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-900 text-right">{value}</span>
                    <button
                      onClick={() => copyToClipboard(value!, key)}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied === key ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Important Notices */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Important</p>
              <ul className="text-sm text-amber-700 mt-2 space-y-1 list-disc list-inside">
                <li>The reference number <strong>MUST</strong> be included in the wire memo</li>
                <li>Double-check all details match the SMS confirmation you received</li>
                <li>Contact your escrow officer if anything seems incorrect</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Expiration Notice */}
        {link && (
          <div className="text-center text-sm text-gray-500 flex items-center justify-center gap-2">
            <Clock className="h-4 w-4" />
            <span>
              This page expires{' '}
              {new Date(link.expiresAt).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          <Shield className="h-4 w-4 inline mr-1" />
          Secured by EscrowPayi
        </div>
      </div>
    </div>
  );
}
