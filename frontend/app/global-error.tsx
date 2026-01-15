'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '20px',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '12px 24px',
              backgroundColor: '#0a1a3a',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}





