'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { useState, ReactNode, Suspense } from 'react';
import { AuthProvider } from '@/lib/auth/context';
import { Toaster } from '@/components/ui/toaster';
import { RouteProgress } from '@/components/shared/route-progress';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root providers component
 * Wraps the app with necessary context providers:
 * - QueryClientProvider: React Query for data fetching
 * - ThemeProvider: next-themes for dark/light mode
 * - AuthProvider: JWT authentication state
 * - RouteProgress: Top progress bar for route transitions
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
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          {children}
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
