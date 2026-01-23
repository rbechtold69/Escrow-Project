'use client';

import { Suspense } from 'react';
import EscrowOnboarding from '@/components/onboarding/EscrowOnboarding';
import { ArrowLeft, Shield, Building2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function OnboardingPageContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30">
      {/* Top Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-emerald-600 font-medium">Secure Registration</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mb-8 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-500" />
            <span>SOC 2 Compliant</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-500" />
            <span>Bank-Grade Security</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            <span>5-Minute Setup</span>
          </div>
        </div>

        {/* Onboarding Form */}
        <EscrowOnboarding />

        {/* Footer Info */}
        <div className="mt-12 text-center text-sm text-gray-500 max-w-lg mx-auto">
          <p>
            By registering, you agree to our{' '}
            <a href="#" className="text-indigo-600 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-indigo-600 hover:underline">Privacy Policy</a>.
          </p>
          <p className="mt-4">
            Your sensitive information (EIN, SSN, ID documents) is securely transmitted to our 
            compliance partner and never stored on our servers.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    }>
      <OnboardingPageContent />
    </Suspense>
  );
}
