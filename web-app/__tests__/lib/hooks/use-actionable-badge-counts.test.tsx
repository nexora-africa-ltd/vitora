// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Tests deferred and facility-gated actionable sidebar badge requests. */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useActionableBadgeCounts } from '@/lib/hooks/use-actionable-badge-counts';

jest.mock('@/lib/api/client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useActionableBadgeCounts', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('does not request actionable counts before deferred loading is enabled', () => {
    renderHook(() => useActionableBadgeCounts(false, {}), { wrapper: createWrapper() });

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('skips endpoints for disabled facility modules', async () => {
    mockGet.mockResolvedValue({ data: { total: 0 } });

    const { result } = renderHook(() => useActionableBadgeCounts(true, { pharmacy: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith('/api/pharmacy/alerts/severity-summary/', {
      params: { resolved: 'false' },
    });
    expect(mockGet).not.toHaveBeenCalledWith('/api/inventory/exceptions-summary/');
    expect(mockGet).not.toHaveBeenCalledWith('/api/inpatient/discharge-readiness-summary/');
  });
});
