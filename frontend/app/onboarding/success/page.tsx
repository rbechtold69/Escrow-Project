'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight, Clock, Shield, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function OnboardingSuccessPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50/30 to-cyan-50/30">
      {/* Top Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-bold tracking-tight">
              <span className="text-[#0a1a3a]">Escrow</span>
              <span className="text-[#00b4d8]">Payi</span>
              <span className="text-[#00b4d8]">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-emerald-600 font-medium">Verification Complete</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-12">
        <Card className="border-2 border-emerald-200 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-t-lg text-center pb-8">
            {/* Success Icon */}
            <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl text-emerald-900">
              Registration Submitted Successfully!
            </CardTitle>
            <CardDescription className="text-emerald-700 text-base mt-2">
              Your escrow company registration is being processed
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6 pt-6">
            {/* Status Card */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-full">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900">Verification In Progress</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Bridge is reviewing your information. This typically takes 1-2 business days.
                  </p>
                </div>
              </div>
            </div>

            {/* What Happens Next */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">What happens next?</h4>
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-sm font-medium">✓</span>
                  <div>
                    <p className="font-medium text-gray-900">Terms of Service Accepted</p>
                    <p className="text-sm text-gray-500">You've agreed to the platform terms</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-sm font-medium">2</span>
                  <div>
                    <p className="font-medium text-gray-900">Identity Verification</p>
                    <p className="text-sm text-gray-500">If not completed, check your email for the verification link</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-medium">3</span>
                  <div>
                    <p className="font-medium text-gray-900">Approval Notification</p>
                    <p className="text-sm text-gray-500">You'll receive an email when your company is approved</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-medium">4</span>
                  <div>
                    <p className="font-medium text-gray-900">Start Creating Escrows</p>
                    <p className="text-sm text-gray-500">Once approved, you can sign in and create escrows</p>
                  </div>
                </li>
              </ol>
            </div>

            {/* Demo Mode Notice */}
            <Alert className="bg-blue-50 border-blue-200">
              <Building2 className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Demo Mode:</strong> For testing purposes, you can proceed to sign in 
                and explore the platform while your verification is "pending."
              </AlertDescription>
            </Alert>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 pt-4">
              <Link href="/" className="w-full">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base">
                  Continue to Sign In
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              <Link href="/onboarding" className="w-full">
                <Button variant="outline" className="w-full h-12 text-base">
                  Register Another Company
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Help Text */}
        <p className="text-center text-sm text-gray-500 mt-8">
          Questions? Contact us at{' '}
          <a href="mailto:support@escrowpayi.com" className="text-emerald-600 hover:underline">
            support@escrowpayi.com
          </a>
        </p>
      </main>
    </div>
  );
}
