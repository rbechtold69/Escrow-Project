'use client';

import { useAccount } from 'wagmi';
import { useConnect } from 'wagmi';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import QualiaFileBridge from '@/components/qualia/QualiaFileBridge';

export default function QualiaPage() {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  
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
      
      {/* File Bridge Component */}
      <QualiaFileBridge />
      
      {/* Help Section */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          How to Use the Qualia File Bridge
        </h3>
        <ol className="space-y-3 text-gray-600">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
            <span>
              <strong>Export from Qualia:</strong> In Qualia, go to Disbursements → Export Wire Batch. 
              Save as NACHA format (.ach) or CSV.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
            <span>
              <strong>Upload here:</strong> Drag and drop the file or click to browse. 
              The system will parse all payees and amounts.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
            <span>
              <strong>Dual Control Approval:</strong> A second escrow officer must review and approve 
              the batch before execution (required for security).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
            <span>
              <strong>Execute Payments:</strong> Once approved, click "Execute Payments" to process 
              all wires and ACH transfers via Bridge.xyz.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-[#00b4d8] text-white rounded-full flex items-center justify-center text-sm font-medium">5</span>
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
