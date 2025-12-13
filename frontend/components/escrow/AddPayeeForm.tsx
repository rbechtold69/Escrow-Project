'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, User, Building, Briefcase, Wrench, Home, Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
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

export type PaymentMethod = 'WIRE' | 'ACH' | 'CHECK';
export type PayeeType = 
  | 'SELLER' 
  | 'LISTING_AGENT' 
  | 'BUYER_AGENT' 
  | 'TITLE_INSURANCE'
  | 'ESCROW_COMPANY'
  | 'MORTGAGE_PAYOFF'
  | 'HOA'
  | 'OTHER';

const payeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  payeeType: z.enum(['SELLER', 'LISTING_AGENT', 'BUYER_AGENT', 'TITLE_INSURANCE', 'ESCROW_COMPANY', 'MORTGAGE_PAYOFF', 'HOA', 'OTHER']),
  paymentMethod: z.enum(['WIRE', 'ACH', 'CHECK']),
  amount: z.number().positive('Amount must be positive').optional(),
  basisPoints: z.number().min(0).max(10000).optional(),
  usePercentage: z.boolean().default(false),
  // Bank details
  bankName: z.string().min(2, 'Bank name required'),
  routingNumber: z.string().regex(/^\d{9}$/, 'Routing number must be 9 digits'),
  accountNumber: z.string().regex(/^\d{4,17}$/, 'Account number must be 4-17 digits'),
  accountType: z.enum(['checking', 'savings']).default('checking'),
});

type PayeeFormData = z.infer<typeof payeeSchema>;

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
// Payee Type Icons & Labels
// ============================================================

const payeeTypeIcons: Record<PayeeType, React.ReactNode> = {
  SELLER: <User className="h-4 w-4" />,
  LISTING_AGENT: <Briefcase className="h-4 w-4" />,
  BUYER_AGENT: <Briefcase className="h-4 w-4" />,
  TITLE_INSURANCE: <Shield className="h-4 w-4" />,
  ESCROW_COMPANY: <Building className="h-4 w-4" />,
  MORTGAGE_PAYOFF: <Home className="h-4 w-4" />,
  HOA: <Building className="h-4 w-4" />,
  OTHER: <Wrench className="h-4 w-4" />,
};

const payeeTypeLabels: Record<PayeeType, string> = {
  SELLER: 'Seller',
  LISTING_AGENT: 'Listing Agent',
  BUYER_AGENT: "Buyer's Agent",
  TITLE_INSURANCE: 'Title Insurance',
  ESCROW_COMPANY: 'Escrow Company',
  MORTGAGE_PAYOFF: 'Mortgage Payoff',
  HOA: 'HOA',
  OTHER: 'Other',
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
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
    resolver: zodResolver(payeeSchema),
    defaultValues: {
      paymentMethod: 'WIRE',
      payeeType: 'SELLER',
      usePercentage: false,
      accountType: 'checking',
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
    setSubmitError(null);
    
    try {
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
          bankName: data.bankName,
          routingNumber: data.routingNumber,
          accountNumber: data.accountNumber,
          accountType: data.accountType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add payee');
      }

      const result = await response.json();
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            {/* Payee Type */}
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
                    <SelectContent>
                      {(Object.keys(payeeTypeLabels) as PayeeType[]).map((type) => (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            {payeeTypeIcons[type]}
                            {payeeTypeLabels[type]}
                          </span>
                        </SelectItem>
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

          {/* Bank Details */}
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
