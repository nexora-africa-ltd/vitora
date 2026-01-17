'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, ReactNode, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AuthProvider } from '@/lib/auth/context';
import { Toaster } from '@/components/ui/toaster';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { DemoBanner, DemoWatermark } from '@/components/shared/demo-banner';

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
      {isDev && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
