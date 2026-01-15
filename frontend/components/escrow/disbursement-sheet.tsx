'use client';

import { useState } from 'react';
import {
  User,
  Briefcase,
  Wrench,
  Building,
  Building2,
  CreditCard,
  Landmark,
  Mail,
  Check,
  Clock,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Edit,
  ChevronDown,
  ChevronUp,
  Shield,
  Home,
  FileText,
  Scale,
  Truck,
  Users,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { AddPayeeForm, PaymentMethod, PayeeType } from './AddPayeeForm';

// ============================================================
// Types
// ============================================================

interface Payee {
  id: string;
  name: string;
  type: PayeeType;
  email: string;
  paymentMethod: PaymentMethod;
  amount?: number;
  basisPoints?: number;
  usePercentage: boolean;
  status: 'PENDING' | 'READY' | 'PROCESSING' | 'PAID' | 'FAILED' | 'QUEUED' | 'COMPLETED';
  paymentDetails: {
    bankName?: string;
    accountLast4?: string;
    walletAddress?: string;
  };
  paidAt?: Date;
  trackingNumber?: string;
}

interface DisbursementSheetProps {
  escrowId: string;
  purchasePrice: number;
  currentBalance: number;
  buyerName?: string;
  payees: Payee[];
  onAddPayee: (payee: unknown) => Promise<void>;
  onRemovePayee: (payeeId: string) => Promise<void>;
  onUpdatePayee: (payeeId: string, data: unknown) => Promise<void>;
  canEdit: boolean;
}

// ============================================================
// Icons & Labels
// ============================================================

const payeeTypeIcons: Record<string, React.ReactNode> = {
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

const paymentMethodIcons: Record<string, React.ReactNode> = {
  USDC: <CreditCard className="h-4 w-4 text-blue-500" />,
  WIRE: <Landmark className="h-4 w-4" />,
  ACH: <CreditCard className="h-4 w-4" />,
  CHECK: <Mail className="h-4 w-4" />,
  PHYSICAL_CHECK: <Mail className="h-4 w-4" />,
  INTERNATIONAL: <Landmark className="h-4 w-4" />,
};

const paymentMethodLabels: Record<string, string> = {
  USDC: 'Instant Direct',
  WIRE: 'Wire Transfer',
  ACH: 'ACH Transfer',
  CHECK: 'Physical Check',
  PHYSICAL_CHECK: 'Physical Check',
  INTERNATIONAL: 'International Wire',
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', color: 'bg-slate-100 text-slate-600', icon: <Clock className="h-3 w-3" /> },
  READY: { label: 'Ready', color: 'bg-blue-100 text-blue-600', icon: <Check className="h-3 w-3" /> },
  QUEUED: { label: 'Queued', color: 'bg-blue-100 text-blue-600', icon: <Clock className="h-3 w-3" /> },
  PROCESSING: { label: 'Processing', color: 'bg-amber-100 text-amber-600', icon: <Clock className="h-3 w-3 animate-spin" /> },
  PAID: { label: 'Paid', color: 'bg-emerald-100 text-emerald-600', icon: <Check className="h-3 w-3" /> },
  COMPLETED: { label: 'Completed', color: 'bg-emerald-100 text-emerald-600', icon: <Check className="h-3 w-3" /> },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-600', icon: <AlertCircle className="h-3 w-3" /> },
};

// ============================================================
// Main Component
// ============================================================

export function DisbursementSheet({
  escrowId,
  purchasePrice,
  currentBalance,
  buyerName,
  payees,
  onAddPayee,
  onRemovePayee,
  onUpdatePayee,
  canEdit,
}: DisbursementSheetProps) {
  const [isAddingPayee, setIsAddingPayee] = useState(false);
  const [expandedPayee, setExpandedPayee] = useState<string | null>(null);
  const [editingPayeeId, setEditingPayeeId] = useState<string | null>(null);

  // Calculate totals
  const totalDisbursements = payees.reduce((sum, payee) => {
    const amount = payee.usePercentage && payee.basisPoints
      ? (purchasePrice * payee.basisPoints) / 10000
      : payee.amount || 0;
    return sum + amount;
  }, 0);

  const remainingBalance = currentBalance - totalDisbursements;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium text-slate-200">
            Disbursement Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Purchase Price</p>
              <p className="text-xl font-semibold">{formatCurrency(purchasePrice)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Escrow Balance</p>
              <p className="text-xl font-semibold text-emerald-400">
                {formatCurrency(currentBalance)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">To Payees</p>
              <p className="text-xl font-semibold text-blue-400">
                {formatCurrency(totalDisbursements)}
              </p>
            </div>
          </div>

          {/* Breakdown bar */}
          <div className="mt-6">
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-700">
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${Math.min((totalDisbursements / (currentBalance || 1)) * 100, 100)}%` }}
              />
              <div className="bg-emerald-500 flex-1" />
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-400">
              <span>Payees: {formatCurrency(totalDisbursements)}</span>
              <span>Remaining: {formatCurrency(Math.max(remainingBalance, 0))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payees List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Payees ({payees.length})</CardTitle>
            <CardDescription>
              Configure disbursement recipients
            </CardDescription>
          </div>
          {canEdit && !isAddingPayee && (
            <Button
              onClick={() => setIsAddingPayee(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Add Payee
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Add Payee Form */}
          {isAddingPayee && (
            <AddPayeeForm
              escrowId={escrowId}
              purchasePrice={purchasePrice}
              onPayeeAdded={async (payee) => {
                await onAddPayee(payee);
                setIsAddingPayee(false);
              }}
              onCancel={() => setIsAddingPayee(false)}
            />
          )}

          {/* Payee Cards */}
          {payees.length === 0 && !isAddingPayee ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed">
              <Building className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium">No payees added yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Add sellers, agents, and other parties to configure disbursements
              </p>
            </div>
          ) : (
            payees.map((payee) => (
              <PayeeCard
                key={payee.id}
                payee={payee}
                purchasePrice={purchasePrice}
                isExpanded={expandedPayee === payee.id}
                isEditing={editingPayeeId === payee.id}
                onToggle={() => setExpandedPayee(
                  expandedPayee === payee.id ? null : payee.id
                )}
                onEdit={() => setEditingPayeeId(payee.id)}
                onCancelEdit={() => setEditingPayeeId(null)}
                onSaveEdit={async (data) => {
                  await onUpdatePayee(payee.id, data);
                  setEditingPayeeId(null);
                }}
                onRemove={() => onRemovePayee(payee.id)}
                canEdit={canEdit}
                formatCurrency={formatCurrency}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Payee Card Component
// ============================================================

interface PayeeCardProps {
  payee: Payee;
  purchasePrice: number;
  isExpanded: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: { amount?: number; basisPoints?: number }) => Promise<void>;
  onRemove: () => void;
  canEdit: boolean;
  formatCurrency: (amount: number) => string;
}

function PayeeCard({
  payee,
  purchasePrice,
  isExpanded,
  isEditing,
  onToggle,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  canEdit,
  formatCurrency,
}: PayeeCardProps) {
  const [editAmount, setEditAmount] = useState<string>(
    payee.amount?.toString() || ''
  );
  const [editBasisPoints, setEditBasisPoints] = useState<string>(
    payee.basisPoints ? (payee.basisPoints / 100).toFixed(2) : ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const amount = payee.usePercentage && payee.basisPoints
    ? (purchasePrice * payee.basisPoints) / 10000
    : payee.amount || 0;

  const status = statusConfig[payee.status] || statusConfig.PENDING;
  const TypeIcon = payeeTypeIcons[payee.type] || payeeTypeIcons.OTHER;
  const MethodIcon = paymentMethodIcons[payee.paymentMethod] || paymentMethodIcons.WIRE;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className={cn(
        'border rounded-lg transition-all',
        isExpanded ? 'border-slate-300 shadow-sm' : 'border-slate-200',
        (payee.status === 'PAID' || payee.status === 'COMPLETED') && 'bg-emerald-50/50',
        payee.status === 'FAILED' && 'bg-red-50/50',
      )}>
        {/* Main Row */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            {/* Type Icon */}
            <div className={cn(
              'p-2 rounded-lg',
              (payee.status === 'PAID' || payee.status === 'COMPLETED') ? 'bg-emerald-100' : 'bg-slate-100'
            )}>
              {TypeIcon}
            </div>

            {/* Info */}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{payee.name}</p>
                <Badge variant="outline" className={cn('text-xs', status.color)}>
                  {status.icon}
                  <span className="ml-1">{status.label}</span>
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                {MethodIcon}
                <span>{paymentMethodLabels[payee.paymentMethod] || payee.paymentMethod}</span>
                {payee.usePercentage && payee.basisPoints && (
                  <span className="text-slate-400">
                    ({(payee.basisPoints / 100).toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Amount & Actions */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-lg font-semibold">{formatCurrency(amount)}</p>
              {payee.paidAt && (
                <p className="text-xs text-emerald-600">
                  Paid {new Date(payee.paidAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        {/* Expanded Details */}
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4">
              {payee.email && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Email</p>
                  <p className="text-sm">{payee.email}</p>
                </div>
              )}
              
              {/* Bank details (masked) */}
              {payee.paymentDetails?.bankName && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Bank</p>
                  <p className="text-sm">{payee.paymentDetails.bankName}</p>
                </div>
              )}

              {payee.paymentDetails?.accountLast4 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Account</p>
                  <p className="text-sm font-mono">****{payee.paymentDetails.accountLast4}</p>
                </div>
              )}

              {payee.trackingNumber && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 uppercase">Tracking Number</p>
                  <p className="text-sm text-blue-600">{payee.trackingNumber}</p>
                </div>
              )}
            </div>

            {/* Edit Form */}
            {isEditing && (
              <div className="mt-4 pt-4 border-t space-y-4">
                <p className="text-sm font-medium text-slate-700">Edit Payment Amount</p>
                <div className="grid grid-cols-2 gap-4">
                  {payee.usePercentage ? (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Percentage (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={editBasisPoints}
                          onChange={(e) => setEditBasisPoints(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder="3.00"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        = {formatCurrency(purchasePrice * (parseFloat(editBasisPoints) || 0) / 100)}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Amount (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 border rounded-md text-sm"
                          placeholder="10000.00"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCancelEdit}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={isSaving}
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        if (payee.usePercentage) {
                          await onSaveEdit({ basisPoints: Math.round(parseFloat(editBasisPoints) * 100) });
                        } else {
                          await onSaveEdit({ amount: parseFloat(editAmount) });
                        }
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            )}

            {/* Actions */}
            {canEdit && payee.status === 'PENDING' && !isEditing && (
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Payee</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove {payee.name} from this escrow?
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onRemove}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
