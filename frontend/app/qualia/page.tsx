'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useConnect } from 'wagmi';
import { ArrowLeft, ArrowRight, Building2, ChevronDown, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import QualiaFileBridge from '@/components/qualia/QualiaFileBridge';

interface Escrow {
  id: string;           // Human-readable ID for display/routing
  internalId: string;   // Database ID for foreign keys
  escrowId: string;     // Human-readable ID (same as id)
  propertyAddress: string;
  purchasePrice: number;
  status: string;
  bridgeWalletId?: string;
  yieldEnabled?: boolean;
}

export default function QualiaPage() {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [selectedEscrow, setSelectedEscrow] = useState<Escrow | null>(null);
  const [loadingEscrows, setLoadingEscrows] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Fetch escrows when connected
  useEffect(() => {
    if (isConnected) {
      fetchEscrows();
    }
  }, [isConnected]);
  
  const fetchEscrows = async () => {
    setLoadingEscrows(true);
    try {
      const response = await fetch('/api/escrow/list');
      if (response.ok) {
        const data = await response.json();
        // Filter to only show escrows that have funds and are ready for disbursement
        const eligibleEscrows = data.escrows.filter((e: Escrow) => 
          ['FUNDS_RECEIVED', 'READY_TO_CLOSE'].includes(e.status)
        );
        setEscrows(eligibleEscrows);
      }
    } catch (error) {
      console.error('Failed to fetch escrows:', error);
    } finally {
      setLoadingEscrows(false);
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  // If not connected, show sign-in prompt
  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Sign In Required
          </h1>
          <p className="text-gray-600 mb-6">
            Please sign in to access the Qualia File Bridge for processing wire batch files.
          </p>
          <Button
            onClick={() => {
              const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWalletSDK');
              if (coinbaseConnector) {
                connect({ connector: coinbaseConnector });
              }
            }}
            disabled={isPending}
            className="bg-[#0a1a3a] hover:bg-[#0d2347]"
          >
            {isPending ? 'Connecting...' : 'Sign In'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link 
          href="/" 
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>
      
      {/* Escrow Selector */}
      <Card className="mb-6 border-2 border-[#00b4d8]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#00b4d8]" />
            Select Escrow Account
          </CardTitle>
          <CardDescription>
            Choose which escrow account to upload the wire batch for. This ensures payments are processed from the correct escrow funds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingEscrows ? (
            <div className="animate-pulse h-12 bg-gray-100 rounded-lg" />
          ) : escrows.length === 0 ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-900">No Eligible Escrows</h4>
                <p className="text-sm text-yellow-700">
                  You need an escrow with funds received before you can upload a wire batch. 
                  <Link href="/escrow/new" className="ml-1 text-yellow-800 underline hover:no-underline">
                    Create a new escrow
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`
                  w-full p-4 border-2 rounded-lg text-left transition-colors flex items-center justify-between
                  ${selectedEscrow 
                    ? 'border-[#00b4d8] bg-cyan-50' 
                    : 'border-gray-300 hover:border-gray-400'
                  }
                `}
              >
                {selectedEscrow ? (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#00b4d8] rounded-lg">
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{selectedEscrow.propertyAddress}</p>
                      <p className="text-sm text-gray-500">
                        {selectedEscrow.escrowId} • {formatCurrency(selectedEscrow.purchasePrice)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-500">Select an escrow account...</span>
                )}
                <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {escrows.map((escrow) => (
                    <button
                      key={escrow.id}
                      type="button"
                      onClick={() => {
                        setSelectedEscrow(escrow);
                        setIsDropdownOpen(false);
                      }}
                      className={`
                        w-full p-4 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0
                        ${selectedEscrow?.id === escrow.id ? 'bg-cyan-50' : ''}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Building2 className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{escrow.propertyAddress}</p>
                          <p className="text-sm text-gray-500">
                            {escrow.escrowId} • {formatCurrency(escrow.purchasePrice)}
                          </p>
                        </div>
                        <span className={`
                          text-xs px-2 py-1 rounded-full
                          ${escrow.status === 'FUNDS_RECEIVED' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}
                        `}>
                          {escrow.status === 'FUNDS_RECEIVED' ? 'Funded' : 'Ready to Close'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* File Bridge Component - Only show when escrow is selected */}
      {selectedEscrow ? (
        <QualiaFileBridge 
          escrowId={selectedEscrow.internalId}
          bridgeWalletId={selectedEscrow.bridgeWalletId}
          sourceCurrency={selectedEscrow.yieldEnabled ? 'usdb' : 'usdc'}
        />
      ) : (
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Escrow First</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Please select an escrow account above before uploading a wire batch file. 
              This ensures the payments are processed from the correct escrow funds.
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Help Section */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          How to Use the Qualia File Bridge
        </h3>
        <ol className="space-y-3 text-gray-600">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
            <span>
              <strong>Select Escrow:</strong> Choose the escrow account you want to process payments from.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
            <span>
              <strong>Export from Qualia:</strong> In Qualia, go to Disbursements → Export Wire Batch. 
              Save as NACHA format (.ach) or CSV.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
            <span>
              <strong>Upload here:</strong> Drag and drop the file or click to browse. 
              The system will parse all payees and amounts.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
            <span>
              <strong>Dual Control Approval:</strong> A second escrow officer must review and approve 
              the batch before execution (required for security).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">5</span>
            <span>
              <strong>Execute Payments:</strong> Once approved, click "Execute Payments" to process 
              all wires and ACH transfers via Bridge.xyz.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">6</span>
            <span>
              <strong>Download Reconciliation:</strong> After execution, download the reconciliation 
              CSV and upload it to Qualia to balance your ledger.
            </span>
          </li>
        </ol>
        
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Payment Routing</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Amounts &gt; $100,000:</strong> Routed via Fedwire (same-day settlement)</li>
            <li>• <strong>Amounts ≤ $100,000:</strong> Routed via ACH (1-2 business days)</li>
            <li className="text-blue-600">• <em>RTP (Real-Time Payments) coming Spring 2026 for instant settlement</em></li>
          </ul>
        </div>
        
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-medium text-green-900 mb-2">Demo Sample File</h4>
          <p className="text-sm text-green-800 mb-3">
            Download a sample wire batch CSV file to test the import functionality:
          </p>
          <a 
            href="/samples/qualia-wire-batch-sample.csv" 
            download="qualia-wire-batch-sample.csv"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Sample CSV
          </a>
          <p className="text-xs text-green-700 mt-2">
            Contains 12 payees totaling $695,475 (includes mortgage payoff, seller proceeds, agent commissions, and closing costs)
          </p>
        </div>
      </div>
    </div>
  );
}
