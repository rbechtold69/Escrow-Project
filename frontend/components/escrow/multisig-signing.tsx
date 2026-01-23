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

interface ApprovalSettings {
  requiredApprovals: number;
  currentSignatures: number;
  isSingleApproval: boolean;
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
  approvalSettings?: ApprovalSettings;
  onInitiateClose: () => Promise<void>;
  onSign: () => Promise<void>;
  onExecute: () => Promise<void>;
  onRefresh: () => void;
  canClose?: boolean;    // Whether the escrow can be closed (has funds + payees)
  hasFunds?: boolean;    // Whether funds have been deposited
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
  approvalSettings,
  onInitiateClose,
  onSign,
  onExecute,
  onRefresh,
  canClose: canCloseProp,
  hasFunds: hasFundsProp,
}: MultisigSigningProps) {
  const { address } = useAccount();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [actionType, setActionType] = useState<'initiate' | 'sign' | 'execute'>('initiate');

  // Use approval settings from props or pendingSignatures
  const threshold = approvalSettings?.requiredApprovals || pendingSignatures?.threshold || 1;
  const confirmations = pendingSignatures?.confirmations || 0;
  const isSingleApproval = threshold === 1;
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
  const hasCorrectStatus = status === 'FUNDS_RECEIVED' || status === 'READY_TO_CLOSE';
  const hasFunds = hasFundsProp ?? (currentBalance > 0);
  const awaitingFunds = !hasFunds && ['CREATED', 'READY_TO_CLOSE'].includes(status);
  
  // Safety check: payee amounts must exactly match escrow balance
  const balanceMatches = Math.abs(totalDisbursement - currentBalance) < 0.01; // Allow for tiny floating point differences
  const canInitiate = canCloseProp ?? (hasCorrectStatus && balanceMatches && payeeCount > 0 && hasFunds);
  const balanceDifference = currentBalance - totalDisbursement;

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
              {isSingleApproval ? (
                <ShieldCheck className="h-5 w-5 text-slate-600" />
              ) : (
                <Users className="h-5 w-5 text-slate-600" />
              )}
              <CardTitle className="text-lg">
                {isSingleApproval ? 'Single Approval' : 'Multi-Approval Required'}
              </CardTitle>
            </div>
            <Badge 
              variant={isClosing ? "secondary" : canInitiate ? "default" : "outline"} 
              className={cn(
                canInitiate && !isClosing && "bg-green-100 text-green-700",
                awaitingFunds && "bg-amber-100 text-amber-700"
              )}
            >
              {isClosing 
                ? (isSingleApproval ? 'Ready to Execute' : 'Pending Signatures') 
                : awaitingFunds
                  ? '⏳ Awaiting Funds'
                  : canInitiate 
                    ? '✓ Ready to Close' 
                    : 'Configure Payees'}
            </Badge>
          </div>
          <CardDescription>
            {isClosing 
              ? (isSingleApproval 
                  ? 'Your approval is complete - ready to execute'
                  : `${confirmations} of ${threshold} required signatures collected`)
              : (isSingleApproval
                  ? 'Only your approval is required to close'
                  : `Requires ${threshold} authorized signatures to close escrow`)
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress Bar (only for multi-approval) */}
          {!isSingleApproval && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Signature Progress</span>
                <span className="font-medium">{confirmations}/{threshold}</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {/* Signers List */}
          {isClosing && pendingSignatures?.signers && pendingSignatures.signers.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3 bg-white">
              <h4 className="text-sm font-medium text-slate-500 mb-2">
                {isSingleApproval ? 'Approver' : 'Signers'}
              </h4>
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
                      <p className="text-sm font-medium">
                        {(signer as any).displayName || signer.role}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        {signer.address.slice(0, 6)}...{signer.address.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={signer.signed ? "default" : "secondary"}>
                    {signer.signed ? 'Approved' : 'Pending'}
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
            <div className={cn(
              "text-center p-2 rounded",
              balanceMatches ? "bg-green-50" : "bg-amber-50"
            )}>
              <p className="text-xs text-slate-500">To Disburse</p>
              <p className={cn(
                "font-semibold",
                balanceMatches ? "text-green-600" : "text-amber-600"
              )}>
                ${totalDisbursement.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Warning when amounts don't match */}
          {hasCorrectStatus && !isClosing && !balanceMatches && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Amounts don't match</p>
                  <p className="text-amber-600">
                    {balanceDifference > 0 
                      ? `$${balanceDifference.toLocaleString()} remaining to allocate`
                      : `$${Math.abs(balanceDifference).toLocaleString()} over-allocated`
                    }
                  </p>
                  <p className="text-xs text-amber-500 mt-1">
                    Payee amounts must exactly equal the escrow balance to close.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Warning when awaiting funds */}
          {awaitingFunds && !isClosing && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Awaiting Funds</p>
                  <p className="text-amber-600">
                    Buyer needs to wire funds to the escrow account before you can close.
                    {payeeCount > 0 && ` ${payeeCount} payee${payeeCount > 1 ? 's' : ''} ready to receive ${totalDisbursement > 0 ? `$${totalDisbursement.toLocaleString()}` : 'funds'}.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Warning when no payees */}
          {!awaitingFunds && !isClosing && payeeCount === 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-slate-700">No payees added</p>
                  <p className="text-slate-500">
                    Add at least one payee before closing escrow.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success indicator when ready */}
          {hasCorrectStatus && !isClosing && balanceMatches && payeeCount > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-green-800">Ready to close</p>
                  <p className="text-green-600">
                    All ${totalDisbursement.toLocaleString()} allocated to {payeeCount} payee{payeeCount > 1 ? 's' : ''}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          {/* Awaiting Funds State */}
          {awaitingFunds && !isClosing && (
            <Button 
              className="w-full bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-not-allowed"
              disabled={true}
            >
              <Clock className="h-4 w-4 mr-2" />
              Awaiting Funds to Close
            </Button>
          )}

          {/* Initial State: Show button (enabled only when amounts match and has funds) */}
          {!awaitingFunds && (hasCorrectStatus || hasFunds) && !isClosing && (
            <Button 
              onClick={() => openConfirmDialog('initiate')}
              className={cn(
                "w-full",
                canInitiate 
                  ? "bg-green-600 hover:bg-green-700" 
                  : "bg-slate-300 cursor-not-allowed"
              )}
              disabled={isLoading || !canInitiate}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : canInitiate ? (
                <ShieldCheck className="h-4 w-4 mr-2" />
              ) : (
                <AlertCircle className="h-4 w-4 mr-2" />
              )}
              {canInitiate ? 'Close Escrow' : 'Close Escrow (Amounts Must Match)'}
            </Button>
          )}

          {/* Pending State: Need more signatures (multi-approval only) */}
          {isClosing && !canExecute && !isSingleApproval && (
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
              Add Signature ({threshold - confirmations} more needed)
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
                  <p>This will create a secure transaction to close escrow <strong>{escrowNumber}</strong>.</p>
                  <div className="bg-slate-100 p-3 rounded text-sm">
                    <p><strong>Balance:</strong> ${currentBalance.toLocaleString()}</p>
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



