'use client';

import { useState, useEffect } from 'react';

export function DemoBanner() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only show in development or if demo mode is explicitly enabled
  const isDemoMode = typeof window !== 'undefined' && (
    process.env.NODE_ENV === 'development' || 
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  );

  if (!mounted || !isDemoMode) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-[#0a1a3a] to-[#00b4d8] text-white text-center py-2 px-4 text-sm">
      <span className="font-medium">🧪 Demo Environment</span>
      <span className="mx-2">•</span>
      <span className="text-cyan-200">
        This is a test environment. No real money is being moved.
      </span>
    </div>
  );
}



