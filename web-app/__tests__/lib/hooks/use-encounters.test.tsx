/**
 * TDD Tests for Encounter Hooks
 * Tests useEncounters, useEncounter, and mutation hooks
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useEncounters,
  useEncounter,
  useEncounterDiagnoses,
  useEncounterTreatmentPlan,
  useCreateEncounter,
  useUpdateEncounter,
} from '@/lib/hooks/use-encounters';
import { encountersApi } from '@/lib/api/encounters';

jest.mock('@/lib/api/encounters');

const mockEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;

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
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
};

describe('useEncounters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch encounters list', async () => {
    const mockData = {
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 1, encounter_type: 'OPD', chief_complaint: 'Headache' },
        { id: 2, encounter_type: 'EMERGENCY', chief_complaint: 'Chest pain' },
      ],
    };
    mockEncountersApi.list.mockResolvedValue(mockData as any);

    const { result } = renderHook(() => useEncounters(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(2);
  });

  it('should pass params to API', async () => {
    mockEncountersApi.list.mockResolvedValue({ count: 0, results: [], next: null, previous: null });

    renderHook(
      () => useEncounters({ patient: 123, status: 'CLOSED' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockEncountersApi.list).toHaveBeenCalled());

    expect(mockEncountersApi.list).toHaveBeenCalledWith({ patient: 123, status: 'CLOSED' });
  });
});

describe('useEncounter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch a single encounter', async () => {
    const mockEncounter = { id: 1, encounter_type: 'OPD', chief_complaint: 'Headache' };
    mockEncountersApi.get.mockResolvedValue(mockEncounter as any);

    const { result } = renderHook(() => useEncounter(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe(1);
  });

  it('should not fetch when ID is 0', () => {
    const { result } = renderHook(() => useEncounter(0), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockEncountersApi.get).not.toHaveBeenCalled();
  });
});

describe('useEncounterDiagnoses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch diagnoses for encounter', async () => {
    const mockDiagnoses = [{ id: 1, icd10_code: 'J06.9' }];
    mockEncountersApi.getDiagnoses.mockResolvedValue(mockDiagnoses as any);

    const { result } = renderHook(() => useEncounterDiagnoses(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockDiagnoses);
  });
});

describe('useEncounterTreatmentPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch treatment plan for encounter', async () => {
    const mockPlan = { id: 1, plan_text: 'Rest and fluids' };
    mockEncountersApi.getTreatmentPlan.mockResolvedValue(mockPlan as any);

    const { result } = renderHook(() => useEncounterTreatmentPlan(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockPlan);
  });

  it('should handle null treatment plan', async () => {
    mockEncountersApi.getTreatmentPlan.mockResolvedValue(null);

    const { result } = renderHook(() => useEncounterTreatmentPlan(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });
});

describe('useCreateEncounter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create an encounter', async () => {
    const newEncounter = { patient: 1, encounter_type: 'OPD' as const, chief_complaint: 'Fever' };
    const createdEncounter = { id: 1, ...newEncounter };
    mockEncountersApi.create.mockResolvedValue(createdEncounter as any);

    const { result } = renderHook(() => useCreateEncounter(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(newEncounter as any);
    });

    expect(mockEncountersApi.create).toHaveBeenCalledWith(newEncounter);
  });
});

describe('useUpdateEncounter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update an encounter', async () => {
    const updateData = { chief_complaint: 'Updated complaint' };
    const updatedEncounter = { id: 1, ...updateData };
    mockEncountersApi.update.mockResolvedValue(updatedEncounter as any);

    const { result } = renderHook(() => useUpdateEncounter(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, data: updateData });
    });

    expect(mockEncountersApi.update).toHaveBeenCalledWith(1, updateData);
  });
});
