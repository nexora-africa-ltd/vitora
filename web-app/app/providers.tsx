'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, ReactNode, Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AuthProvider } from '@/lib/auth/context';
import { Toaster } from '@/components/ui/toaster';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { DemoBanner, DemoWatermark } from '@/components/shared/demo-banner';
import { NewVersionToast } from '@/components/shared/new-version-toast';
import { PageRefreshProvider } from '@/lib/context/page-refresh-context';
import { createQueryClient } from '@/lib/query-client';
import { initChunkErrorHandler } from '@/lib/utils/chunk-error-handler';

// Only load devtools in development - use dynamic import to avoid build errors
const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then((mod) => mod.ReactQueryDevtools),
  { ssr: false }
);

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root providers component
 * Wraps the app with necessary context providers:
 * - QueryClientProvider: React Query for data fetching (with global error handling)
 * - ThemeProvider: next-themes for dark/light mode
 * - AuthProvider: JWT authentication state
 * - NavigationProgress: Top progress bar for route transitions
 * - Toaster: Toast notifications
 */
export function Providers({ children }: ProvidersProps) {
  // Use centralized createQueryClient for consistent config and global error handling
  const [queryClient] = useState(() => createQueryClient());

  // Initialize chunk error handler to recover from stale chunks after deployment
  useEffect(() => {
    initChunkErrorHandler();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PageRefreshProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            {/* Demo mode banner - shows in staging environment */}
            <DemoBanner />
            <Suspense fallback={null}>
              <NavigationProgress />
            </Suspense>
            {children}
            <Toaster />
            {/* New version notification toast */}
            <NewVersionToast />
            {/* Demo watermark - subtle indicator for screenshots */}
            <DemoWatermark />
          </AuthProvider>
        </ThemeProvider>
      </PageRefreshProvider>
      {isDev && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
