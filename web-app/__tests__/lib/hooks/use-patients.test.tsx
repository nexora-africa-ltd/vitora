/**
 * TDD Tests for Patient Hooks
 * Tests usePatients and usePatient hooks
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePatients, usePatient } from '@/lib/hooks/use-patients';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
};

describe('usePatients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch patients list', async () => {
    const mockPatients = {
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 1, mrn: 'MRN-001', first_name: 'John' },
        { id: 2, mrn: 'MRN-002', first_name: 'Jane' },
      ],
    };
    mockApiClient.get.mockResolvedValue({ data: mockPatients });

    const { result } = renderHook(() => usePatients(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(2);
  });

  it('should pass search parameter to API', async () => {
    mockApiClient.get.mockResolvedValue({
      data: { count: 0, results: [] },
    });

    const { result } = renderHook(
      () => usePatients({ search: 'john' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const url = mockApiClient.get.mock.calls[0]?.[0];
    expect(url).toContain('search=john');
  });

  it('should handle pagination parameters', async () => {
    mockApiClient.get.mockResolvedValue({
      data: { count: 100, results: [] },
    });

    renderHook(
      () => usePatients({ page: 2, limit: 25 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockApiClient.get).toHaveBeenCalled());

    const url = mockApiClient.get.mock.calls[0]?.[0];
    expect(url).toContain('page=2');
    expect(url).toContain('limit=25');
  });

  it('should handle API errors', async () => {
    const error = new Error('Network error');
    mockApiClient.get.mockRejectedValue(error);

    const { result } = renderHook(() => usePatients(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });
});

describe('usePatient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch a single patient by ID', async () => {
    const mockPatient = {
      id: 1,
      mrn: 'MRN-20251230-0001',
      first_name: 'John',
      last_name: 'Doe',
      date_of_birth: '1990-05-15',
      gender: 'M',
    };
    mockApiClient.get.mockResolvedValue({ data: mockPatient });

    const { result } = renderHook(() => usePatient(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.mrn).toBe('MRN-20251230-0001');
    expect(mockApiClient.get).toHaveBeenCalledWith('/api/patients/1/');
  });

  it('should not fetch when ID is not provided', () => {
    const { result } = renderHook(() => usePatient(''), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiClient.get).not.toHaveBeenCalled();
  });

  it('should accept string or number ID', async () => {
    mockApiClient.get.mockResolvedValue({ data: { id: 123 } });

    const { result } = renderHook(() => usePatient('123'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiClient.get).toHaveBeenCalledWith('/api/patients/123/');
  });
});
