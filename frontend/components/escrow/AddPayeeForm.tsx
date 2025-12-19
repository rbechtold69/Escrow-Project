'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { 
  PlusCircle, 
  User, 
  Building, 
  Building2,
  Briefcase, 
  Wrench, 
  Home, 
  Shield, 
  Loader2,
  Landmark,
  FileText,
  Scale,
  Truck,
  CreditCard,
  AlertTriangle,
  Users,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// ============================================================
// Types & Schemas
// ============================================================

export type PaymentMethod = 'WIRE' | 'ACH' | 'CHECK' | 'USDC';

export type PayeeType = 
  // Primary Parties
  | 'BUYER'
  | 'SELLER'
  // Real Estate Agents
  | 'BUYER_AGENT'
  | 'LISTING_AGENT'
  // Lenders & Mortgage
  | 'BUYER_LENDER'
  | 'LOAN_OFFICER'
  | 'MORTGAGE_PAYOFF'
  | 'HELOC_LENDER'
  // Title & Escrow
  | 'ESCROW_COMPANY'
  | 'TITLE_INSURANCE'
  | 'UNDERWRITER'
  // Appraisal
  | 'APPRAISER'
  | 'APPRAISAL_MGMT'
  // Insurance
  | 'HOME_INSURANCE'
  | 'HOME_WARRANTY'
  // Transaction Support
  | 'NOTARY'
  | 'TC_BUYER'
  | 'TC_SELLER'
  // HOA
  | 'HOA'
  | 'HOA_MGMT'
  // Liens & Payoffs
  | 'LIEN_HOLDER'
  // Government
  | 'PROPERTY_TAX'
  | 'COUNTY_RECORDER'
  // Disclosures & Services
  | 'HAZARD_DISCLOSURE'
  | 'COURIER_SERVICE'
  | 'CREDIT_AGENCY'
  // Other
  | 'OTHER';

// Payee types organized by category for the dropdown
const payeeTypeCategories = [
  {
    label: 'Primary Parties',
    types: ['BUYER', 'SELLER'] as PayeeType[],
  },
  {
    label: 'Real Estate Agents',
    types: ['BUYER_AGENT', 'LISTING_AGENT'] as PayeeType[],
  },
  {
    label: 'Lenders & Mortgage',
    types: ['BUYER_LENDER', 'LOAN_OFFICER', 'MORTGAGE_PAYOFF', 'HELOC_LENDER'] as PayeeType[],
  },
  {
    label: 'Title & Escrow',
    types: ['ESCROW_COMPANY', 'TITLE_INSURANCE', 'UNDERWRITER'] as PayeeType[],
  },
  {
    label: 'Appraisal',
    types: ['APPRAISER', 'APPRAISAL_MGMT'] as PayeeType[],
  },
  {
    label: 'Insurance & Warranty',
    types: ['HOME_INSURANCE', 'HOME_WARRANTY'] as PayeeType[],
  },
  {
    label: 'Transaction Support',
    types: ['NOTARY', 'TC_BUYER', 'TC_SELLER', 'COURIER_SERVICE'] as PayeeType[],
  },
  {
    label: 'HOA / Condo',
    types: ['HOA', 'HOA_MGMT'] as PayeeType[],
  },
  {
    label: 'Liens & Payoffs',
    types: ['LIEN_HOLDER'] as PayeeType[],
  },
  {
    label: 'Government',
    types: ['PROPERTY_TAX', 'COUNTY_RECORDER'] as PayeeType[],
  },
  {
    label: 'Other Services',
    types: ['HAZARD_DISCLOSURE', 'CREDIT_AGENCY', 'OTHER'] as PayeeType[],
  },
];

const payeeTypeLabels: Record<PayeeType, string> = {
  // Primary Parties
  BUYER: 'Buyer',
  SELLER: 'Seller',
  // Real Estate Agents
  BUYER_AGENT: "Buyer's Agent (Selling Agent)",
  LISTING_AGENT: "Seller's Agent (Listing Agent)",
  // Lenders & Mortgage
  BUYER_LENDER: "Buyer's Lender",
  LOAN_OFFICER: 'Loan Officer / Mortgage Broker',
  MORTGAGE_PAYOFF: "Mortgage Payoff (Seller's Loan)",
  HELOC_LENDER: 'HELOC Lender',
  // Title & Escrow
  ESCROW_COMPANY: 'Escrow Officer / Escrow Company',
  TITLE_INSURANCE: 'Title Insurance Company',
  UNDERWRITER: 'Underwriter (Lender Side)',
  // Appraisal
  APPRAISER: 'Appraiser',
  APPRAISAL_MGMT: 'Appraisal Management Company',
  // Insurance
  HOME_INSURANCE: 'Homeowners Insurance Company',
  HOME_WARRANTY: 'Home Warranty Company',
  // Transaction Support
  NOTARY: 'Notary Public / Mobile Notary',
  TC_BUYER: 'Transaction Coordinator (Buyer)',
  TC_SELLER: 'Transaction Coordinator (Seller)',
  COURIER_SERVICE: 'Courier / Wire / Recording Service',
  // HOA
  HOA: 'HOA / Condo Association',
  HOA_MGMT: 'HOA Management Company',
  // Liens
  LIEN_HOLDER: 'Lien Holder (Tax, Judgment, etc.)',
  // Government
  PROPERTY_TAX: 'Property Tax Authority',
  COUNTY_RECORDER: 'County Recorder',
  // Other
  HAZARD_DISCLOSURE: 'Natural Hazard Disclosure Provider',
  CREDIT_AGENCY: 'Credit Reporting Agency',
  OTHER: 'Other',
};

const payeeTypeIcons: Record<PayeeType, React.ReactNode> = {
  // Primary Parties
  BUYER: <User className="h-4 w-4" />,
  SELLER: <User className="h-4 w-4" />,
  // Real Estate Agents
  BUYER_AGENT: <Briefcase className="h-4 w-4" />,
  LISTING_AGENT: <Briefcase className="h-4 w-4" />,
  // Lenders & Mortgage
  BUYER_LENDER: <Landmark className="h-4 w-4" />,
  LOAN_OFFICER: <Landmark className="h-4 w-4" />,
  MORTGAGE_PAYOFF: <Home className="h-4 w-4" />,
  HELOC_LENDER: <Landmark className="h-4 w-4" />,
  // Title & Escrow
  ESCROW_COMPANY: <Building className="h-4 w-4" />,
  TITLE_INSURANCE: <Shield className="h-4 w-4" />,
  UNDERWRITER: <ClipboardCheck className="h-4 w-4" />,
  // Appraisal
  APPRAISER: <FileText className="h-4 w-4" />,
  APPRAISAL_MGMT: <Building2 className="h-4 w-4" />,
  // Insurance
  HOME_INSURANCE: <Shield className="h-4 w-4" />,
  HOME_WARRANTY: <Shield className="h-4 w-4" />,
  // Transaction Support
  NOTARY: <FileText className="h-4 w-4" />,
  TC_BUYER: <Users className="h-4 w-4" />,
  TC_SELLER: <Users className="h-4 w-4" />,
  COURIER_SERVICE: <Truck className="h-4 w-4" />,
  // HOA
  HOA: <Building className="h-4 w-4" />,
  HOA_MGMT: <Building2 className="h-4 w-4" />,
  // Liens
  LIEN_HOLDER: <AlertTriangle className="h-4 w-4" />,
  // Government
  PROPERTY_TAX: <Scale className="h-4 w-4" />,
  COUNTY_RECORDER: <Building className="h-4 w-4" />,
  // Other
  HAZARD_DISCLOSURE: <AlertTriangle className="h-4 w-4" />,
  CREDIT_AGENCY: <CreditCard className="h-4 w-4" />,
  OTHER: <Wrench className="h-4 w-4" />,
};

const allPayeeTypes = Object.keys(payeeTypeLabels) as PayeeType[];

// Form data type
interface PayeeFormData {
  firstName: string;
  lastName: string;
  email?: string;
  payeeType: PayeeType;
  paymentMethod: PaymentMethod;
  amount?: number;
  basisPoints?: number;
  usePercentage: boolean;
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  accountType: 'checking' | 'savings';
  walletAddress?: string;
}

// ============================================================
// Component Props
// ============================================================

interface AddPayeeFormProps {
  escrowId: string;
  purchasePrice: number;
  onPayeeAdded: (payee: any) => Promise<void>;
  onCancel: () => void;
}

// ============================================================
// Payment Method Labels
// ============================================================

const paymentMethodLabels: Record<PaymentMethod, string> = {
  USDC: 'Instant Direct Transfer',
  WIRE: 'Wire Transfer (1-2 days)',
  ACH: 'ACH Transfer (2-3 days)',
  CHECK: 'Physical Check (5-7 days)',
};

// ============================================================
// Main Component
// ============================================================

export function AddPayeeForm({
  escrowId,
  purchasePrice,
  onPayeeAdded,
  onCancel,
}: AddPayeeFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PayeeFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      paymentMethod: 'WIRE',
      payeeType: 'SELLER',
      usePercentage: false,
      accountType: 'checking',
      bankName: '',
      routingNumber: '',
      accountNumber: '',
      walletAddress: '',
      amount: undefined,
      basisPoints: undefined,
    },
  });

  const usePercentage = watch('usePercentage');
  const basisPoints = watch('basisPoints');
  const selectedMethod = watch('paymentMethod');

  // Calculate amount from percentage
  const calculatedAmount = usePercentage && basisPoints
    ? (purchasePrice * basisPoints) / 10000
    : null;

  const onSubmit = async (data: PayeeFormData) => {
    console.log('Form submitted with data:', data);
    setSubmitError(null);

    // Basic field validation
    if (!data.firstName || data.firstName.trim().length === 0) {
      setSubmitError('Please enter a first name');
      return;
    }
    if (!data.lastName || data.lastName.trim().length === 0) {
      setSubmitError('Please enter a last name');
      return;
    }
    
    // Manual validation for payment-specific fields
    if (data.paymentMethod === 'USDC') {
      if (!data.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(data.walletAddress)) {
        setSubmitError('Please enter a valid payment address (0x followed by 40 characters)');
        return;
      }
    } else {
      // Bank payment methods
      if (!data.bankName || data.bankName.length < 2) {
        setSubmitError('Please enter a valid bank name');
        return;
      }
      if (!data.routingNumber || !/^\d{9}$/.test(data.routingNumber)) {
        setSubmitError('Routing number must be exactly 9 digits');
        return;
      }
      if (!data.accountNumber || !/^\d{4,17}$/.test(data.accountNumber)) {
        setSubmitError('Account number must be 4-17 digits');
        return;
      }
    }

    // Check amount/percentage
    if (!data.usePercentage && (!data.amount || data.amount <= 0)) {
      setSubmitError('Please enter a valid payment amount');
      return;
    }
    if (data.usePercentage && (!data.basisPoints || data.basisPoints <= 0)) {
      setSubmitError('Please enter a valid percentage');
      return;
    }
    
    try {
      console.log('Submitting payee data:', { escrowId, paymentMethod: data.paymentMethod });
      
      // Call the API to add payee
      const response = await fetch('/api/payees/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || '',
          payeeType: data.payeeType,
          paymentMethod: data.paymentMethod,
          amount: data.usePercentage ? undefined : data.amount,
          basisPoints: data.usePercentage ? data.basisPoints : undefined,
          // Bank details (for WIRE/ACH/CHECK)
          bankName: data.paymentMethod !== 'USDC' ? data.bankName : undefined,
          routingNumber: data.paymentMethod !== 'USDC' ? data.routingNumber : undefined,
          accountNumber: data.paymentMethod !== 'USDC' ? data.accountNumber : undefined,
          accountType: data.paymentMethod !== 'USDC' ? data.accountType : undefined,
          // USDC wallet address
          walletAddress: data.paymentMethod === 'USDC' ? data.walletAddress : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('API error:', error);
        throw new Error(error.error || error.details?.[0]?.message || 'Failed to add payee');
      }

      const result = await response.json();
      console.log('Payee added successfully:', result);
      await onPayeeAdded(result.payee);
    } catch (error: any) {
      console.error('Failed to add payee:', error);
      setSubmitError(error.message || 'Failed to add payee. Please try again.');
    }
  };

  return (
    <Card className="border-2 border-dashed border-emerald-200 bg-emerald-50/30">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <PlusCircle className="h-5 w-5 text-emerald-600" />
          Add Payee
        </CardTitle>
        <CardDescription>
          Enter recipient details for disbursement. Bank information is securely tokenized.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit, (errors) => {
          console.error('Form validation errors:', errors);
          setSubmitError('Form validation failed. Please check all required fields.');
        })} className="space-y-6">
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Basic Info Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* First Name */}
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                placeholder="John"
                {...register('firstName')}
                className={cn(errors.firstName && 'border-red-500')}
              />
              {errors.firstName && (
                <p className="text-xs text-red-500">{errors.firstName.message}</p>
              )}
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Smith"
                {...register('lastName')}
                className={cn(errors.lastName && 'border-red-500')}
              />
              {errors.lastName && (
                <p className="text-xs text-red-500">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payee Type - Grouped Select */}
            <div className="space-y-2">
              <Label>Payee Type</Label>
              <Controller
                name="payeeType"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={cn(errors.payeeType && 'border-red-500')}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {payeeTypeCategories.map((category) => (
                        <SelectGroup key={category.label}>
                          <SelectLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {category.label}
                          </SelectLabel>
                          {category.types.map((type) => (
                            <SelectItem key={type} value={type}>
                              <span className="flex items-center gap-2">
                                {payeeTypeIcons[type]}
                                <span className="truncate">{payeeTypeLabels[type]}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="payee@email.com"
                {...register('email')}
                className={cn(errors.email && 'border-red-500')}
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>
          </div>

          {/* Amount Configuration */}
          <div className="space-y-4 p-4 bg-white rounded-lg border">
            <div className="flex items-center gap-3">
              <Controller
                name="usePercentage"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="usePercentage"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="usePercentage" className="cursor-pointer">
                Use percentage of purchase price
              </Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {usePercentage ? (
                <div className="space-y-2">
                  <Label htmlFor="basisPoints">Percentage (%)</Label>
                  <div className="relative">
                    <Input
                      id="basisPoints"
                      type="number"
                      step="0.01"
                      placeholder="3.00"
                      onChange={(e) => {
                        const percent = parseFloat(e.target.value);
                        if (!isNaN(percent)) {
                          setValue('basisPoints', Math.round(percent * 100));
                        }
                      }}
                      className={cn(errors.basisPoints && 'border-red-500')}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      %
                    </span>
                  </div>
                  {calculatedAmount && (
                    <p className="text-sm text-slate-600">
                      = ${calculatedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      $
                    </span>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="10,000.00"
                      {...register('amount', { valueAsNumber: true })}
                      className={cn('pl-7', errors.amount && 'border-red-500')}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Controller
              name="paymentMethod"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((method) => (
                      <SelectItem key={method} value={method}>
                        {paymentMethodLabels[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Payment Details - Instant or Bank */}
          {selectedMethod === 'USDC' ? (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-3">
                Instant Payment Address
              </h4>
              <p className="text-xs text-blue-600 mb-4">
                ⚡ Funds will be sent directly to this address. Instant settlement with no fees.
              </p>
              <div className="space-y-2">
                <Label htmlFor="walletAddress">Payment Address</Label>
                <Input
                  id="walletAddress"
                  placeholder="0x..."
                  {...register('walletAddress')}
                  className={cn('font-mono', errors.walletAddress && 'border-red-500')}
                />
                {errors.walletAddress && (
                  <p className="text-xs text-red-500">{errors.walletAddress.message}</p>
                )}
                <p className="text-xs text-slate-500">
                  Must be a valid address (0x followed by 40 characters)
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-3">
                {selectedMethod === 'CHECK' ? 'Check Recipient Details' : 'Bank Account Details'}
              </h4>
              <p className="text-xs text-blue-600 mb-4">
                🔒 Your bank information is encrypted and securely tokenized. We never store full account numbers.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    placeholder="Chase Bank"
                    {...register('bankName')}
                    className={cn(errors.bankName && 'border-red-500')}
                  />
                  {errors.bankName && (
                    <p className="text-xs text-red-500">{errors.bankName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routingNumber">Routing Number (ABA)</Label>
                  <Input
                    id="routingNumber"
                    placeholder="021000021"
                    maxLength={9}
                    {...register('routingNumber')}
                    className={cn(errors.routingNumber && 'border-red-500')}
                  />
                  {errors.routingNumber && (
                    <p className="text-xs text-red-500">{errors.routingNumber.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    placeholder="123456789"
                    type="password"
                    {...register('accountNumber')}
                    className={cn(errors.accountNumber && 'border-red-500')}
                  />
                  {errors.accountNumber && (
                    <p className="text-xs text-red-500">{errors.accountNumber.message}</p>
                  )}
                </div>
                {selectedMethod === 'ACH' && (
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Controller
                      name="accountType"
                      control={control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="checking">Checking</SelectItem>
                            <SelectItem value="savings">Savings</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Payee'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
