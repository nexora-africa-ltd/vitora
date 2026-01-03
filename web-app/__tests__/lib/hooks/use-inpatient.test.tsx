/**
 * TDD Tests for Inpatient Hooks
 * Tests all inpatient hooks against MSW handlers
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useInpatientWards,
  useBeds,
  useWardBeds,
  useAdmissionRecommendations,
  useCreateAdmissionRecommendation,
  useAcceptAdmissionRecommendation,
  useDeclineAdmissionRecommendation,
  useAdmissions,
  useAdmission,
  useCreateAdmission,
  useUpdateAdmission,
  useUpdateBed,
} from '@/lib/hooks/use-inpatient';

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

describe('useInpatientWards', () => {
  it('should fetch wards list', async () => {
    const { result } = renderHook(() => useInpatientWards(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.[0].name).toBe('Medical Ward 1');
    expect(result.current.data?.[0].code).toBe('MED-01');
  });
});

describe('useBeds', () => {
  it('should fetch beds list', async () => {
    const { result } = renderHook(() => useBeds(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
    const beds = (result.current.data as any).results || result.current.data;
    expect(beds.length).toBeGreaterThan(0);
  });

  it('should filter beds by ward', async () => {
    const { result } = renderHook(() => useBeds({ ward: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const beds = (result.current.data as any).results || result.current.data;
    expect(beds.every((b: any) => b.ward === 1)).toBe(true);
  });

  it('should filter beds by status', async () => {
    const { result } = renderHook(() => useBeds({ status: 'AVAILABLE' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const beds = (result.current.data as any).results || result.current.data;
    expect(beds.every((b: any) => b.status === 'AVAILABLE')).toBe(true);
  });
});

describe('useWardBeds', () => {
  it('should fetch beds for a specific ward', async () => {
    const { result } = renderHook(() => useWardBeds(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as any;
    const beds = data.results || data;
    expect(beds.every((b: any) => b.ward === 1)).toBe(true);
  });

  it('should not fetch when wardId is undefined', () => {
    const { result } = renderHook(() => useWardBeds(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAdmissionRecommendations', () => {
  it('should fetch admission recommendations', async () => {
    const { result } = renderHook(() => useAdmissionRecommendations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toBeDefined();
    expect(result.current.data?.results.length).toBeGreaterThan(0);
  });

  it('should filter recommendations by status', async () => {
    const { result } = renderHook(
      () => useAdmissionRecommendations({ status: 'PENDING' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const recommendations = result.current.data?.results || [];
    expect(recommendations.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('should filter recommendations by urgency', async () => {
    const { result } = renderHook(
      () => useAdmissionRecommendations({ urgency: 'URGENT' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const recommendations = result.current.data?.results || [];
    expect(recommendations.every((r) => r.urgency === 'URGENT')).toBe(true);
  });
});

describe('useCreateAdmissionRecommendation', () => {
  it('should create a new admission recommendation', async () => {
    const { result } = renderHook(() => useCreateAdmissionRecommendation(), {
      wrapper: createWrapper(),
    });

    const newRecommendation = {
      encounter: 5,
      recommended_by: 1,
      reason: 'Test recommendation',
      provisional_diagnosis: 'A00.0',
      provisional_diagnosis_text: 'Test diagnosis',
      urgency: 'ROUTINE' as const,
      preferred_ward_type: 'MEDICAL' as const,
    };

    result.current.mutate(newRecommendation);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.status).toBe('PENDING');
  });
});

describe('useAcceptAdmissionRecommendation', () => {
  it('should accept a pending recommendation', async () => {
    const { result } = renderHook(() => useAcceptAdmissionRecommendation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: 1, userId: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('ACCEPTED');
  });
});

describe('useDeclineAdmissionRecommendation', () => {
  it('should decline a pending recommendation', async () => {
    const { result } = renderHook(() => useDeclineAdmissionRecommendation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: 1, userId: 1, reason: 'Patient declined' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('DECLINED');
  });
});

describe('useAdmissions', () => {
  it('should fetch admissions list', async () => {
    const { result } = renderHook(() => useAdmissions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toBeDefined();
    expect(result.current.data?.results.length).toBeGreaterThan(0);
  });

  it('should filter admissions by status', async () => {
    const { result } = renderHook(
      () => useAdmissions({ admission_status: 'ACTIVE' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const admissions = result.current.data?.results || [];
    expect(admissions.every((a) => a.admission_status === 'ACTIVE')).toBe(true);
  });

  it('should filter admissions by patient', async () => {
    const { result } = renderHook(() => useAdmissions({ patient: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const admissions = result.current.data?.results || [];
    expect(admissions.every((a) => a.patient === 1)).toBe(true);
  });

  it('should filter admissions by ward', async () => {
    const { result } = renderHook(() => useAdmissions({ ward: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const admissions = result.current.data?.results || [];
    expect(admissions.every((a) => a.ward === 1)).toBe(true);
  });
});

describe('useAdmission', () => {
  it('should fetch a single admission by ID', async () => {
    const { result } = renderHook(() => useAdmission(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.admission_number).toBe('ADM-20260103-0001');
    expect(result.current.data?.patient_name).toBe('John Doe');
  });

  it('should not fetch when admissionId is undefined', () => {
    const { result } = renderHook(() => useAdmission(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useCreateAdmission', () => {
  it('should create a new admission', async () => {
    const { result } = renderHook(() => useCreateAdmission(), {
      wrapper: createWrapper(),
    });

    const newAdmission = {
      patient: 3,
      ward: 1,
      bed: 1,
      admitting_officer: 1,
      admitting_diagnosis: 'B50.0',
      admitting_diagnosis_text: 'Severe malaria',
      payer_type: 'CASH' as const,
      admission_date: new Date().toISOString(),
    };

    result.current.mutate(newAdmission);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.admission_status).toBe('ACTIVE');
    expect(result.current.data?.admission_number).toContain('ADM-');
  });
});

describe('useUpdateAdmission', () => {
  it('should update an admission', async () => {
    const { result } = renderHook(() => useUpdateAdmission(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      id: 1,
      data: { admission_status: 'DISCHARGED' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.admission_status).toBe('DISCHARGED');
  });
});

describe('useUpdateBed', () => {
  it('should update a bed status', async () => {
    const { result } = renderHook(() => useUpdateBed(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      id: 1,
      data: { status: 'OCCUPIED', notes: 'Patient admitted' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('OCCUPIED');
  });
});
