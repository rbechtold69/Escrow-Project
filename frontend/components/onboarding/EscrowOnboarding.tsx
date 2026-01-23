'use client';

import { useState, useEffect } from 'react';
import { 
  Building2, 
  User, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Loader2, 
  Shield,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Briefcase,
  AlertCircle,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ============================================================================
// TYPES
// ============================================================================

type OnboardingStep = 'company' | 'officer' | 'submitting' | 'verification';

interface CompanyData {
  companyName: string;
  taxIdentificationNumber: string;
  businessEmail: string;
  website: string;
  streetLine1: string;
  streetLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface OfficerData {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
}

interface VerificationData {
  companyId: string;
  bridgeCustomerId: string;
  kycLink: string;
  tosLink: string;
  officerName: string;
  isDemo: boolean;
}

// ============================================================================
// US STATES
// ============================================================================

const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'DC', label: 'Washington D.C.' },
];

// ============================================================================
// OFFICER TITLES
// ============================================================================

const OFFICER_TITLES = [
  'Owner',
  'CEO',
  'President',
  'Director',
  'Managing Partner',
  'General Counsel',
  'Chief Compliance Officer',
  'Escrow Officer',
  'Branch Manager',
  'Vice President',
  'Secretary',
  'Treasurer',
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function EscrowOnboarding() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<OnboardingStep>('company');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Form data
  const [companyData, setCompanyData] = useState<CompanyData>({
    companyName: '',
    taxIdentificationNumber: '',
    businessEmail: '',
    website: '',
    streetLine1: '',
    streetLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'USA',
  });
  
  const [officerData, setOfficerData] = useState<OfficerData>({
    firstName: '',
    lastName: '',
    title: '',
    email: '',
  });
  
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  
  // Redirect countdown
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Auto-redirect countdown (only for real Bridge links, not demo)
  useEffect(() => {
    if (redirectCountdown !== null && redirectCountdown > 0) {
      const timer = setTimeout(() => setRedirectCountdown(redirectCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (redirectCountdown === 0 && verificationData?.tosLink && !verificationData.isDemo) {
      // Only auto-redirect for real Bridge links
      window.location.href = verificationData.tosLink;
    }
  }, [redirectCountdown, verificationData]);

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ══════════════════════════════════════════════════════════════════════════

  const validateCompanyStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!companyData.companyName.trim()) {
      newErrors.companyName = 'Company name is required';
    }
    
    // EIN validation (XX-XXXXXXX format)
    const einClean = companyData.taxIdentificationNumber.replace(/-/g, '');
    if (!einClean || !/^\d{9}$/.test(einClean)) {
      newErrors.taxIdentificationNumber = 'Enter a valid 9-digit EIN (e.g., 12-3456789)';
    }
    
    if (!companyData.businessEmail.trim()) {
      newErrors.businessEmail = 'Business email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyData.businessEmail)) {
      newErrors.businessEmail = 'Enter a valid email address';
    }
    
    if (!companyData.streetLine1.trim()) {
      newErrors.streetLine1 = 'Street address is required';
    }
    
    if (!companyData.city.trim()) {
      newErrors.city = 'City is required';
    }
    
    if (!companyData.state) {
      newErrors.state = 'State is required';
    }
    
    if (!companyData.postalCode.trim()) {
      newErrors.postalCode = 'ZIP code is required';
    } else if (!/^\d{5}(-\d{4})?$/.test(companyData.postalCode)) {
      newErrors.postalCode = 'Enter a valid ZIP code';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateOfficerStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!officerData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    
    if (!officerData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    
    if (!officerData.title) {
      newErrors.title = 'Title is required';
    }
    
    // Email is optional, but validate if provided
    if (officerData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(officerData.email)) {
      newErrors.email = 'Enter a valid email address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  const handleNextStep = () => {
    if (step === 'company' && validateCompanyStep()) {
      setStep('officer');
      setErrors({});
    } else if (step === 'officer' && validateOfficerStep()) {
      handleSubmit();
    }
  };

  const handlePreviousStep = () => {
    if (step === 'officer') {
      setStep('company');
      setErrors({});
    }
  };

  const handleSubmit = async () => {
    setStep('submitting');
    setSubmitError(null);
    
    try {
      const response = await fetch('/api/onboarding/escrow-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Company info
          companyName: companyData.companyName,
          taxIdentificationNumber: companyData.taxIdentificationNumber,
          businessEmail: companyData.businessEmail,
          website: companyData.website || undefined,
          streetLine1: companyData.streetLine1,
          streetLine2: companyData.streetLine2 || undefined,
          city: companyData.city,
          state: companyData.state,
          postalCode: companyData.postalCode,
          country: companyData.country,
          // Officer info
          officerFirstName: officerData.firstName,
          officerLastName: officerData.lastName,
          officerTitle: officerData.title,
          officerEmail: officerData.email || undefined,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit onboarding');
      }
      
      const data = await response.json();
      
      setVerificationData({
        companyId: data.companyId,
        bridgeCustomerId: data.bridgeCustomerId,
        kycLink: data.kycLink,
        tosLink: data.tosLink,
        officerName: `${officerData.firstName} ${officerData.lastName}`,
        isDemo: data.isDemo,
      });
      
      setStep('verification');
      setRedirectCountdown(10); // Start 10-second countdown
      
    } catch (error) {
      console.error('Onboarding error:', error);
      setSubmitError(error instanceof Error ? error.message : 'An error occurred');
      setStep('officer'); // Go back to allow retry
    }
  };

  const formatEIN = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return digits;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  if (!mounted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-96 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const stepIndex = ['company', 'officer', 'submitting', 'verification'].indexOf(step);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Escrow Company Registration
        </h1>
        <p className="text-gray-600 mt-2">
          Complete your company profile to start accepting escrow deposits
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2 py-4">
        {[
          { key: 'company', label: 'Company Info', icon: Building2 },
          { key: 'officer', label: 'Officer Info', icon: User },
          { key: 'verification', label: 'Verification', icon: Shield },
        ].map((s, index) => {
          const isActive = index === Math.min(stepIndex, 2);
          const isComplete = index < stepIndex;
          const Icon = s.icon;
          
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`
                flex items-center justify-center w-10 h-10 rounded-full transition-all
                ${isComplete ? 'bg-emerald-600 text-white' : ''}
                ${isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : ''}
                ${!isActive && !isComplete ? 'bg-gray-200 text-gray-500' : ''}
              `}>
                {isComplete ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span className={`text-sm hidden md:inline font-medium ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                {s.label}
              </span>
              {index < 2 && (
                <div className={`w-12 h-1 rounded ${index < stepIndex ? 'bg-emerald-500' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Company Information */}
      {step === 'company' && (
        <Card className="border-2">
          <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Building2 className="h-5 w-5 text-indigo-600" />
              </div>
              Company Information
            </CardTitle>
            <CardDescription>
              Enter your escrow company's legal business information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Company Name & EIN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyName" className="flex items-center gap-1">
                  Legal Company Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="companyName"
                  placeholder="Acme Escrow Services, LLC"
                  value={companyData.companyName}
                  onChange={(e) => setCompanyData(prev => ({ ...prev, companyName: e.target.value }))}
                  className={errors.companyName ? 'border-red-500' : ''}
                />
                {errors.companyName && (
                  <p className="text-sm text-red-500 mt-1">{errors.companyName}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="ein" className="flex items-center gap-1">
                  EIN (Tax ID) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="ein"
                  placeholder="12-3456789"
                  value={companyData.taxIdentificationNumber}
                  onChange={(e) => setCompanyData(prev => ({ 
                    ...prev, 
                    taxIdentificationNumber: formatEIN(e.target.value)
                  }))}
                  className={errors.taxIdentificationNumber ? 'border-red-500' : ''}
                />
                {errors.taxIdentificationNumber && (
                  <p className="text-sm text-red-500 mt-1">{errors.taxIdentificationNumber}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  <Shield className="h-3 w-3 inline mr-1" />
                  Sent securely to our compliance partner, not stored
                </p>
              </div>
            </div>

            {/* Email & Website */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="businessEmail" className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  Business Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="businessEmail"
                  type="email"
                  placeholder="contact@acmeescrow.com"
                  value={companyData.businessEmail}
                  onChange={(e) => setCompanyData(prev => ({ ...prev, businessEmail: e.target.value }))}
                  className={errors.businessEmail ? 'border-red-500' : ''}
                />
                {errors.businessEmail && (
                  <p className="text-sm text-red-500 mt-1">{errors.businessEmail}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="website" className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5 text-gray-400" />
                  Website
                </Label>
                <Input
                  id="website"
                  placeholder="https://acmeescrow.com"
                  value={companyData.website}
                  onChange={(e) => setCompanyData(prev => ({ ...prev, website: e.target.value }))}
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <Label className="flex items-center gap-1 text-sm font-medium">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                Business Address
              </Label>
              
              <div>
                <Label htmlFor="streetLine1" className="text-xs text-gray-500">
                  Street Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="streetLine1"
                  placeholder="123 Main Street, Suite 100"
                  value={companyData.streetLine1}
                  onChange={(e) => setCompanyData(prev => ({ ...prev, streetLine1: e.target.value }))}
                  className={errors.streetLine1 ? 'border-red-500' : ''}
                />
                {errors.streetLine1 && (
                  <p className="text-sm text-red-500 mt-1">{errors.streetLine1}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="streetLine2" className="text-xs text-gray-500">
                  Address Line 2
                </Label>
                <Input
                  id="streetLine2"
                  placeholder="Building B, Floor 2"
                  value={companyData.streetLine2}
                  onChange={(e) => setCompanyData(prev => ({ ...prev, streetLine2: e.target.value }))}
                />
              </div>
              
              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-3">
                  <Label htmlFor="city" className="text-xs text-gray-500">
                    City <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="city"
                    placeholder="Los Angeles"
                    value={companyData.city}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, city: e.target.value }))}
                    className={errors.city ? 'border-red-500' : ''}
                  />
                  {errors.city && (
                    <p className="text-sm text-red-500 mt-1">{errors.city}</p>
                  )}
                </div>
                
                <div className="col-span-1">
                  <Label htmlFor="state" className="text-xs text-gray-500">
                    State <span className="text-red-500">*</span>
                  </Label>
                  <Select 
                    value={companyData.state} 
                    onValueChange={(value) => setCompanyData(prev => ({ ...prev, state: value }))}
                  >
                    <SelectTrigger className={errors.state ? 'border-red-500' : ''}>
                      <SelectValue placeholder="CA" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map(state => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.state && (
                    <p className="text-sm text-red-500 mt-1">{errors.state}</p>
                  )}
                </div>
                
                <div className="col-span-2">
                  <Label htmlFor="postalCode" className="text-xs text-gray-500">
                    ZIP Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="postalCode"
                    placeholder="90210"
                    value={companyData.postalCode}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, postalCode: e.target.value }))}
                    className={errors.postalCode ? 'border-red-500' : ''}
                  />
                  {errors.postalCode && (
                    <p className="text-sm text-red-500 mt-1">{errors.postalCode}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleNextStep} className="bg-indigo-600 hover:bg-indigo-700">
                Continue to Officer Info
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Officer Information */}
      {step === 'officer' && (
        <Card className="border-2">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <User className="h-5 w-5 text-purple-600" />
              </div>
              Escrow Officer Information
            </CardTitle>
            <CardDescription>
              Enter the primary contact who will complete identity verification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {submitError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            {/* Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName" className="flex items-center gap-1">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={officerData.firstName}
                  onChange={(e) => setOfficerData(prev => ({ ...prev, firstName: e.target.value }))}
                  className={errors.firstName ? 'border-red-500' : ''}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-500 mt-1">{errors.firstName}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="lastName" className="flex items-center gap-1">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lastName"
                  placeholder="Smith"
                  value={officerData.lastName}
                  onChange={(e) => setOfficerData(prev => ({ ...prev, lastName: e.target.value }))}
                  className={errors.lastName ? 'border-red-500' : ''}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-500 mt-1">{errors.lastName}</p>
                )}
              </div>
            </div>

            {/* Title & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title" className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                  Title <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={officerData.title} 
                  onValueChange={(value) => setOfficerData(prev => ({ ...prev, title: value }))}
                >
                  <SelectTrigger className={errors.title ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select title..." />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICER_TITLES.map(title => (
                      <SelectItem key={title} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.title && (
                  <p className="text-sm text-red-500 mt-1">{errors.title}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="officerEmail" className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  Email (Optional)
                </Label>
                <Input
                  id="officerEmail"
                  type="email"
                  placeholder="john.smith@acmeescrow.com"
                  value={officerData.email}
                  onChange={(e) => setOfficerData(prev => ({ ...prev, email: e.target.value }))}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-sm text-red-500 mt-1">{errors.email}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Defaults to business email if not provided
                </p>
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Secure Identity Verification Required
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    After submitting, you'll be redirected to our secure verification partner 
                    to upload your photo ID. We never store your SSN or ID documents.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handlePreviousStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleNextStep} className="bg-purple-600 hover:bg-purple-700">
                Submit & Verify Identity
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submitting State */}
      {step === 'submitting' && (
        <Card className="border-2">
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-200 rounded-full animate-ping opacity-25" />
                <Loader2 className="h-16 w-16 animate-spin text-indigo-600" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-900">
                  Creating Your Company Profile
                </h3>
                <p className="text-gray-600 mt-2">
                  Setting up your account with our compliance partner...
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Shield className="h-4 w-4" />
                Secure connection established
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verification Step - Success & Redirect */}
      {step === 'verification' && verificationData && (
        <Card className="border-2 border-emerald-200">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              Company Profile Created!
            </CardTitle>
            <CardDescription>
              {verificationData.officerName}, {verificationData.isDemo 
                ? 'your demo company has been registered successfully!' 
                : 'please complete your secure identity verification'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {verificationData.isDemo ? (
              // ════════════════════════════════════════════════════════════════
              // DEMO MODE: Show success and let them proceed
              // ════════════════════════════════════════════════════════════════
              <>
                <Alert className="bg-emerald-50 border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertDescription className="text-emerald-800">
                    <strong>Demo Mode:</strong> Your escrow company has been registered! 
                    In production, you would complete identity verification through Bridge's 
                    secure portal before being approved.
                  </AlertDescription>
                </Alert>

                {/* Demo Success Animation */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-8 text-center">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-emerald-900 mb-2">
                    Registration Complete!
                  </h3>
                  <p className="text-emerald-700 mb-4">
                    Your company "{companyData.companyName}" is now registered.
                  </p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-full text-sm">
                    <Clock className="h-4 w-4" />
                    KYB Status: Pending Verification
                  </div>
                </div>

                {/* What Would Happen in Production */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">In Production:</h4>
                  <ol className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="bg-emerald-100 text-emerald-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">✓</span>
                      <span>You would be redirected to Bridge's secure KYC portal</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-gray-200 text-gray-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
                      <span>Upload your government-issued ID</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-gray-200 text-gray-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
                      <span>Complete a selfie verification</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-gray-200 text-gray-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
                      <span>Receive approval via webhook (typically 1-2 minutes)</span>
                    </li>
                  </ol>
                </div>

                {/* Demo CTA - Sign In */}
                <div className="flex flex-col items-center gap-4">
                  <p className="text-sm text-gray-600">
                    For demo purposes, you can now sign in and start creating escrows:
                  </p>
                  <a href="/" className="w-full">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Continue to Sign In
                    </Button>
                  </a>
                </div>
              </>
            ) : (
              // ════════════════════════════════════════════════════════════════
              // PRODUCTION MODE: Redirect to Bridge KYC
              // ════════════════════════════════════════════════════════════════
              <>
                {/* Redirect Countdown */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 text-center">
                  <p className="text-sm text-indigo-600 mb-2">
                    Redirecting to secure verification in...
                  </p>
                  <div className="text-5xl font-bold text-indigo-700 mb-4">
                    {redirectCountdown ?? 0}
                  </div>
                  <p className="text-sm text-indigo-600">
                    seconds
                  </p>
                </div>

                {/* Manual Links */}
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 text-center">
                    Or click below to proceed manually:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <a
                      href={verificationData.tosLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    >
                      <span className="font-medium text-gray-900">1. Accept Terms of Service</span>
                      <ExternalLink className="h-4 w-4 text-gray-500" />
                    </a>
                    
                    <a
                      href={verificationData.kycLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                    >
                      <span className="font-medium text-indigo-900">2. Verify Identity</span>
                      <ExternalLink className="h-4 w-4 text-indigo-500" />
                    </a>
                  </div>
                </div>

                {/* What to Expect */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">What to Expect:</h4>
                  <ol className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="bg-indigo-100 text-indigo-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
                      <span>Accept the Terms of Service agreement</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-indigo-100 text-indigo-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
                      <span>Take a photo of your government-issued ID</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-indigo-100 text-indigo-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
                      <span>Complete a quick selfie verification</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-emerald-100 text-emerald-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0">✓</span>
                      <span>Once approved, you can start creating escrows!</span>
                    </li>
                  </ol>
                </div>

                {/* Stop Redirect Button */}
                <div className="text-center">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setRedirectCountdown(null)}
                    className="text-gray-500"
                  >
                    Cancel auto-redirect
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
