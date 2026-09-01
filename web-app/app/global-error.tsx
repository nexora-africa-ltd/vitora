'use client';

import * as Sentry from '@sentry/nextjs';
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
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
          {/* Vitora Logo/Brand */}
          <div className="mb-6">
            <VitoraLogo tone="crimson" alt="Vitora HMIS" className="mx-auto w-40" priority />
          </div>

          {/* Error Message */}
          <h1 className="mb-2 text-2xl font-bold text-slate-900">Application Error</h1>
          <p className="mb-6 text-slate-600">
            Something went wrong loading Vitora HMIS. This may be a temporary issue.
          </p>

          {/* Error Details (dev only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-6 rounded-md bg-red-50 p-3 text-left">
              <p className="break-all font-mono text-sm text-red-700">{error.message}</p>
              {error.digest && <p className="mt-1 text-xs text-red-500">Digest: {error.digest}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={reset}
              className="w-full rounded-md bg-teal-600 px-4 py-2 font-medium text-white transition-colors hover:bg-teal-700"
            >
              Try Again
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="w-full rounded-md bg-slate-100 px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-200"
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
