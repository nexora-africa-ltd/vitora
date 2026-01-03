/**
 * Hook-level tests for inpatient hooks using MSW (real axios client).
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  useInpatientWards,
  useBeds,
  useAdmissionRecommendations,
  useAdmissions,
  useCreateAdmissionRecommendation,
  useAcceptAdmissionRecommendation,
  useDeclineAdmissionRecommendation,
  useCreateAdmission,
  useUpdateBed,
  useUpdateAdmission,
} from '@/lib/hooks/use-inpatient';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
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

describe('Inpatient hooks (MSW)', () => {
  it('fetches inpatient wards', async () => {
    const { result } = renderHook(() => useInpatientWards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.length).toBeGreaterThan(0);
    expect(result.current.data?.[0]).toHaveProperty('ward_type');
  });

  it('fetches beds filtered by ward and status', async () => {
    const { result } = renderHook(
      () => useBeds({ ward: 1, status: 'AVAILABLE' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.every((b) => b.ward === 1 && b.status === 'AVAILABLE')).toBe(true);
  });

  it('fetches admission recommendations', async () => {
    const { result } = renderHook(
      () => useAdmissionRecommendations({ status: 'PENDING' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.results?.length).toBeGreaterThan(0);
  });

  it('accepts and declines recommendations via mutations', async () => {
    const wrapper = createWrapper();

    const { result: acceptResult } = renderHook(() => useAcceptAdmissionRecommendation(), { wrapper });
    await act(async () => {
      const updated = await acceptResult.current.mutateAsync({ id: 1, userId: 1 });
      expect(updated.status).toBe('ACCEPTED');
    });

    const { result: declineResult } = renderHook(() => useDeclineAdmissionRecommendation(), { wrapper });
    await act(async () => {
      const updated = await declineResult.current.mutateAsync({ id: 1, userId: 1, reason: 'No beds' });
      expect(updated.status).toBe('DECLINED');
    });
  });

  it('creates an admission recommendation', async () => {
    const { result } = renderHook(() => useCreateAdmissionRecommendation(), { wrapper: createWrapper() });

    await act(async () => {
      const created = await result.current.mutateAsync({
        encounter: 1,
        recommended_by: 1,
        reason: 'Needs observation',
        provisional_diagnosis: 'J18.9',
        provisional_diagnosis_text: 'Pneumonia',
        urgency: 'URGENT',
        preferred_ward_type: 'MEDICAL',
      });

      expect(created).toHaveProperty('id');
      expect(created.status).toBe('PENDING');
    });
  });

  it('lists admissions and creates an admission', async () => {
    const wrapper = createWrapper();

    const { result: listResult } = renderHook(
      () => useAdmissions({ admission_status: 'ACTIVE' }),
      { wrapper }
    );
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listResult.current.data?.results?.length).toBeGreaterThan(0);

    const { result: createResult } = renderHook(() => useCreateAdmission(), { wrapper });
    await act(async () => {
      const created = await createResult.current.mutateAsync({
        patient: 1,
        ward: 1,
        bed: 1,
        payer_type: 'CASH',
        admission_date: new Date().toISOString(),
        admitting_diagnosis: 'B50.0',
        admitting_diagnosis_text: 'Severe falciparum malaria',
        admitting_officer: 1,
      });

      expect(created).toHaveProperty('admission_number');
      expect(created.admission_status).toBe('ACTIVE');
    });
  });

  it('updates bed and admission', async () => {
    const wrapper = createWrapper();

    const { result: updateBed } = renderHook(() => useUpdateBed(), { wrapper });
    await act(async () => {
      const updated = await updateBed.current.mutateAsync({
        id: 1,
        data: { status: 'RESERVED', notes: 'Reserved for incoming patient' },
      });
      expect(updated.status).toBe('RESERVED');
    });

    const { result: updateAdmission } = renderHook(() => useUpdateAdmission(), { wrapper });
    await act(async () => {
      const updated = await updateAdmission.current.mutateAsync({
        id: 1,
        data: { payer_type: 'SHA' },
      });
      expect(updated.payer_type).toBe('SHA');
    });
  });
});
