'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Building,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  Shield,
  Lock,
  CheckCircle2,
  XCircle,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

interface BankInfo {
  name: string;
  city?: string;
  state?: string;
}

interface BankAccountData {
  routingNumber: string;
  accountNumber: string;
  bankName: string;
}

interface BankAccountConnectionProps {
  onSubmit: (data: BankAccountData) => Promise<void>;
  onCancel?: () => void;
  className?: string;
}

// ============================================================
// ABA Routing Number Checksum Algorithm
// ============================================================
/**
 * ABA Routing Number Checksum Validation
 * 
 * The ABA (American Bankers Association) routing number is 9 digits.
 * The checksum uses weights: 3, 7, 1 applied cyclically to each digit.
 * 
 * Formula:
 * 3(d1) + 7(d2) + 1(d3) + 3(d4) + 7(d5) + 1(d6) + 3(d7) + 7(d8) + 1(d9)
 * 
 * The sum must be divisible by 10 (sum % 10 === 0) for a valid routing number.
 * 
 * Example: 021000021 (JPMorgan Chase)
 * 3(0) + 7(2) + 1(1) + 3(0) + 7(0) + 1(0) + 3(0) + 7(2) + 1(1)
 * = 0 + 14 + 1 + 0 + 0 + 0 + 0 + 14 + 1 = 30
 * 30 % 10 = 0 ✓ Valid
 */
function validateABARoutingNumber(routingNumber: string): boolean {
  // Must be exactly 9 digits
  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }

  const digits = routingNumber.split('').map(Number);
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  
  // Calculate weighted sum
  const sum = digits.reduce((acc, digit, index) => {
    return acc + (digit * weights[index]);
  }, 0);
  
  // Valid if sum is divisible by 10
  return sum % 10 === 0;
}

// ============================================================
// Visual Formatting Utilities
// ============================================================

/**
 * Formats account number into groups of 4 for readability
 * e.g., "123456789012" → "1234-5678-9012"
 */
function formatAccountNumber(value: string): string {
  // Remove any non-digits
  const digits = value.replace(/\D/g, '');
  // Group into chunks of 4
  const groups = digits.match(/.{1,4}/g) || [];
  return groups.join('-');
}

/**
 * Strips formatting from account number
 */
function stripFormatting(value: string): string {
  return value.replace(/\D/g, '');
}

// ============================================================
// Main Component
// ============================================================

export function BankAccountConnection({
  onSubmit,
  onCancel,
  className,
}: BankAccountConnectionProps) {
  const { toast } = useToast();
  
  // Routing number state
  const [routingNumber, setRoutingNumber] = useState('');
  const [routingValid, setRoutingValid] = useState<boolean | null>(null);
  const [bankInfo, setBankInfo] = useState<BankInfo | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  
  // Account number state
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [accountsMatch, setAccountsMatch] = useState<boolean | null>(null);
  
  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Refs for hold-to-reveal
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================
  // Routing Number Validation & Bank Lookup
  // ============================================================
  
  const fetchBankInfo = useCallback(async (routingNum: string) => {
    setBankLoading(true);
    setBankError(null);
    setBankInfo(null);
    
    try {
      // Using our local bank lookup API
      const response = await fetch(`/api/bank/lookup?rn=${routingNum}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Invalid routing number');
      }
      
      if (data.valid && data.customer_name) {
        setBankInfo({
          name: data.customer_name,
          city: data.city,
          state: data.state,
        });
        if (data.note) {
          // Bank is valid but name not in our database
          console.log('Bank lookup note:', data.note);
        }
      } else {
        throw new Error('Invalid routing number');
      }
    } catch (error: any) {
      setBankError(error.message || 'Unable to verify bank. Please check the routing number.');
      setRoutingValid(false);
    } finally {
      setBankLoading(false);
    }
  }, []);

  // Validate routing number as user types
  useEffect(() => {
    if (routingNumber.length < 9) {
      setRoutingValid(null);
      setBankInfo(null);
      setBankError(null);
      return;
    }
    
    if (routingNumber.length === 9) {
      const isValid = validateABARoutingNumber(routingNumber);
      setRoutingValid(isValid);
      
      if (isValid) {
        fetchBankInfo(routingNumber);
      } else {
        setBankError('Invalid routing number checksum');
        setBankInfo(null);
      }
    }
  }, [routingNumber, fetchBankInfo]);

  // ============================================================
  // Account Number Matching
  // ============================================================
  
  useEffect(() => {
    const cleanAccount = stripFormatting(accountNumber);
    const cleanConfirm = stripFormatting(confirmAccountNumber);
    
    if (cleanConfirm.length === 0) {
      setAccountsMatch(null);
      return;
    }
    
    setAccountsMatch(cleanAccount === cleanConfirm && cleanAccount.length >= 4);
  }, [accountNumber, confirmAccountNumber]);

  // ============================================================
  // Input Handlers
  // ============================================================
  
  const handleRoutingNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 9);
    setRoutingNumber(value);
  };

  const handleAccountNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 17);
    setAccountNumber(value);
  };

  const handleConfirmAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 17);
    setConfirmAccountNumber(value);
  };

  // Block paste on confirm field
  const handlePasteBlock = (e: React.ClipboardEvent) => {
    e.preventDefault();
    toast({
      title: 'Paste Disabled',
      description: 'For security, please manually type the account number.',
      variant: 'destructive',
    });
  };

  // ============================================================
  // Hold-to-Reveal Handlers
  // ============================================================
  
  const startReveal = () => {
    setShowAccountNumber(true);
  };

  const endReveal = () => {
    setShowAccountNumber(false);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================
  // Form Submission
  // ============================================================
  
  const canSubmit = 
    routingValid === true && 
    bankInfo !== null && 
    accountsMatch === true &&
    stripFormatting(accountNumber).length >= 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSubmit || !bankInfo) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit({
        routingNumber,
        accountNumber: stripFormatting(accountNumber),
        bankName: bankInfo.name,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save bank account',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================
  
  return (
    <Card className={cn('w-full max-w-lg', className)}>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Building className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Connect Bank Account</CardTitle>
            <CardDescription>
              Enter your US bank account details for secure payments
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Security Notice */}
          <Alert className="bg-blue-50 border-blue-200">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-sm">
              Your bank information is encrypted and securely tokenized. 
              We never store full account numbers.
            </AlertDescription>
          </Alert>

          {/* ============================================ */}
          {/* Routing Number Field */}
          {/* ============================================ */}
          <div className="space-y-2">
            <Label htmlFor="routingNumber" className="flex items-center gap-2">
              Routing Number (ABA)
              {routingValid === true && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {routingValid === false && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            
            <div className="relative">
              <Input
                id="routingNumber"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={9}
                value={routingNumber}
                onChange={handleRoutingNumberChange}
                placeholder="021000021"
                className={cn(
                  'font-mono text-lg tracking-wider pr-10',
                  routingValid === true && 'border-green-500 focus-visible:ring-green-500',
                  routingValid === false && 'border-red-500 focus-visible:ring-red-500'
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {bankLoading && (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
            </div>
            
            <p className="text-xs text-slate-500">
              9-digit number from your check or bank statement
            </p>

            {/* Bank Name Display */}
            {bankInfo && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mt-2">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {bankInfo.name}
                  </p>
                  {bankInfo.city && bankInfo.state && (
                    <p className="text-xs text-green-600">
                      {bankInfo.city}, {bankInfo.state}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Error Display */}
            {bankError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{bankError}</p>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/* Account Number Field (with hold-to-reveal) */}
          {/* ============================================ */}
          <div className="space-y-2">
            <Label htmlFor="accountNumber">
              Account Number
            </Label>
            
            <div className="relative">
              <Input
                id="accountNumber"
                type={showAccountNumber ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={21} // 17 digits + 4 dashes
                value={showAccountNumber ? formatAccountNumber(accountNumber) : accountNumber}
                onChange={handleAccountNumberChange}
                placeholder="Enter account number"
                className="font-mono text-lg tracking-wider pr-12"
              />
              
              {/* Hold-to-Reveal Eye Button */}
              <button
                type="button"
                className={cn(
                  'absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded',
                  'hover:bg-slate-100 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  showAccountNumber && 'bg-blue-100'
                )}
                onMouseDown={startReveal}
                onMouseUp={endReveal}
                onMouseLeave={endReveal}
                onTouchStart={startReveal}
                onTouchEnd={endReveal}
                aria-label={showAccountNumber ? 'Hide account number' : 'Hold to reveal account number'}
              >
                {showAccountNumber ? (
                  <Eye className="h-5 w-5 text-blue-600" />
                ) : (
                  <EyeOff className="h-5 w-5 text-slate-400" />
                )}
              </button>
            </div>
            
            <p className="text-xs text-slate-500">
              Hold the eye icon to reveal • 4-17 digits
            </p>
          </div>

          {/* ============================================ */}
          {/* Confirm Account Number Field (anti-paste) */}
          {/* ============================================ */}
          <div className="space-y-2">
            <Label htmlFor="confirmAccount" className="flex items-center gap-2">
              Confirm Account Number
              {accountsMatch === true && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {accountsMatch === false && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </Label>
            
            <div className="relative">
              <Input
                id="confirmAccount"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={17}
                value={confirmAccountNumber}
                onChange={handleConfirmAccountChange}
                onPaste={handlePasteBlock}
                placeholder="Re-enter account number"
                className={cn(
                  'font-mono text-lg tracking-wider pr-10',
                  accountsMatch === true && 'border-green-500 focus-visible:ring-green-500',
                  accountsMatch === false && 'border-red-500 focus-visible:ring-red-500'
                )}
              />
              
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Lock className="h-4 w-4 text-slate-400" />
              </div>
            </div>
            
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Lock className="h-3 w-3" />
              <span>Paste disabled for security • Must type manually</span>
            </div>

            {/* Match Status */}
            {accountsMatch === false && confirmAccountNumber.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">
                  Account numbers do not match
                </p>
              </div>
            )}

            {accountsMatch === true && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700">
                  Account numbers match
                </p>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/* Submission Requirements Checklist */}
          {/* ============================================ */}
          <div className="p-3 bg-slate-50 rounded-lg space-y-2">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Requirements
            </p>
            <div className="space-y-1">
              <RequirementItem 
                met={routingValid === true} 
                label="Valid routing number" 
              />
              <RequirementItem 
                met={bankInfo !== null} 
                label="Bank verified" 
              />
              <RequirementItem 
                met={stripFormatting(accountNumber).length >= 4} 
                label="Account number entered" 
              />
              <RequirementItem 
                met={accountsMatch === true} 
                label="Account numbers match" 
              />
            </div>
          </div>

          {/* ============================================ */}
          {/* Action Buttons */}
          {/* ============================================ */}
          <div className="flex gap-3 pt-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className={cn(
                'flex-1',
                canSubmit 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-slate-300'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Connecting...
                </>
              ) : canSubmit ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Connect Bank Account
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Complete All Fields
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Requirement Item Sub-component
// ============================================================

function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {met ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-slate-300" />
      )}
      <span className={cn(met ? 'text-green-700' : 'text-slate-500')}>
        {label}
      </span>
    </div>
  );
}

export default BankAccountConnection;

