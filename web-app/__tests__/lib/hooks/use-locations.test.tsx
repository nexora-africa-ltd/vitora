import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCounties, useSubCounties, useWards } from '@/lib/hooks/use-locations';
import { locationsApi } from '@/lib/api/locations';
import React from 'react';

jest.mock('@/lib/api/locations');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
};

describe('useCounties', () => {
  it('should fetch Kenya counties', async () => {
    const mockCounties = [{ id: 1, code: 1, name: 'Mombasa' }];
    (locationsApi.getCounties as jest.Mock).mockResolvedValue(mockCounties);

    const { result } = renderHook(() => useCounties(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCounties);
  });
});

describe('useSubCounties', () => {
  it('should fetch sub-counties when county provided', async () => {
    const mockSubCounties = [{ id: 1, county: 1, name: 'Mvita' }];
    (locationsApi.getSubCounties as jest.Mock).mockResolvedValue(mockSubCounties);

    const { result } = renderHook(() => useSubCounties(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(locationsApi.getSubCounties).toHaveBeenCalledWith(1);
  });

  it('should not fetch when county is undefined', () => {
    const { result } = renderHook(() => useSubCounties(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useWards', () => {
  it('should fetch wards when sub-county provided', async () => {
    const mockWards = [{ id: 1, sub_county: 1, name: 'Tudor' }];
    (locationsApi.getWards as jest.Mock).mockResolvedValue(mockWards);

    const { result } = renderHook(() => useWards(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(locationsApi.getWards).toHaveBeenCalledWith(1);
  });
});
