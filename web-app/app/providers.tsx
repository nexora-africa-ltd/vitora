'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, ReactNode, Suspense, lazy } from 'react';
import { AuthProvider } from '@/lib/auth/context';
import { Toaster } from '@/components/ui/toaster';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { DemoBanner, DemoWatermark } from '@/components/shared/demo-banner';

// Lazy load devtools only in development
const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools').then((mod) => ({
    default: mod.ReactQueryDevtools,
  }))
);

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root providers component
 * Wraps the app with necessary context providers:
 * - QueryClientProvider: React Query for data fetching
 * - ThemeProvider: next-themes for dark/light mode
 * - AuthProvider: JWT authentication state
 * - NavigationProgress: Top progress bar for route transitions
 * - Toaster: Toast notifications
 */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
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
          {/* Demo watermark - subtle indicator for screenshots */}
          <DemoWatermark />
        </AuthProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === 'development' && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
