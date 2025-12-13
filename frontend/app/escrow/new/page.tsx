'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ArrowLeft, Building2, Loader2, Copy, Download, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

export default function NewEscrowPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<FormStep>('details');
  const [formData, setFormData] = useState({
    propertyAddress: '',
    city: '',
    state: '',
    zipCode: '',
    purchasePrice: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wiringInstructions, setWiringInstructions] = useState<WiringInstructions | null>(null);
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
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
          purchasePrice,
          officerAddress: address,
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

  const downloadPDF = async () => {
    if (!escrowId) return;
    
    // Generate PDF on backend
    const response = await fetch(`/api/escrow/${escrowId}/wiring-pdf`);
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wiring-instructions-${escrowId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
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
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Escrow</h1>
          <p className="text-gray-600">Create a new property escrow</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {['Property Details', 'Creating Escrow', 'Wiring Instructions'].map((label, index) => {
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
              <span className={`text-sm ${isActive ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                {label}
              </span>
              {index < 2 && <div className="flex-1 h-px bg-gray-200" />}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {step === 'details' && (
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
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
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
              </div>

              {errors.submit && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.submit}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-3">
                <Link href="/">
                  <Button variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  Create Escrow
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
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
                  Share these wiring instructions with the buyer
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-3">Wire Transfer Instructions</h4>
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
                    <span className="text-sm text-blue-700">{label}:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-blue-900">{value}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(value, key)}
                      >
                        {copied === key ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-blue-600" />
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
              <Link href={`/escrow/${escrowId}`}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  View Escrow Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
