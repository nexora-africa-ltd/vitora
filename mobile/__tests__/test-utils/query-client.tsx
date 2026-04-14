import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function TestQueryClientProvider({ children }: { children: ReactNode }) {
  const client = createTestQueryClient();

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
