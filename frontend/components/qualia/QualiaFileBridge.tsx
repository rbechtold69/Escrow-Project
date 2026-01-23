'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  Play,
  RefreshCw,
  Trash2,
  Zap,
  Building2,
  ChevronDown,
  ChevronUp,
  Users,
  ArrowRight,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// ============================================================================
// TYPES
// ============================================================================

interface WireBatch {
  id: string;
  batchId: string;
  status: 'UPLOADED' | 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  fileName: string;
  fileType: string;
  totalItems: number;
  totalAmount: number;
  wireCount: number;
  wireTotal: number;
  rtpCount: number;
  rtpTotal: number;
  successCount: number | null;
  failedCount: number | null;
  skippedCount: number | null;
  makerWallet: string;
  makerName: string | null;
  checkerWallet: string | null;
  checkerName: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  executedAt: string | null;
  completedAt: string | null;
  reconciliationGenerated: boolean;
  escrowId: string | null;
}

interface ParsedItem {
  lineNumber: number;
  payeeName: string;
  routingNumber: string;
  accountNumber: string;
  amount: number;
  amountDollars: number;
  referenceId: string;
  accountType?: string;
}

interface UploadResult {
  success: boolean;
  batch: {
    id: string;
    batchId: string;
    status: string;
    fileName: string;
    totalItems: number;
    totalAmount: number;
    summary: {
      wireCount: number;
      rtpCount: number;
      wireTotal: number;
      rtpTotal: number;
      missingBankDetails: number;
    };
    parseErrors: Array<{ lineNumber: number; message: string }>;
    validationErrors: Array<{ lineNumber: number; message: string }>;
  };
  message: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface QualiaFileBridgeProps {
  escrowId?: string;
  bridgeWalletId?: string;
  sourceCurrency?: 'usdb' | 'usdc';
  onBatchProcessed?: (batch: WireBatch) => void;
}

export default function QualiaFileBridge({
  escrowId,
  bridgeWalletId,
  sourceCurrency = 'usdb',
  onBatchProcessed,
}: QualiaFileBridgeProps) {
  const { address, isConnected } = useAccount();
  
  // State
  const [batches, setBatches] = useState<WireBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Fetch batches (filtered by escrowId if provided)
  const fetchBatches = useCallback(async () => {
    try {
      const response = await fetch('/api/qualia/batch');
      if (response.ok) {
        const data = await response.json();
        // Filter batches by escrowId if one is provided
        const filteredBatches = escrowId 
          ? data.batches.filter((b: WireBatch) => b.escrowId === escrowId)
          : data.batches;
        setBatches(filteredBatches);
      }
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    } finally {
      setIsLoading(false);
    }
  }, [escrowId]);
  
  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);
  
  // File upload handler
  const handleFileUpload = useCallback(async (file: File) => {
    if (!address) {
      setError('Please connect your wallet to upload files');
      return;
    }
    
    setIsUploading(true);
    setError(null);
    setUploadResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('makerWallet', address);
      if (escrowId) formData.append('escrowId', escrowId);
      if (bridgeWalletId) formData.append('bridgeWalletId', bridgeWalletId);
      formData.append('sourceCurrency', sourceCurrency);
      
      const response = await fetch('/api/qualia/batch', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setUploadResult(data);
        fetchBatches();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [address, escrowId, bridgeWalletId, sourceCurrency, fetchBatches]);
  
  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(f => 
      f.name.endsWith('.csv') || 
      f.name.endsWith('.txt') || 
      f.name.endsWith('.ach') ||
      f.name.endsWith('.nacha')
    );
    
    if (validFile) {
      handleFileUpload(validFile);
    } else {
      setError('Please upload a NACHA (.ach, .txt) or CSV file');
    }
  }, [handleFileUpload]);
  
  // File input handler
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input
    e.target.value = '';
  }, [handleFileUpload]);
  
  // Batch actions
  const handleBatchAction = useCallback(async (
    batchId: string, 
    action: 'approve' | 'reject' | 'execute' | 'download-reconciliation',
    notes?: string
  ) => {
    if (!address) return;
    
    setActionInProgress(`${batchId}-${action}`);
    setError(null);
    
    try {
      const response = await fetch(`/api/qualia/batch/${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          checkerWallet: address,
          notes,
          bridgeWalletId,
          sourceCurrency,
        }),
      });
      
      if (action === 'download-reconciliation' && response.ok) {
        // Handle file download
        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition');
        const fileName = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 
          `reconciliation_${batchId}.csv`;
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        fetchBatches();
      } else {
        const data = await response.json();
        
        if (response.ok) {
          fetchBatches();
          if (onBatchProcessed && data.batch) {
            onBatchProcessed(data.batch);
          }
        } else {
          setError(data.error || 'Action failed');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionInProgress(null);
    }
  }, [address, bridgeWalletId, sourceCurrency, fetchBatches, onBatchProcessed]);
  
  // Cancel batch
  const handleCancelBatch = useCallback(async (batchId: string) => {
    if (!address) return;
    
    setActionInProgress(`${batchId}-cancel`);
    
    try {
      const response = await fetch(`/api/qualia/batch/${batchId}?wallet=${address}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        fetchBatches();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to cancel batch');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel batch');
    } finally {
      setActionInProgress(null);
    }
  }, [address, fetchBatches]);
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  // Get status badge
  const getStatusBadge = (status: WireBatch['status']) => {
    const configs: Record<WireBatch['status'], { color: string; icon: React.ElementType; label: string }> = {
      UPLOADED: { color: 'bg-blue-100 text-blue-800', icon: Play, label: 'Ready to Execute' },
      PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' },
      APPROVED: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle2, label: 'Approved' },
      PROCESSING: { color: 'bg-purple-100 text-purple-800', icon: RefreshCw, label: 'Processing...' },
      COMPLETED: { color: 'bg-green-100 text-green-800', icon: CheckCircle2, label: 'Completed' },
      PARTIAL: { color: 'bg-orange-100 text-orange-800', icon: AlertTriangle, label: 'Partial Success' },
      FAILED: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Failed' },
      REJECTED: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Rejected' },
      CANCELLED: { color: 'bg-gray-100 text-gray-800', icon: Trash2, label: 'Cancelled' },
    };
    
    const config = configs[status];
    const Icon = config.icon;
    
    return (
      <Badge className={config.color}>
        <Icon className={`h-3 w-3 mr-1 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />
        {config.label}
      </Badge>
    );
  };
  
  // Check if user is the maker
  const isMaker = (batch: WireBatch) => {
    return address && address.toLowerCase() === batch.makerWallet.toLowerCase();
  };

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="h-7 w-7 text-[#00b4d8]" />
            Qualia File Bridge
          </h2>
          <p className="text-gray-600 mt-1">
            Import wire batches from Qualia and process payments instantly
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchBatches}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-red-900">Error</h4>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button 
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}
      
      {/* Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Wire Batch
          </CardTitle>
          <CardDescription>
            Drag and drop a NACHA or CSV file exported from Qualia
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging 
                ? 'border-[#00b4d8] bg-cyan-50' 
                : 'border-gray-300 hover:border-gray-400'
              }
              ${isUploading ? 'opacity-50 pointer-events-none' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv,.txt,.ach,.nacha"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />
            
            {isUploading ? (
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="h-12 w-12 text-[#00b4d8] animate-spin" />
                <p className="text-lg font-medium text-gray-900">Processing file...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className={`p-4 rounded-full ${isDragging ? 'bg-cyan-100' : 'bg-gray-100'}`}>
                  <FileText className={`h-8 w-8 ${isDragging ? 'text-[#00b4d8]' : 'text-gray-500'}`} />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    {isDragging ? 'Drop file here' : 'Drag & drop your Qualia export file'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supports NACHA (.ach, .txt) and CSV formats
                  </p>
                </div>
                <Button variant="outline" className="mt-2">
                  Browse Files
                </Button>
              </div>
            )}
          </div>
          
          {/* Upload Result */}
          {uploadResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{uploadResult.message}</span>
              </div>
              
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Total Items</p>
                  <p className="font-semibold text-gray-900">{uploadResult.batch.totalItems}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Amount</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(uploadResult.batch.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Wire Transfers</p>
                  <p className="font-semibold text-gray-900">
                    {uploadResult.batch.summary.wireCount} ({formatCurrency(uploadResult.batch.summary.wireTotal)})
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">RTP/ACH</p>
                  <p className="font-semibold text-gray-900">
                    {uploadResult.batch.summary.rtpCount} ({formatCurrency(uploadResult.batch.summary.rtpTotal)})
                  </p>
                </div>
              </div>
              
              {(uploadResult.batch.parseErrors.length > 0 || uploadResult.batch.validationErrors.length > 0) && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm font-medium text-yellow-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Warnings
                  </p>
                  <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                    {uploadResult.batch.parseErrors.map((e, i) => (
                      <li key={`parse-${i}`}>Line {e.lineNumber}: {e.message}</li>
                    ))}
                    {uploadResult.batch.validationErrors.map((e, i) => (
                      <li key={`val-${i}`}>Line {e.lineNumber}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Batch List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Wire Batches
          </CardTitle>
          <CardDescription>
            Review, approve, and process wire batch files
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-20 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No wire batches</h3>
              <p className="text-gray-600">
                Upload a NACHA or CSV file from Qualia to get started
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="border rounded-lg overflow-hidden"
                >
                  {/* Batch Header */}
                  <div
                    className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setSelectedBatch(selectedBatch === batch.id ? null : batch.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900">{batch.batchId}</h4>
                            {getStatusBadge(batch.status)}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {batch.fileName} • {batch.totalItems} payees • {formatCurrency(batch.totalAmount)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right text-sm">
                          <p className="text-gray-500">Uploaded</p>
                          <p className="font-medium">{formatDate(batch.uploadedAt)}</p>
                        </div>
                        {selectedBatch === batch.id ? (
                          <ChevronUp className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {selectedBatch === batch.id && (
                    <div className="p-4 border-t">
                      {/* Payment Rail Breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="p-3 bg-orange-50 rounded-lg">
                          <div className="flex items-center gap-2 text-orange-700">
                            <Building2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Fedwire (&gt;$100k)</span>
                          </div>
                          <p className="text-lg font-bold text-orange-900 mt-1">
                            {batch.wireCount} • {formatCurrency(batch.wireTotal)}
                          </p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg">
                          <div className="flex items-center gap-2 text-green-700">
                            <Zap className="h-4 w-4" />
                            <span className="text-sm font-medium">RTP/ACH (≤$100k)</span>
                          </div>
                          <p className="text-lg font-bold text-green-900 mt-1">
                            {batch.rtpCount} • {formatCurrency(batch.rtpTotal)}
                          </p>
                        </div>
                        {batch.successCount !== null && (
                          <div className="p-3 bg-blue-50 rounded-lg">
                            <div className="flex items-center gap-2 text-blue-700">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm font-medium">Successful</span>
                            </div>
                            <p className="text-lg font-bold text-blue-900 mt-1">
                              {batch.successCount} of {batch.totalItems}
                            </p>
                          </div>
                        )}
                        {batch.failedCount !== null && batch.failedCount > 0 && (
                          <div className="p-3 bg-red-50 rounded-lg">
                            <div className="flex items-center gap-2 text-red-700">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm font-medium">Failed</span>
                            </div>
                            <p className="text-lg font-bold text-red-900 mt-1">
                              {batch.failedCount}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Dual Control Info */}
                      <div className="flex items-center gap-4 mb-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-500">Maker:</span>
                          <span className="font-medium">{batch.makerName || `${batch.makerWallet.slice(0, 6)}...`}</span>
                        </div>
                        {batch.checkerWallet && (
                          <>
                            <ArrowRight className="h-4 w-4 text-gray-400" />
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">Checker:</span>
                              <span className="font-medium">{batch.checkerName || `${batch.checkerWallet.slice(0, 6)}...`}</span>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {/* Execution Progress */}
                      {batch.status === 'PROCESSING' && (
                        <div className="mb-4">
                          <Progress value={50} className="h-2" />
                          <p className="text-sm text-gray-500 mt-1">Processing payments...</p>
                        </div>
                      )}
                      
                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {/* Execute button - available immediately after upload */}
                        {['UPLOADED', 'APPROVED'].includes(batch.status) && (
                          <Button
                            onClick={() => handleBatchAction(batch.id, 'execute')}
                            disabled={actionInProgress === `${batch.id}-execute`}
                            className="bg-[#00b4d8] hover:bg-[#0096c7]"
                          >
                            {actionInProgress === `${batch.id}-execute` ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Execute Payments
                          </Button>
                        )}
                        
                        {/* Download reconciliation (after execution) */}
                        {['COMPLETED', 'PARTIAL', 'FAILED'].includes(batch.status) && (
                          <Button
                            variant="outline"
                            onClick={() => handleBatchAction(batch.id, 'download-reconciliation')}
                            disabled={actionInProgress === `${batch.id}-download-reconciliation`}
                          >
                            {actionInProgress === `${batch.id}-download-reconciliation` ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Download Reconciliation
                            {batch.reconciliationGenerated && (
                              <CheckCircle2 className="h-4 w-4 ml-2 text-green-600" />
                            )}
                          </Button>
                        )}
                        
                        {/* Cancel button (for maker, before execution) */}
                        {isMaker(batch) && !['PROCESSING', 'COMPLETED', 'PARTIAL'].includes(batch.status) && (
                          <Button
                            variant="outline"
                            onClick={() => handleCancelBatch(batch.id)}
                            disabled={actionInProgress === `${batch.id}-cancel`}
                            className="text-gray-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        )}
                        
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
