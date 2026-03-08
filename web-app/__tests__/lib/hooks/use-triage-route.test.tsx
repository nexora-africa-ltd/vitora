import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouteToClinic } from '@/lib/hooks/use-triage';
import { triageApi } from '@/lib/api/triage';

jest.mock('@/lib/api/triage', () => ({
  triageApi: {
    routeToClinic: jest.fn(),
  },
}));

const mockTriageApi = triageApi as jest.Mocked<typeof triageApi>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = 'TriageHookWrapper';
  return Wrapper;
};

describe('useRouteToClinic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates the consultation queue after routing to clinic', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockTriageApi.routeToClinic.mockResolvedValue({
      id: 1,
      queue_number: 4,
      clinic_name: 'Eye Clinic',
      patient_name: 'Jane Wanjiku',
      patient_mrn: 'MRN-20260309-0001',
    } as never);

    const { result } = renderHook(() => useRouteToClinic(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        assessmentId: 12,
        clinicId: 7,
        notes: 'Route to eye clinic',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['consultation-queue'] });

    invalidateQueriesSpy.mockRestore();
  });
});