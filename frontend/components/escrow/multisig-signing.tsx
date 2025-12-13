'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  Check,
  Clock,
  Loader2,
  ShieldCheck,
  KeyRound,
  Users,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

interface Signer {
  address: string;
  signed: boolean;
  role: string;
  signedAt?: Date;
}

interface PendingSignature {
  safeTxHash: string;
  confirmations: number;
  threshold: number;
  canExecute: boolean;
  signers: Signer[];
}

interface MultisigSigningProps {
  escrowId: string;
  escrowNumber: string;
  currentBalance: number;
  totalDisbursement: number;
  payeeCount: number;
  status: string;
  pendingSignatures: PendingSignature | null;
  onInitiateClose: () => Promise<void>;
  onSign: () => Promise<void>;
  onExecute: () => Promise<void>;
  onRefresh: () => void;
}

// ============================================================
// Component
// ============================================================

export function MultisigSigning({
  escrowId,
  escrowNumber,
  currentBalance,
  totalDisbursement,
  payeeCount,
  status,
  pendingSignatures,
  onInitiateClose,
  onSign,
  onExecute,
  onRefresh,
}: MultisigSigningProps) {
  const { address } = useAccount();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [actionType, setActionType] = useState<'initiate' | 'sign' | 'execute'>('initiate');

  const confirmations = pendingSignatures?.confirmations || 0;
  const threshold = pendingSignatures?.threshold || 2;
  const progressPercent = (confirmations / threshold) * 100;
  const canExecute = pendingSignatures?.canExecute || confirmations >= threshold;

  const handleAction = async () => {
    setIsLoading(true);
    try {
      if (actionType === 'initiate') {
        await onInitiateClose();
        toast({
          title: "Transaction Created",
          description: "Awaiting additional signatures from authorized signers.",
        });
      } else if (actionType === 'sign') {
        await onSign();
        toast({
          title: "Transaction Signed",
          description: "Your signature has been added to the transaction.",
        });
      } else if (actionType === 'execute') {
        await onExecute();
        toast({
          title: "Escrow Closed!",
          description: "All funds have been disbursed to payees.",
        });
      }
      onRefresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to process action",
      });
    } finally {
      setIsLoading(false);
      setShowConfirmDialog(false);
    }
  };

  const openConfirmDialog = (action: 'initiate' | 'sign' | 'execute') => {
    setActionType(action);
    setShowConfirmDialog(true);
  };

  // Determine current state
  const isClosing = status === 'CLOSING';
  const isClosed = status === 'CLOSED';
  const canInitiate = status === 'FUNDS_RECEIVED' || status === 'READY_TO_CLOSE';

  if (isClosed) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <CardTitle className="text-green-700">Escrow Closed</CardTitle>
          </div>
          <CardDescription>
            All signatures collected and funds disbursed successfully.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn(
        "transition-all",
        isClosing && "border-amber-200 bg-amber-50",
        canInitiate && "border-blue-200 bg-blue-50"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-600" />
              <CardTitle className="text-lg">Multisig Approval</CardTitle>
            </div>
            <Badge variant={isClosing ? "secondary" : "outline"}>
              {isClosing ? 'Pending Signatures' : 'Ready to Close'}
            </Badge>
          </div>
          <CardDescription>
            {isClosing 
              ? `${confirmations} of ${threshold} required signatures collected`
              : `Requires ${threshold} authorized signatures to close escrow`
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Signature Progress</span>
              <span className="font-medium">{confirmations}/{threshold}</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Signers List */}
          {isClosing && pendingSignatures?.signers && (
            <div className="space-y-2 border rounded-lg p-3 bg-white">
              <h4 className="text-sm font-medium text-slate-500 mb-2">Signers</h4>
              {pendingSignatures.signers.map((signer, i) => (
                <div 
                  key={i}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-md",
                    signer.signed ? "bg-green-50" : "bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {signer.signed ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{signer.role}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        {signer.address.slice(0, 6)}...{signer.address.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={signer.signed ? "default" : "secondary"}>
                    {signer.signed ? 'Signed' : 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Transaction Hash (if pending) */}
          {isClosing && pendingSignatures?.safeTxHash && (
            <div className="flex items-center justify-between text-sm p-2 bg-slate-100 rounded">
              <span className="text-slate-600">Transaction Hash:</span>
              <code className="text-xs bg-white px-2 py-1 rounded font-mono">
                {pendingSignatures.safeTxHash.slice(0, 10)}...
              </code>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="text-center p-2 bg-slate-50 rounded">
              <p className="text-xs text-slate-500">Balance</p>
              <p className="font-semibold">${currentBalance.toLocaleString()}</p>
            </div>
            <div className="text-center p-2 bg-slate-50 rounded">
              <p className="text-xs text-slate-500">To Disburse</p>
              <p className="font-semibold">${totalDisbursement.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          {/* Initial State: Can initiate close */}
          {canInitiate && !isClosing && (
            <Button 
              onClick={() => openConfirmDialog('initiate')}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <KeyRound className="h-4 w-4 mr-2" />
              )}
              Initiate Close (Sign as Officer)
            </Button>
          )}

          {/* Pending State: Need more signatures */}
          {isClosing && !canExecute && (
            <Button 
              onClick={() => openConfirmDialog('sign')}
              className="w-full"
              variant="outline"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <KeyRound className="h-4 w-4 mr-2" />
              )}
              Add Signature (Demo: Simulate 2nd Signer)
            </Button>
          )}

          {/* Ready to Execute */}
          {isClosing && canExecute && (
            <Button 
              onClick={() => openConfirmDialog('execute')}
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Execute Transaction & Disburse Funds
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'initiate' && 'Initiate Escrow Close?'}
              {actionType === 'sign' && 'Add Your Signature?'}
              {actionType === 'execute' && 'Execute and Disburse?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {actionType === 'initiate' && (
                <>
                  <p>This will create a multisig transaction to close escrow <strong>{escrowNumber}</strong>.</p>
                  <div className="bg-slate-100 p-3 rounded text-sm">
                    <p><strong>Balance:</strong> ${currentBalance.toLocaleString()} USDC</p>
                    <p><strong>Payees:</strong> {payeeCount} recipients</p>
                    <p><strong>Total Disbursement:</strong> ${totalDisbursement.toLocaleString()}</p>
                  </div>
                  <p className="text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Requires {threshold} signatures to execute.
                  </p>
                </>
              )}
              {actionType === 'sign' && (
                <>
                  <p>In production, this would require a different authorized signer.</p>
                  <p>For demo purposes, this simulates a supervisor's signature.</p>
                </>
              )}
              {actionType === 'execute' && (
                <>
                  <p>All required signatures have been collected.</p>
                  <p>This will execute the transaction and disburse:</p>
                  <div className="bg-slate-100 p-3 rounded text-sm">
                    <p><strong>${totalDisbursement.toLocaleString()}</strong> to <strong>{payeeCount}</strong> payees</p>
                  </div>
                  <p className="text-green-600 font-medium">
                    Funds will be sent immediately upon execution.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAction}
              disabled={isLoading}
              className={cn(
                actionType === 'execute' && "bg-green-600 hover:bg-green-700"
              )}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {actionType === 'initiate' && 'Create & Sign'}
              {actionType === 'sign' && 'Add Signature'}
              {actionType === 'execute' && 'Execute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

