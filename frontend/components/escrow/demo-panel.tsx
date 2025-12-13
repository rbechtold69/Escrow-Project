'use client';

import { useState, useEffect } from 'react';
import { 
  Beaker, 
  DollarSign, 
  CheckCircle2, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';

interface DemoPanelProps {
  escrowId: string;
  status: string;
  purchasePrice: number;
  currentBalance?: number;
  onAction: () => void; // Callback to refresh data
}

export function DemoPanel({
  escrowId,
  status,
  purchasePrice,
  currentBalance,
  onAction,
}: DemoPanelProps) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [isSimulatingDeposit, setIsSimulatingDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(purchasePrice.toString());

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render until mounted (client-side only)
  if (!mounted) {
    return null;
  }

  const handleSimulateDeposit = async () => {
    setIsSimulatingDeposit(true);
    try {
      const response = await fetch(`/api/escrow/${escrowId}/simulate-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(depositAmount) }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to simulate deposit');
      }

      const result = await response.json();
      toast({
        title: '✓ Deposit Simulated',
        description: `$${parseFloat(depositAmount).toLocaleString()} USDC deposited successfully`,
      });
      onAction();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSimulatingDeposit(false);
    }
  };

  const canSimulateDeposit = status === 'CREATED' || status === 'DEPOSIT_PENDING';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-2 border-dashed border-purple-300 bg-gradient-to-br from-purple-50 to-indigo-50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-purple-100/50 transition-colors rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Beaker className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Demo Mode Controls
                    <Badge className="bg-purple-100 text-purple-700 text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Test Environment
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-purple-600">
                    Simulate escrow events for testing
                  </CardDescription>
                </div>
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-purple-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-purple-400" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Simulate Deposit */}
            <div className={`p-4 rounded-lg border ${canSimulateDeposit ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">Simulate Wire Deposit</span>
                {!canSimulateDeposit && (
                  <Badge variant="outline" className="text-xs">Funds Already Received</Badge>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="depositAmount" className="text-xs text-slate-500">
                    Amount (USDC)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <Input
                      id="depositAmount"
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="pl-7"
                      disabled={!canSimulateDeposit}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSimulateDeposit}
                  disabled={!canSimulateDeposit || isSimulatingDeposit}
                  className="self-end bg-emerald-600 hover:bg-emerald-700"
                >
                  {isSimulatingDeposit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Simulate
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Simulates a buyer wire transfer arriving as USDC in the escrow Safe
              </p>
            </div>

            {/* Info Box */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>USDC Only:</strong> All funds remain as 1:1 liquid USDC in the Safe multisig 
                for instant settlement. No swaps or lending.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDepositAmount(purchasePrice.toString())}
                className="text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                Reset to Purchase Price
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDepositAmount((purchasePrice * 0.1).toString())}
                disabled={!canSimulateDeposit}
                className="text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                10% Earnest Money
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDepositAmount((purchasePrice * 0.03).toString())}
                disabled={!canSimulateDeposit}
                className="text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                3% Deposit
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
