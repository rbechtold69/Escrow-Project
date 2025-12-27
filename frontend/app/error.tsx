'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="p-4 bg-red-100 rounded-full mb-6">
        <AlertTriangle className="h-12 w-12 text-red-600" />
      </div>
      
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">
        Something went wrong
      </h2>
      
      <p className="text-gray-600 mb-6 max-w-md">
        We encountered an unexpected error. This may be a temporary issue.
      </p>
      
      <div className="flex gap-4">
        <Button onClick={reset} className="bg-[#0a1a3a] hover:bg-[#0d2347]">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/'}>
          Go Home
        </Button>
      </div>
      
      {process.env.NODE_ENV === 'development' && error.message && (
        <div className="mt-8 p-4 bg-gray-100 rounded-lg text-left max-w-2xl overflow-auto">
          <p className="text-sm font-mono text-gray-700 whitespace-pre-wrap">
            {error.message}
          </p>
        </div>
      )}
    </div>
  );
}

