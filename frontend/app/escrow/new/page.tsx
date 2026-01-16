'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ArrowLeft, Building2, Loader2, Copy, Download, CheckCircle2, Mail, User, TrendingUp, Shield } from 'lucide-react';
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

export default function NewEscrowPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  
  const [mounted, setMounted] = useState(false);
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
  });
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

          {/* Yield Preference Card */}
          <Card className="border-2 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Buyer's Yield Preference
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
                    <p className="font-medium text-gray-900">
                      {formData.yieldEnabled ? 'Earn Yield (USDB)' : 'Standard Hold (USDC)'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formData.yieldEnabled 
                        ? 'Funds earn ~4-5% APY while in escrow' 
                        : 'Funds held as stable USDC, no yield'
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
                  <span className="sr-only">Enable yield earning</span>
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
                    <p className="text-sm text-green-800 font-medium mb-1">💰 Yield-Earning Enabled</p>
                    <p className="text-sm text-green-700">
                      Funds will be converted to USDB, a yield-earning stablecoin backed 1:1 by USD.
                      <strong> All yield earned will be returned to the buyer at escrow close.</strong> 
                      Neither you nor EscrowPayi keeps any of it.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-blue-800 font-medium mb-1">🛡️ Standard Hold</p>
                    <p className="text-sm text-blue-700">
                      Funds will be converted to USDC, a standard stablecoin backed 1:1 by USD.
                      No yield is earned, but some buyers prefer the familiarity of USDC.
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {errors.submit && (
            <Alert variant="destructive">
              <AlertDescription>{errors.submit}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.push('/')}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Create Escrow
            </Button>
          </div>
        </form>
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

            {/* Yield Status Banner */}
            <div className={`rounded-lg p-4 flex items-center gap-3 ${formData.yieldEnabled ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
              {formData.yieldEnabled ? (
                <>
                  <div className="p-2 bg-green-100 rounded-full">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-800">Yield-Earning Enabled (USDB)</p>
                    <p className="text-sm text-green-700">Buyer will earn interest while funds are in escrow. All yield returned at close.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 bg-blue-100 rounded-full">
                    <Shield className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-blue-800">Standard Hold (USDC)</p>
                    <p className="text-sm text-blue-700">Funds held securely with no yield earned.</p>
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
