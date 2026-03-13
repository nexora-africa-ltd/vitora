'use client';

import * as Sentry from "@sentry/nextjs";
// import Error from "next/error";
import { useEffect } from 'react';
import { VitoraLogo } from '@/components/ui/vitora-logo';

/**
 * Global Error Boundary
 * Catches errors in root layout (app/layout.tsx) and providers.
 * Must include own <html> and <body> tags since it replaces root layout.
 *
 * For regular page errors, see app/error.tsx
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
  console.error('Global error:', error);
  
  Sentry.captureException(error, {
    tags: {
      errorBoundary: 'global',
    },
    contexts: {
      errorInfo: {
        digest: error.digest,
      },
    },
  });
}, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          {/* Vitora Logo/Brand */}
          <div className="mb-6">
            <VitoraLogo
              tone="crimson"
              alt="Vitora HMIS"
              className="mx-auto w-40"
              priority
            />
          </div>

          {/* Error Message */}
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Application Error
          </h1>
          <p className="text-slate-600 mb-6">
            Something went wrong loading Vitora HMIS. This may be a temporary issue.
          </p>

          {/* Error Details (dev only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-6 p-3 bg-red-50 rounded-md text-left">
              <p className="text-sm font-mono text-red-700 break-all">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-xs text-red-500 mt-1">
                  Digest: {error.digest}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={reset}
              className="w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
            >
              Go to Home
            </button>
          </div>

          {/* Support Info */}
          <p className="mt-6 text-xs text-slate-400">
            If this problem persists, please contact IT support.
          </p>
        </div>
      </body>
    </html>
  );
}
