'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Home,
  RefreshCw,
  Shield,
  TrendingUp,
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
import { useToast } from '@/hooks/use-toast';
import { usePusher } from '@/hooks/use-pusher';

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
  sellerName: string;
  sellerEmail: string;
  createdAt: string;
  depositAmount?: number;
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
  yieldInfo: {
    principalDeposited: number;
    currentBalance: number;
    accruedYield: number;
    annualYieldBps: number;
    lastUpdate: string;
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

const statusConfig = {
  CREATED: { label: 'Awaiting Funds', color: 'bg-amber-100 text-amber-700', icon: Clock },
  FUNDS_RECEIVED: { label: 'Funds Received', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  READY_TO_CLOSE: { label: 'Ready to Close', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  CLOSING: { label: 'Closing...', color: 'bg-purple-100 text-purple-700', icon: RefreshCw },
  CLOSED: { label: 'Closed', color: 'bg-slate-100 text-slate-700', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

// ============================================================
// Main Component
// ============================================================

export default function EscrowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const escrowId = params.id as string;

  const [escrow, setEscrow] = useState<EscrowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

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

  useEffect(() => {
    fetchEscrow();
  }, [escrowId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEscrow();
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: `${label} copied to clipboard` });
  };

  const handleCloseEscrow = async () => {
    setIsClosing(true);
    try {
      const response = await fetch(`/api/escrow/${escrowId}/close`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to initiate close');

      const result = await response.json();
      toast({
        title: 'Close Initiated',
        description: `Transaction pending ${result.requiredSignatures} signatures`,
      });
      fetchEscrow();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to initiate escrow close',
        variant: 'destructive',
      });
    } finally {
      setIsClosing(false);
    }
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

  const status = statusConfig[escrow.status];
  const StatusIcon = status.icon;
  const canClose = escrow.status === 'FUNDS_RECEIVED' && escrow.payees.length > 0;

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
                onClick={() => router.push('/dashboard')}
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
              currentBalance={escrow.yieldInfo.currentBalance}
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
                  currentBalance={escrow.yieldInfo.currentBalance}
                  accruedYield={escrow.yieldInfo.accruedYield}
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
                      {/* Activity items would go here */}
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
            {/* Yield Card */}
            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Treasury Yield
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  +{formatCurrency(escrow.yieldInfo.accruedYield)}
                </div>
                <p className="text-emerald-100 text-sm mt-1">
                  {(escrow.yieldInfo.annualYieldBps / 100).toFixed(2)}% APY on US Treasuries
                </p>
                <div className="mt-4 pt-4 border-t border-emerald-400/30">
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-100">Principal</span>
                    <span>{formatCurrency(escrow.yieldInfo.principalDeposited)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-emerald-100">Current Balance</span>
                    <span>{formatCurrency(escrow.yieldInfo.currentBalance)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

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
                    <span className="text-xs uppercase">Account ID</span>
                    <p className="font-mono text-xs">
                      {escrow.safeAddress?.slice(0, 10)}...
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase">Vault ID</span>
                    <p className="font-mono text-xs">
                      {escrow.vaultAddress?.slice(0, 10)}...
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Close Escrow Button */}
            {canClose && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    size="lg"
                    disabled={isClosing}
                  >
                    {isClosing ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Close Escrow
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Close Escrow</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will initiate the close process and require 2-of-3 multisig 
                      signatures. Once signed, funds will be disbursed to all payees 
                      and the yield rebate will be sent to the buyer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="my-4 p-4 bg-slate-50 rounded-lg">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Total to Payees</span>
                      <span className="font-medium">
                        {formatCurrency(
                          escrow.payees.reduce((sum, p) => {
                            const amt = p.usePercentage && p.basisPoints
                              ? (escrow.purchasePrice * p.basisPoints) / 10000
                              : p.amount || 0;
                            return sum + amt;
                          }, 0)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Buyer Yield Rebate</span>
                      <span className="font-medium text-emerald-600">
                        +{formatCurrency(escrow.yieldInfo.accruedYield)}
                      </span>
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCloseEscrow}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      Initiate Close
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Pending Signatures */}
            {escrow.pendingSignatures.length > 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-amber-800">
                    Pending Signatures
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {escrow.pendingSignatures.map((sig) => (
                    <div key={sig.safeTxHash} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Confirmations</span>
                        <span className="font-medium">
                          {sig.confirmations} / {sig.threshold}
                        </span>
                      </div>
                      <Progress 
                        value={(sig.confirmations / sig.threshold) * 100}
                        className="h-2"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => window.open(
                          `https://app.safe.global/transactions/queue?safe=base:${escrow.safeAddress}`,
                          '_blank'
                        )}
                      >
                        Sign in Safe
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
