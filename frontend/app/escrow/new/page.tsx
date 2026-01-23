'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ArrowLeft, Building2, Loader2, Copy, Download, CheckCircle2, Mail, User, TrendingUp, Shield, Users, Plus, X, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface WiringInstructions {
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  bankAddress: string;
  swiftCode?: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  reference: string;
}

type FormStep = 'details' | 'creating' | 'wiring';
type EntryMode = 'manual' | 'import';

export default function NewEscrowPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  
  const [mounted, setMounted] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>('manual');
  const [step, setStep] = useState<FormStep>('details');
  const [formData, setFormData] = useState({
    // Property Details
    propertyAddress: '',
    city: '',
    state: '',
    zipCode: '',
    purchasePrice: '',
    // Buyer Details
    buyerFirstName: '',
    buyerLastName: '',
    buyerEmail: '',
    // Yield Preference
    yieldEnabled: true, // Default: ON (USDB)
    // Approval Settings
    multiApproval: false, // Default: single signer
  });
  
  // Import mode state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    escrow?: {
      escrowId: string;
      qualiaFileNumber?: string;
      propertyAddress: string;
      purchasePrice: number;
      buyer: string;
    };
    payees?: {
      created: number;
      failed: number;
      total: number;
    };
    wiringInstructions?: WiringInstructions;
    error?: string;
  } | null>(null);
  
  // Additional signers for multi-approval
  const [additionalSigners, setAdditionalSigners] = useState<Array<{
    walletAddress: string;
    displayName: string;
    role: string;
  }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wiringInstructions, setWiringInstructions] = useState<WiringInstructions | null>(null);
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Handle file selection
  const handleFileSelect = (file: File) => {
    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      setSelectedFile(file);
      setImportResult(null);
    } else {
      toast({
        title: 'Invalid File',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
    }
  };
  
  // Handle import submission
  const handleImport = async () => {
    if (!selectedFile || !address) return;
    
    setIsUploading(true);
    setImportResult(null);
    
    try {
      const formDataObj = new FormData();
      formDataObj.append('file', selectedFile);
      formDataObj.append('officerWallet', address);
      formDataObj.append('yieldEnabled', formData.yieldEnabled.toString());
      formDataObj.append('multiApproval', formData.multiApproval.toString());
      formDataObj.append('additionalSigners', JSON.stringify(additionalSigners));
      
      const response = await fetch('/api/escrow/import', {
        method: 'POST',
        body: formDataObj,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setImportResult({
          success: false,
          error: data.error || 'Import failed',
        });
        return;
      }
      
      setImportResult({
        success: true,
        escrow: data.escrow,
        payees: data.payees,
        wiringInstructions: data.wiringInstructions,
      });
      
      // Set state for wiring instructions display
      setEscrowId(data.escrow.escrowId);
      setWiringInstructions(data.wiringInstructions);
      setStep('wiring');
      
      // Update form data for display
      setFormData(prev => ({
        ...prev,
        buyerFirstName: data.escrow.buyer.split(' ')[0] || '',
        buyerLastName: data.escrow.buyer.split(' ').slice(1).join(' ') || '',
        buyerEmail: data.escrow.buyerEmail || '',
      }));
      
    } catch (error) {
      setImportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Property validation
    if (!formData.propertyAddress.trim()) {
      newErrors.propertyAddress = 'Property address is required';
    }
    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }
    if (!formData.state.trim()) {
      newErrors.state = 'State is required';
    }
    if (!formData.zipCode.trim()) {
      newErrors.zipCode = 'ZIP code is required';
    } else if (!/^\d{5}(-\d{4})?$/.test(formData.zipCode)) {
      newErrors.zipCode = 'Invalid ZIP code format';
    }
    if (!formData.purchasePrice.trim()) {
      newErrors.purchasePrice = 'Purchase price is required';
    } else {
      const price = parseFloat(formData.purchasePrice.replace(/[^0-9.]/g, ''));
      if (isNaN(price) || price <= 0) {
        newErrors.purchasePrice = 'Enter a valid purchase price';
      } else if (price < 10000) {
        newErrors.purchasePrice = 'Minimum purchase price is $10,000';
      }
    }

    // Buyer validation
    if (!formData.buyerFirstName.trim()) {
      newErrors.buyerFirstName = 'Buyer first name is required';
    }
    if (!formData.buyerLastName.trim()) {
      newErrors.buyerLastName = 'Buyer last name is required';
    }
    if (!formData.buyerEmail.trim()) {
      newErrors.buyerEmail = 'Buyer email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.buyerEmail)) {
      newErrors.buyerEmail = 'Enter a valid email address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    setStep('creating');
    
    try {
      const fullAddress = `${formData.propertyAddress}, ${formData.city}, ${formData.state} ${formData.zipCode}`;
      const purchasePrice = Math.round(
        parseFloat(formData.purchasePrice.replace(/[^0-9.]/g, '')) * 1e6 // USDC has 6 decimals
      );
      
      const response = await fetch('/api/escrow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyAddress: fullAddress,
          city: formData.city,
          state: formData.state,
          zipCode: formData.zipCode,
          purchasePrice,
          buyerFirstName: formData.buyerFirstName,
          buyerLastName: formData.buyerLastName,
          buyerEmail: formData.buyerEmail,
          officerAddress: address,
          yieldEnabled: formData.yieldEnabled,
          // Approval settings
          requiredApprovals: formData.multiApproval ? (additionalSigners.length + 1) : 1,
          additionalSigners: formData.multiApproval ? additionalSigners : [],
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create escrow');
      }
      
      const data = await response.json();
      setEscrowId(data.escrowId);
      setWiringInstructions(data.wiringInstructions);
      setStep('wiring');
      
    } catch (error) {
      console.error('Error creating escrow:', error);
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to create escrow' });
      setStep('details');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleEmailToBuyer = async () => {
    if (!escrowId || !wiringInstructions) return;
    
    setIsSendingEmail(true);
    
    // In a real app, this would call an API to send the email
    // For demo purposes, we'll just show a success message
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: 'Email Sent!',
        description: `Wiring instructions sent to ${formData.buyerEmail}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send email. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const downloadPDF = async () => {
    if (!escrowId) return;
    
    // For demo, show a message that PDF download is coming
    toast({
      title: 'Coming Soon',
      description: 'PDF download will be available in the full version.',
    });
  };

  const formatPrice = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '');
    if (!numbers) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(parseInt(numbers));
  };

  // Show loading state until mounted
  if (!mounted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <Alert>
          <AlertDescription>
            Please sign in to create an escrow.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Escrow</h1>
          <p className="text-gray-600">Create a new property escrow</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {['Property & Buyer Details', 'Creating Escrow', 'Wiring Instructions'].map((label, index) => {
          const stepIndex = ['details', 'creating', 'wiring'].indexOf(step);
          const isActive = index === stepIndex;
          const isComplete = index < stepIndex;
          
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`
                flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                ${isComplete ? 'bg-green-600 text-white' : ''}
                ${isActive ? 'bg-blue-600 text-white' : ''}
                ${!isActive && !isComplete ? 'bg-gray-200 text-gray-600' : ''}
              `}>
                {isComplete ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${isActive ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                {label}
              </span>
              {index < 2 && <div className="flex-1 h-px bg-gray-200" />}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {step === 'details' && (
        <div className="space-y-6">
          {/* Entry Mode Toggle */}
          <Card className="border-2 border-dashed border-[#00b4d8]">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setEntryMode('manual')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                    entryMode === 'manual'
                      ? 'border-[#00b4d8] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${entryMode === 'manual' ? 'bg-[#00b4d8]' : 'bg-gray-200'}`}>
                      <Building2 className={`h-5 w-5 ${entryMode === 'manual' ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                    <div className="text-left">
                      <p className={`font-medium ${entryMode === 'manual' ? 'text-[#00b4d8]' : 'text-gray-700'}`}>
                        Manual Entry
                      </p>
                      <p className="text-sm text-gray-500">Enter escrow details manually</p>
                    </div>
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setEntryMode('import')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                    entryMode === 'import'
                      ? 'border-[#00b4d8] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${entryMode === 'import' ? 'bg-[#00b4d8]' : 'bg-gray-200'}`}>
                      <FileSpreadsheet className={`h-5 w-5 ${entryMode === 'import' ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                    <div className="text-left">
                      <p className={`font-medium ${entryMode === 'import' ? 'text-[#00b4d8]' : 'text-gray-700'}`}>
                        Qualia Import
                      </p>
                      <p className="text-sm text-gray-500">Import from Qualia export file</p>
                    </div>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Import Mode UI */}
          {entryMode === 'import' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Import from Qualia
                </CardTitle>
                <CardDescription>
                  Upload a Qualia export file to auto-populate escrow details and payees
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Drag and Drop Zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileSelect(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
                    ${isDragging ? 'border-[#00b4d8] bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                    ${selectedFile ? 'border-green-400 bg-green-50' : ''}
                  `}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    accept=".csv,.txt"
                    className="hidden"
                  />
                  
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                      <div className="text-left">
                        <p className="font-medium text-green-800">{selectedFile.name}</p>
                        <p className="text-sm text-green-600">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          setImportResult(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-600 font-medium">Drag and drop your Qualia file here</p>
                      <p className="text-sm text-gray-500 mt-1">or click to browse</p>
                      <p className="text-xs text-gray-400 mt-2">Supports CSV files with escrow header and payees</p>
                    </>
                  )}
                </div>
                
                {/* Download Sample */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Need a sample file?</p>
                    <p className="text-xs text-gray-500">Download our template to see the expected format</p>
                  </div>
                  <a
                    href="/samples/qualia-full-escrow-sample.csv"
                    download
                    className="text-sm text-[#00b4d8] hover:underline font-medium"
                  >
                    Download Sample CSV
                  </a>
                </div>
                
                {/* Import Error */}
                {importResult && !importResult.success && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{importResult.error}</AlertDescription>
                  </Alert>
                )}
                
                {/* File Format Info */}
                <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-lg">
                  <p className="font-medium text-blue-800 mb-1">Expected File Format:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                    <li>File Number / Qualia Escrow ID</li>
                    <li>Property Address, City, State, Zip Code</li>
                    <li>Purchase Price</li>
                    <li>Buyer First Name, Last Name, Email</li>
                    <li>Payees with bank details (will be tokenized securely)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manual Entry Form */}
          {entryMode === 'manual' && (
          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Property Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Property Details
              </CardTitle>
              <CardDescription>
                Enter the property information and purchase price
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="propertyAddress">Street Address</Label>
                <Input
                  id="propertyAddress"
                  placeholder="123 Main Street"
                  value={formData.propertyAddress}
                  onChange={(e) => setFormData(prev => ({ ...prev, propertyAddress: e.target.value }))}
                  className={errors.propertyAddress ? 'border-red-500' : ''}
                />
                {errors.propertyAddress && (
                  <p className="text-sm text-red-500 mt-1">{errors.propertyAddress}</p>
                )}
              </div>

              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-3">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="Los Angeles"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    className={errors.city ? 'border-red-500' : ''}
                  />
                  {errors.city && (
                    <p className="text-sm text-red-500 mt-1">{errors.city}</p>
                  )}
                </div>
                <div className="col-span-1">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    placeholder="CA"
                    maxLength={2}
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                    className={errors.state ? 'border-red-500' : ''}
                  />
                  {errors.state && (
                    <p className="text-sm text-red-500 mt-1">{errors.state}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <Label htmlFor="zipCode">ZIP Code</Label>
                  <Input
                    id="zipCode"
                    placeholder="90210"
                    value={formData.zipCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                    className={errors.zipCode ? 'border-red-500' : ''}
                  />
                  {errors.zipCode && (
                    <p className="text-sm text-red-500 mt-1">{errors.zipCode}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="purchasePrice">Purchase Price</Label>
                <Input
                  id="purchasePrice"
                  placeholder="$500,000"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    purchasePrice: formatPrice(e.target.value) 
                  }))}
                  className={errors.purchasePrice ? 'border-red-500' : ''}
                />
                {errors.purchasePrice && (
                  <p className="text-sm text-red-500 mt-1">{errors.purchasePrice}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Buyer Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Buyer Information
              </CardTitle>
              <CardDescription>
                Enter the buyer's details to send them wiring instructions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="buyerFirstName">First Name</Label>
                  <Input
                    id="buyerFirstName"
                    placeholder="John"
                    value={formData.buyerFirstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, buyerFirstName: e.target.value }))}
                    className={errors.buyerFirstName ? 'border-red-500' : ''}
                  />
                  {errors.buyerFirstName && (
                    <p className="text-sm text-red-500 mt-1">{errors.buyerFirstName}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="buyerLastName">Last Name</Label>
                  <Input
                    id="buyerLastName"
                    placeholder="Smith"
                    value={formData.buyerLastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, buyerLastName: e.target.value }))}
                    className={errors.buyerLastName ? 'border-red-500' : ''}
                  />
                  {errors.buyerLastName && (
                    <p className="text-sm text-red-500 mt-1">{errors.buyerLastName}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="buyerEmail">Email Address</Label>
                <Input
                  id="buyerEmail"
                  type="email"
                  placeholder="john.smith@email.com"
                  value={formData.buyerEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, buyerEmail: e.target.value }))}
                  className={errors.buyerEmail ? 'border-red-500' : ''}
                />
                {errors.buyerEmail && (
                  <p className="text-sm text-red-500 mt-1">{errors.buyerEmail}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  We'll use this to send the buyer their wiring instructions
                </p>
              </div>
            </CardContent>
          </Card>
          </form>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {/* SHARED SETTINGS - Appear for both Manual Entry and Qualia Import           */}
          {/* ══════════════════════════════════════════════════════════════════════════ */}

          {/* Yield Preference Card */}
          <Card className="border-2 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Interest Earnings Option
              </CardTitle>
              <CardDescription>
                Allow the buyer to earn interest while funds are held in escrow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${formData.yieldEnabled ? 'bg-green-100' : 'bg-gray-200'}`}>
                    {formData.yieldEnabled ? (
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    ) : (
                      <Shield className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {formData.yieldEnabled ? 'Earn Interest' : 'Standard Hold'}
                      </p>
                      {formData.yieldEnabled && (
                        <a 
                          href="/learn/yield" 
                          target="_blank"
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Learn more
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {formData.yieldEnabled 
                        ? 'Funds earn ~4-5% APY while in escrow' 
                        : 'Funds held securely, no interest earned'
                      }
                    </p>
                  </div>
                </div>
                
                {/* Professional Toggle Button */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.yieldEnabled}
                  onClick={() => setFormData(prev => ({ ...prev, yieldEnabled: !prev.yieldEnabled }))}
                  className={`
                    relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full 
                    border-2 border-transparent transition-colors duration-200 ease-in-out
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                    ${formData.yieldEnabled 
                      ? 'bg-green-600 focus-visible:outline-green-600' 
                      : 'bg-gray-300 focus-visible:outline-gray-400'
                    }
                  `}
                >
                  <span className="sr-only">Enable interest earning</span>
                  <span
                    className={`
                      pointer-events-none inline-block h-6 w-6 transform rounded-full 
                      bg-white shadow-lg ring-0 transition duration-200 ease-in-out
                      ${formData.yieldEnabled ? 'translate-x-7' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              {/* Info Box */}
              <div className={`mt-4 p-4 rounded-lg ${formData.yieldEnabled ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
                {formData.yieldEnabled ? (
                  <>
                    <p className="text-sm text-green-800 font-medium mb-1">💰 Interest-Earning Enabled</p>
                    <p className="text-sm text-green-700">
                      Escrowed funds will earn interest through our FDIC-eligible banking partners.
                      <strong> 100% of interest earned belongs to the buyer</strong> and will be 
                      automatically added to their funds at escrow close.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-blue-800 font-medium mb-1">🛡️ Standard Hold</p>
                    <p className="text-sm text-blue-700">
                      Funds will be held securely with no interest earned. 
                      Some buyers prefer this simpler option.
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Approval Settings Card */}
          <Card className="border-2 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Approval Settings
              </CardTitle>
              <CardDescription>
                Choose who can authorize closing this escrow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${formData.multiApproval ? 'bg-purple-100' : 'bg-gray-200'}`}>
                    <Users className={`h-5 w-5 ${formData.multiApproval ? 'text-purple-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {formData.multiApproval ? 'Multi-Approval Required' : 'Single Approval'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formData.multiApproval 
                        ? `${additionalSigners.length + 1} signatures required to close` 
                        : 'Only you can close this escrow'
                      }
                    </p>
                  </div>
                </div>
                
                {/* Toggle Button */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.multiApproval}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, multiApproval: !prev.multiApproval }));
                    if (!formData.multiApproval && additionalSigners.length === 0) {
                      // Add one empty signer when enabling
                      setAdditionalSigners([{ walletAddress: '', displayName: '', role: 'Supervisor' }]);
                    }
                  }}
                  className={`
                    relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full 
                    border-2 border-transparent transition-colors duration-200 ease-in-out
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                    ${formData.multiApproval 
                      ? 'bg-purple-600 focus-visible:outline-purple-600' 
                      : 'bg-gray-300 focus-visible:outline-gray-400'
                    }
                  `}
                >
                  <span className="sr-only">Enable multi-approval</span>
                  <span
                    className={`
                      pointer-events-none inline-block h-6 w-6 transform rounded-full 
                      bg-white shadow-lg ring-0 transition duration-200 ease-in-out
                      ${formData.multiApproval ? 'translate-x-7' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              {/* Additional Signers */}
              {formData.multiApproval && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Additional Approvers</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAdditionalSigners([...additionalSigners, { walletAddress: '', displayName: '', role: 'Approver' }])}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Signer
                    </Button>
                  </div>

                  {/* Primary Officer (read-only) */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">You (Primary Officer)</span>
                    </div>
                    <p className="text-xs text-blue-700 font-mono truncate">
                      {address || 'Connect wallet to see address'}
                    </p>
                  </div>

                  {/* Additional Signers List */}
                  {additionalSigners.map((signer, index) => (
                    <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Signer {index + 2}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                          onClick={() => {
                            const updated = additionalSigners.filter((_, i) => i !== index);
                            setAdditionalSigners(updated);
                            if (updated.length === 0) {
                              setFormData(prev => ({ ...prev, multiApproval: false }));
                            }
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Coinbase Wallet Address *</Label>
                        <Input
                          placeholder="0x..."
                          value={signer.walletAddress}
                          onChange={(e) => {
                            const updated = [...additionalSigners];
                            updated[index].walletAddress = e.target.value;
                            setAdditionalSigners(updated);
                          }}
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          The wallet address they use to sign in
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Name (Optional)</Label>
                          <Input
                            placeholder="John Smith"
                            value={signer.displayName}
                            onChange={(e) => {
                              const updated = [...additionalSigners];
                              updated[index].displayName = e.target.value;
                              setAdditionalSigners(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Role</Label>
                          <select
                            className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm"
                            value={signer.role}
                            onChange={(e) => {
                              const updated = [...additionalSigners];
                              updated[index].role = e.target.value;
                              setAdditionalSigners(updated);
                            }}
                          >
                            <option value="Supervisor">Supervisor</option>
                            <option value="Manager">Manager</option>
                            <option value="Co-Officer">Co-Officer</option>
                            <option value="Compliance">Compliance</option>
                            <option value="Approver">Approver</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Info Box */}
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm text-purple-800 font-medium mb-1">🔐 Multi-Approval Security</p>
                    <p className="text-sm text-purple-700">
                      All {additionalSigners.length + 1} signers must approve before funds can be disbursed. 
                      Each signer must connect with their Coinbase Wallet to authorize the transaction.
                    </p>
                  </div>
                </div>
              )}

              {/* Single approval info */}
              {!formData.multiApproval && (
                <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-700">
                    With single approval, only you can close this escrow. 
                    Enable multi-approval if you need supervisor or compliance sign-off.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {/* ACTION BUTTONS - Mode-specific                                              */}
          {/* ══════════════════════════════════════════════════════════════════════════ */}

          {errors.submit && (
            <Alert variant="destructive">
              <AlertDescription>{errors.submit}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.push('/')}>
              Cancel
            </Button>
            
            {/* Manual Entry: Create Escrow */}
            {entryMode === 'manual' && (
              <Button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Escrow'
                )}
              </Button>
            )}
            
            {/* Qualia Import: Import & Create */}
            {entryMode === 'import' && (
              <Button 
                onClick={handleImport}
                disabled={!selectedFile || isUploading}
                className="bg-[#00b4d8] hover:bg-[#0096c7]"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import & Create Escrow
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'creating' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">Creating Your Escrow</h3>
                <p className="text-gray-600 mt-1">
                  Setting up your escrow account and generating wiring instructions...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'wiring' && wiringInstructions && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Escrow Created Successfully</CardTitle>
                <CardDescription>
                  Wiring instructions ready for {formData.buyerFirstName} {formData.buyerLastName}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Buyer Info Summary */}
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Buyer</p>
                <p className="font-medium">{formData.buyerFirstName} {formData.buyerLastName}</p>
                <p className="text-sm text-gray-600">{formData.buyerEmail}</p>
              </div>
              <Button 
                onClick={handleEmailToBuyer}
                disabled={isSendingEmail}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSendingEmail ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Email Instructions
              </Button>
            </div>

            {/* Interest Status Banner */}
            <div className={`rounded-lg p-4 flex items-center gap-3 ${formData.yieldEnabled ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
              {formData.yieldEnabled ? (
                <>
                  <div className="p-2 bg-green-100 rounded-full">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-800">Interest-Earning Enabled</p>
                    <p className="text-sm text-green-700">Buyer will earn interest while funds are in escrow. All interest returned at close.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 bg-blue-100 rounded-full">
                    <Shield className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-blue-800">Standard Hold</p>
                    <p className="text-sm text-blue-700">Funds held securely with no interest earned.</p>
                  </div>
                </>
              )}
            </div>

            {/* Wiring Instructions */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="font-medium text-slate-900 mb-3">Wire Transfer Instructions</h4>
              <div className="space-y-3">
                {[
                  { label: 'Bank Name', value: wiringInstructions.bankName, key: 'bankName' },
                  { label: 'Bank Address', value: wiringInstructions.bankAddress, key: 'bankAddress' },
                  { label: 'Routing Number (ABA)', value: wiringInstructions.routingNumber, key: 'routingNumber' },
                  { label: 'Account Number', value: wiringInstructions.accountNumber, key: 'accountNumber' },
                  { label: 'SWIFT Code', value: wiringInstructions.swiftCode, key: 'swiftCode' },
                  { label: 'Beneficiary Name', value: wiringInstructions.beneficiaryName, key: 'beneficiaryName' },
                  { label: 'Beneficiary Address', value: wiringInstructions.beneficiaryAddress, key: 'beneficiaryAddress' },
                  { label: 'Reference', value: wiringInstructions.reference, key: 'reference' },
                ].map(({ label, value, key }) => value && (
                  <div key={key} className="flex justify-between items-start gap-4">
                    <span className="text-sm text-slate-600">{label}:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-900">{value}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(value, key)}
                      >
                        {copied === key ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-slate-500" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-sm">
                <strong>Important:</strong> The reference number must be included in the wire transfer 
                memo field. Without it, funds cannot be automatically matched to this escrow.
              </AlertDescription>
            </Alert>

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={downloadPDF}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => router.push(`/escrow/${escrowId}`)}
              >
                View Escrow Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
