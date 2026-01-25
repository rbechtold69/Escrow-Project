'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Home,
  RefreshCw,
  Shield,
  DollarSign,
  AlertTriangle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { DisbursementSheet } from '@/components/escrow/disbursement-sheet';
import { DemoPanel } from '@/components/escrow/demo-panel';
import { MultisigSigning } from '@/components/escrow/multisig-signing';
import SecureWirePortal from '@/components/escrow/SecureWirePortal';
import { useToast } from '@/hooks/use-toast';
import { usePusher } from '@/hooks/use-pusher';
import { useAccount } from 'wagmi';

// ============================================================
// Types
// ============================================================

interface EscrowData {
  id: string;
  escrowId: string;
  propertyAddress: string;
  purchasePrice: number;
  safeAddress: string;
  vaultAddress: string;
  status: 'CREATED' | 'FUNDS_RECEIVED' | 'READY_TO_CLOSE' | 'CLOSING' | 'CLOSED' | 'CANCELLED';
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  sellerName: string;
  sellerEmail: string;
  createdAt: string;
  depositAmount?: number;
  currentBalance: number;
  initialDeposit?: number;
  yieldEarned?: number;
  yieldReturnedTo?: string;
  depositReceivedAt?: string;
  closedAt?: string;
  wiringInstructions: {
    accountNumber: string;
    routingNumber: string;
    bankName: string;
    bankAddress: string;
    beneficiaryName: string;
    reference: string;
  };
  payees: Array<{
    id: string;
    name: string;
    type: string;
    email: string;
    paymentMethod: string;
    amount?: number;
    basisPoints?: number;
    usePercentage: boolean;
    status: string;
    paymentDetails: Record<string, unknown>;
    paidAt?: Date;
  }>;
  pendingSignatures: Array<{
    safeTxHash: string;
    signers: string[];
    threshold: number;
    confirmations: number;
  }>;
}

interface DepositHistoryData {
  hasVirtualAccount: boolean;
  events: Array<{
    id: string;
    type: string;
    status: string;
    statusColor: string;
    icon: string;
    amount: number;
    formattedAmount: string;
    timestamp: string;
    formattedTimestamp: string;
    txHash?: string;
  }>;
  summary: {
    totalDeposited: number;
    currentBalance: number;
    yieldEarned: number;
    yieldPercent: number;
    formattedYield: string;
    currency: string;
    depositCount: number;
    yieldNote: string;
  } | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  CREATED: { label: 'Awaiting Funds', color: 'bg-amber-100 text-amber-700', icon: Clock },
  DEPOSIT_PENDING: { label: 'Deposit Pending', color: 'bg-orange-100 text-orange-700', icon: Clock },
  FUNDS_RECEIVED: { label: 'Funds Received', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  READY_TO_CLOSE: { label: 'Ready to Close', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  CLOSING: { label: 'Closing...', color: 'bg-purple-100 text-purple-700', icon: RefreshCw },
  CLOSED: { label: 'Closed', color: 'bg-slate-100 text-slate-700', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

// Fallback for any unknown status
const getStatusConfig = (status: string) => {
  return statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: AlertTriangle };
};

// ============================================================
// Main Component
// ============================================================

export default function EscrowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const escrowId = params.id as string;

  const { address } = useAccount();
  const [escrow, setEscrow] = useState<EscrowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [pendingSignatures, setPendingSignatures] = useState<{
    safeTxHash: string;
    confirmations: number;
    threshold: number;
    canExecute: boolean;
    signers: Array<{ address: string; signed: boolean; role: string; signedAt?: Date }>;
  } | null>(null);
  const [depositHistory, setDepositHistory] = useState<DepositHistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Real-time updates via Pusher
  usePusher(`escrow-${escrowId}`, {
    'deposit-received': (data: { amount: string; status: string }) => {
      toast({
        title: 'Deposit Received! ✓',
        description: `$${parseFloat(data.amount).toLocaleString()} has been deposited`,
      });
      fetchEscrow();
    },
    'payment-sent': (data: { payeeIndex: number; amount: string }) => {
      toast({
        title: 'Payment Sent',
        description: `$${parseFloat(data.amount).toLocaleString()} disbursed`,
      });
      fetchEscrow();
    },
  });

  const fetchEscrow = async () => {
    try {
      const response = await fetch(`/api/escrow/${escrowId}`);
      if (!response.ok) throw new Error('Failed to fetch escrow');
      const data = await response.json();
      setEscrow(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load escrow details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDepositHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/escrow/${escrowId}/deposit-history`);
      if (response.ok) {
        const data = await response.json();
        setDepositHistory(data);
      }
    } catch (error) {
      console.log('Could not fetch deposit history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchEscrow();
    fetchCloseStatus();
    fetchDepositHistory();
  }, [escrowId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEscrow();
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: `${label} copied to clipboard` });
  };

  // Fetch close status including pending signatures
  const fetchCloseStatus = async () => {
    try {
      const response = await fetch(`/api/escrow/${escrowId}/close`);
      if (response.ok) {
        const data = await response.json();
        if (data.pendingSignatures) {
          setPendingSignatures(data.pendingSignatures);
        }
      }
    } catch (error) {
      console.error('Failed to fetch close status:', error);
    }
  };

  // Initiate close (first signature)
  const handleInitiateClose = async () => {
    const response = await fetch(`/api/escrow/${escrowId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'initiate', signerAddress: address }),
    });
    if (!response.ok) throw new Error('Failed to initiate close');
    const result = await response.json();
    if (result.pendingSignatures) {
      setPendingSignatures(result.pendingSignatures);
    }
    fetchEscrow();
  };

  // Add signature (second signature for demo)
  const handleSign = async () => {
    const response = await fetch(`/api/escrow/${escrowId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign', signerAddress: 'supervisor-demo' }),
    });
    if (!response.ok) throw new Error('Failed to sign transaction');
    const result = await response.json();
    if (result.pendingSignatures) {
      setPendingSignatures(result.pendingSignatures);
    }
    fetchEscrow();
  };

  // Execute transaction (after threshold met)
  const handleExecute = async () => {
    const response = await fetch(`/api/escrow/${escrowId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'execute', signerAddress: address }),
    });
    if (!response.ok) throw new Error('Failed to execute transaction');
    setPendingSignatures(null);
    fetchEscrow();
  };

  // Legacy handler for backwards compatibility
  const handleCloseEscrow = async () => {
    await handleInitiateClose();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">Escrow not found</p>
        </div>
      </div>
    );
  }

  const status = getStatusConfig(escrow.status);
  const StatusIcon = status.icon;
  
  // Can initiate close if:
  // - Status is FUNDS_RECEIVED or READY_TO_CLOSE (payees configured)
  // - Has payees
  // - Has funds (balance > 0)
  const hasFunds = (escrow.currentBalance || 0) > 0;
  const hasPayees = escrow.payees.length > 0;
  const isReadyStatus = ['FUNDS_RECEIVED', 'READY_TO_CLOSE'].includes(escrow.status);
  const canClose = isReadyStatus && hasPayees && hasFunds;
  
  // Show the close panel (even if can't close yet) when payees are set up
  const showClosePanel = hasPayees && ['CREATED', 'FUNDS_RECEIVED', 'READY_TO_CLOSE', 'CLOSING'].includes(escrow.status);

  // Calculate total to payees
  const totalToPayees = escrow.payees.reduce((sum, p) => {
    const amt = p.usePercentage && p.basisPoints
      ? (escrow.purchasePrice * p.basisPoints) / 10000
      : p.amount || 0;
    return sum + amt;
  }, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-slate-400" />
                <span className="font-medium truncate max-w-md">
                  {escrow.propertyAddress}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge className={cn(status.color, 'gap-1')}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Escrow Progress</h3>
                  <span className="text-sm text-slate-500">
                    {escrow.status === 'CLOSED' ? '100%' : 
                     escrow.status === 'FUNDS_RECEIVED' ? '50%' : '25%'} Complete
                  </span>
                </div>
                <Progress 
                  value={
                    escrow.status === 'CLOSED' ? 100 :
                    escrow.status === 'READY_TO_CLOSE' ? 75 :
                    escrow.status === 'FUNDS_RECEIVED' ? 50 : 25
                  } 
                  className="h-2"
                />
                <div className="flex justify-between mt-4 text-xs text-slate-500">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center mb-1',
                      'bg-emerald-500 text-white'
                    )}>
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                    <span>Created</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center mb-1',
                      escrow.depositReceivedAt ? 'bg-emerald-500 text-white' : 'bg-slate-200'
                    )}>
                      {escrow.depositReceivedAt ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                    <span>Funded</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center mb-1',
                      escrow.payees.length > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-200'
                    )}>
                      {escrow.payees.length > 0 ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <span className="text-xs text-slate-400">{escrow.payees.length}</span>
                      )}
                    </div>
                    <span>Payees</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center mb-1',
                      escrow.status === 'CLOSED' ? 'bg-emerald-500 text-white' : 'bg-slate-200'
                    )}>
                      {escrow.status === 'CLOSED' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                    <span>Closed</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Demo Mode Panel - Always show in dev/demo mode */}
            <DemoPanel
              escrowId={escrow.escrowId}
              status={escrow.status}
              purchasePrice={escrow.purchasePrice}
              currentBalance={escrow.currentBalance}
              onAction={fetchEscrow}
            />

            {/* Tabs */}
            <Tabs defaultValue="disbursements" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="disbursements">Disbursements</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="disbursements" className="mt-4">
                <DisbursementSheet
                  escrowId={escrow.escrowId}
                  purchasePrice={escrow.purchasePrice}
                  currentBalance={escrow.currentBalance}
                  buyerName={escrow.buyerName}
                  payees={escrow.payees as any}
                  onAddPayee={async (payee) => {
                    await fetch(`/api/escrow/${escrowId}/payees`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payee),
                    });
                    fetchEscrow();
                  }}
                  onRemovePayee={async (payeeId) => {
                    await fetch(`/api/escrow/${escrowId}/payees/${payeeId}`, {
                      method: 'DELETE',
                    });
                    fetchEscrow();
                  }}
                  onUpdatePayee={async (payeeId, data) => {
                    await fetch(`/api/escrow/${escrowId}/payees/${payeeId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data),
                    });
                    fetchEscrow();
                  }}
                  canEdit={escrow.status !== 'CLOSED'}
                />
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Activity Log</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-sm text-slate-500">
                        Activity log coming soon...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Documents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full justify-start">
                        <FileText className="h-4 w-4 mr-2" />
                        Wiring Instructions PDF
                        <Download className="h-4 w-4 ml-auto" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Escrow Balance Card */}
            <Card className={cn(
              "text-white",
              hasFunds 
                ? "bg-gradient-to-br from-blue-500 to-blue-600"
                : "bg-gradient-to-br from-amber-500 to-orange-500"
            )}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  {hasFunds ? 'Escrow Balance' : 'Expected Escrow Amount'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {hasFunds 
                    ? formatCurrency(escrow.currentBalance || 0)
                    : formatCurrency(totalToPayees || escrow.purchasePrice || 0)
                  }
                </div>
                <p className={cn("text-sm mt-1", hasFunds ? "text-blue-100" : "text-amber-100")}>
                  {hasFunds 
                    ? 'Held Securely in Escrow'
                    : '⏳ Awaiting Buyer Wire Transfer'
                  }
                </p>
                
                {/* Awaiting Funds Notice */}
                {!hasFunds && hasPayees && (
                  <div className="mt-3 p-3 bg-white/20 rounded-lg">
                    <p className="text-sm font-medium">Ready to Fund</p>
                    <p className="text-xs text-amber-100 mt-1">
                      {escrow.payees.length} payees configured for {formatCurrency(totalToPayees)}.
                      Waiting for buyer to wire funds.
                    </p>
                  </div>
                )}
                
                <div className={cn("mt-4 pt-4 border-t", hasFunds ? "border-blue-400/30" : "border-amber-400/30")}>
                  {hasFunds && (
                    <div className="flex justify-between text-sm">
                      <span className={hasFunds ? "text-blue-100" : "text-amber-100"}>Initial Deposit</span>
                      <span>{formatCurrency(escrow.initialDeposit || escrow.depositAmount || 0)}</span>
                    </div>
                  )}
                  {!hasFunds && hasPayees && (
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-100">To Disburse</span>
                      <span>{formatCurrency(totalToPayees)}</span>
                    </div>
                  )}
                  {depositHistory?.summary?.yieldEarned !== undefined && depositHistory.summary.yieldEarned > 0 && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className={cn("flex items-center gap-1", hasFunds ? "text-blue-100" : "text-amber-100")}>
                        💰 Interest Earned
                      </span>
                      <span className="text-green-200 font-medium">
                        +{depositHistory.summary.formattedYield}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm mt-1">
                    <span className={hasFunds ? "text-blue-100" : "text-amber-100"}>Purchase Price</span>
                    <span>{formatCurrency(escrow.purchasePrice)}</span>
                  </div>
                  {hasPayees && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className={hasFunds ? "text-blue-100" : "text-amber-100"}>Payees</span>
                      <span>{escrow.payees.length} recipients</span>
                    </div>
                  )}
                </div>
                {/* Interest Notice */}
                {depositHistory?.summary?.yieldEarned !== undefined && depositHistory.summary.yieldEarned > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-400/30">
                    <p className="text-xs text-blue-200">
                      ⚖️ All interest earned ({depositHistory.summary.formattedYield}) will be returned to the buyer at close.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Deposit History Card */}
            {depositHistory?.summary && depositHistory.events.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-slate-400" />
                    Deposit Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {depositHistory.events.slice(0, 5).map((event) => (
                      <div key={event.id} className="flex items-start gap-3 text-sm">
                        <span className="text-lg">{event.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{event.status}</div>
                          <div className="text-slate-500 text-xs">
                            {event.formattedTimestamp}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{event.formattedAmount}</div>
                          {event.txHash && (
                            <a 
                              href={`https://basescan.org/tx/${event.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:underline"
                            >
                              View tx →
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Wiring Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="h-5 w-5 text-slate-400" />
                  Wiring Instructions
                </CardTitle>
                <CardDescription>
                  Send funds to this account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <TooltipProvider>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Bank</span>
                      <span className="font-medium">
                        {escrow.wiringInstructions.bankName}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Routing #</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="font-mono text-sm hover:text-blue-600 flex items-center gap-1"
                            onClick={() => copyToClipboard(
                              escrow.wiringInstructions.routingNumber,
                              'Routing number'
                            )}
                          >
                            {escrow.wiringInstructions.routingNumber}
                            <Copy className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Click to copy</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Account #</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="font-mono text-sm hover:text-blue-600 flex items-center gap-1"
                            onClick={() => copyToClipboard(
                              escrow.wiringInstructions.accountNumber,
                              'Account number'
                            )}
                          >
                            {escrow.wiringInstructions.accountNumber}
                            <Copy className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Click to copy</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Reference</span>
                      <span className="font-mono text-sm">
                        {escrow.wiringInstructions.reference}
                      </span>
                    </div>
                  </div>
                </TooltipProvider>

                <Button variant="outline" className="w-full mt-4">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </CardContent>
            </Card>

            {/* Secure Wire Portal - Send verified wire instructions to buyer */}
            {escrow.status !== 'CLOSED' && (
              <SecureWirePortal
                escrowId={escrow.escrowId}
                buyerName={escrow.buyerName}
                buyerEmail={escrow.buyerEmail}
                buyerPhone={escrow.buyerPhone || null}
              />
            )}

            {/* Security Info - Hidden from users, visible to admins only in debug mode */}
            {process.env.NODE_ENV === 'development' && (
              <Card className="opacity-60">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5 text-slate-400" />
                    Security Details
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Dev Only</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-500">
                  <div>
                    <span className="text-xs uppercase">Safe Address</span>
                    <p className="font-mono text-xs">
                      {escrow.safeAddress?.slice(0, 10)}...
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase">Vault Address</span>
                    <p className="font-mono text-xs">
                      {escrow.vaultAddress?.slice(0, 10)}...
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Multisig Close Flow */}
            {showClosePanel && (
              <MultisigSigning
                escrowId={escrow.id}
                escrowNumber={escrow.escrowId}
                currentBalance={escrow.currentBalance || 0}
                totalDisbursement={totalToPayees}
                payeeCount={escrow.payees.length}
                status={escrow.status}
                pendingSignatures={pendingSignatures}
                onInitiateClose={handleInitiateClose}
                onSign={handleSign}
                onExecute={handleExecute}
                onRefresh={handleRefresh}
                canClose={canClose}
                hasFunds={hasFunds}
              />
            )}

            {/* Close Summary - Shows after escrow is closed */}
            {escrow.status === 'CLOSED' && (
              <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-100 rounded-full">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-green-800">Escrow Closed Successfully</CardTitle>
                      <p className="text-sm text-green-600">
                        All funds have been disbursed • {escrow.closedAt ? new Date(escrow.closedAt).toLocaleDateString() : 'Today'}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Payout Summary */}
                  <div className="bg-white rounded-lg border border-green-200 divide-y divide-green-100">
                    <div className="px-4 py-2 bg-green-100/50">
                      <h4 className="text-sm font-medium text-green-800">Disbursement Summary</h4>
                    </div>
                    
                    {/* Payees */}
                    {escrow.payees.map((payee) => {
                      const payeeAmount = payee.basisPoints 
                        ? (escrow.purchasePrice * payee.basisPoints) / 10000
                        : payee.amount || 0;
                      return (
                        <div key={payee.id} className="px-4 py-3 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <div>
                              <p className="text-sm font-medium">{payee.name}</p>
                              <p className="text-xs text-gray-500">{payee.type.replace(/_/g, ' ')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">${payeeAmount.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">{payee.paymentMethod}</p>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Interest Return to Buyer */}
                    {escrow.yieldEarned && Number(escrow.yieldEarned) > 0 && (
                      <div className="px-4 py-3 flex justify-between items-center bg-amber-50">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">💰</span>
                          <div>
                            <p className="text-sm font-medium text-amber-800">
                              {escrow.buyerName || 'Buyer'}
                            </p>
                            <p className="text-xs text-amber-600">Interest Earned (Returned to Depositor)</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-amber-700">+${Number(escrow.yieldEarned).toLocaleString()}</p>
                          <p className="text-xs text-amber-600">Auto-returned</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Total */}
                    <div className="px-4 py-3 flex justify-between items-center bg-green-100/50">
                      <p className="text-sm font-medium text-green-800">Total Disbursed</p>
                      <p className="font-bold text-green-800">
                        ${(totalToPayees + Number(escrow.yieldEarned || 0)).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Legal Compliance Note */}
                  {escrow.yieldEarned && Number(escrow.yieldEarned) > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-700">
                        <strong>⚖️ Legal Compliance:</strong> 100% of interest earned (${Number(escrow.yieldEarned).toLocaleString()}) 
                        was automatically returned to {escrow.yieldReturnedTo || 'the buyer'} as legally required. 
                        Neither EscrowPayi nor the Escrow Agent retained any interest.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
