import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  nutritionKeys,
  useActivateDietPlan,
  useApproveNutritionConsultation,
  useAssignDietitian,
  useCancelNutritionConsultation,
  useCompleteDietPlan,
  useCompleteNutritionConsultation,
  useConsultationDietPlans,
  useCreateDietPlan,
  useCreateNutritionConsultation,
  useDeleteDietPlan,
  useDeleteNutritionConsultation,
  useDietPlan,
  useDietPlans,
  useDiscontinueDietPlan,
  useNutritionConsultation,
  useNutritionConsultationByNumber,
  useNutritionConsultations,
  usePutDietPlanOnHold,
  useSyncAnthropometrics,
  useUpdateDietPlan,
  useUpdateNutritionConsultation,
} from '@/lib/hooks/use-nutrition';
import { nutritionApi } from '@/lib/api/nutrition';

jest.mock('@/lib/api/nutrition', () => ({
  nutritionApi: {
    listConsultations: jest.fn(),
    getConsultation: jest.fn(),
    getConsultationByNumber: jest.fn(),
    createConsultation: jest.fn(),
    updateConsultation: jest.fn(),
    deleteConsultation: jest.fn(),
    approveConsultation: jest.fn(),
    assignDietitian: jest.fn(),
    syncAnthropometrics: jest.fn(),
    completeConsultation: jest.fn(),
    cancelConsultation: jest.fn(),
    listDietPlans: jest.fn(),
    getDietPlan: jest.fn(),
    getConsultationDietPlans: jest.fn(),
    createDietPlan: jest.fn(),
    updateDietPlan: jest.fn(),
    deleteDietPlan: jest.fn(),
    activateDietPlan: jest.fn(),
    discontinueDietPlan: jest.fn(),
    putDietPlanOnHold: jest.fn(),
    completeDietPlan: jest.fn(),
  },
}));

const mockNutritionApi = nutritionApi as jest.Mocked<typeof nutritionApi>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'NutritionHookWrapper';
  return { wrapper, invalidateQueries };
}

const mockConsultation = {
  id: 1,
  consultation_number: 'NUT-20260315-0001',
  patient: 1,
  patient_name: 'John Doe',
  patient_mrn: 'MRN-001',
  encounter_id: 100,
  consultation_type: 'INITIAL',
  consultation_date: '2026-03-15',
  reason: 'Weight management',
  status: 'PENDING',
  anthropometrics: null,
  bmi: null,
  bmi_classification: null,
  created_at: '2026-03-15T10:00:00Z',
  updated_at: '2026-03-15T10:00:00Z',
};

const mockDietPlan = {
  id: 2,
  consultation: 1,
  consultation_number: 'NUT-20260315-0001',
  patient: 1,
  patient_name: 'John Doe',
  patient_mrn: 'MRN-001',
  title: 'Calorie-controlled plan',
  plan_type: 'WEIGHT_MANAGEMENT',
  status: 'DRAFT',
  created_at: '2026-03-15T11:00:00Z',
  updated_at: '2026-03-15T11:00:00Z',
};

const mockPaginatedConsultations = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      consultation_number: 'NUT-20260315-0001',
      patient_name: 'John Doe',
      patient_mrn: 'MRN-001',
      consultation_type: 'INITIAL',
      status: 'PENDING',
      consultation_date: '2026-03-15',
    },
  ],
};

const mockPaginatedDietPlans = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 2,
      title: 'Calorie-controlled plan',
      patient_name: 'John Doe',
      patient_mrn: 'MRN-001',
      status: 'DRAFT',
      plan_type: 'WEIGHT_MANAGEMENT',
      consultation_number: 'NUT-20260315-0001',
      start_date: '2026-03-16',
    },
  ],
};

describe('nutritionKeys', () => {
  it('builds stable query keys', () => {
    expect(nutritionKeys.all).toEqual(['nutrition']);
    expect(nutritionKeys.consultations()).toEqual(['nutrition', 'consultations']);
    expect(nutritionKeys.consultation(1)).toEqual(['nutrition', 'consultations', 'detail', 1]);
    expect(nutritionKeys.consultationByNumber('NUT-1')).toEqual([
      'nutrition',
      'consultations',
      'by-number',
      'NUT-1',
    ]);
    expect(nutritionKeys.dietPlans()).toEqual(['nutrition', 'diet-plans']);
    expect(nutritionKeys.consultationDietPlans(1)).toEqual([
      'nutrition',
      'diet-plans',
      'consultation',
      1,
    ]);
  });
});

describe('nutrition query hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches consultation collections and details', async () => {
    mockNutritionApi.listConsultations.mockResolvedValueOnce(mockPaginatedConsultations as never);
    mockNutritionApi.getConsultation.mockResolvedValueOnce(mockConsultation as never);
    mockNutritionApi.getConsultationByNumber.mockResolvedValueOnce(mockConsultation as never);

    const list = renderHook(() => useNutritionConsultations({ status: 'PENDING' as never }), {
      wrapper: createWrapper().wrapper,
    });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(mockNutritionApi.listConsultations).toHaveBeenCalledWith({ status: 'PENDING' });

    const detail = renderHook(() => useNutritionConsultation(1), {
      wrapper: createWrapper().wrapper,
    });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    expect(mockNutritionApi.getConsultation).toHaveBeenCalledWith(1);

    const byNumber = renderHook(() => useNutritionConsultationByNumber('NUT-20260315-0001'), {
      wrapper: createWrapper().wrapper,
    });
    await waitFor(() => expect(byNumber.result.current.isSuccess).toBe(true));
    expect(mockNutritionApi.getConsultationByNumber).toHaveBeenCalledWith('NUT-20260315-0001');
  });

  it('does not fetch disabled consultation queries', () => {
    const undefinedDetail = renderHook(() => useNutritionConsultation(undefined), {
      wrapper: createWrapper().wrapper,
    });
    const undefinedNumber = renderHook(() => useNutritionConsultationByNumber(undefined), {
      wrapper: createWrapper().wrapper,
    });

    expect(undefinedDetail.result.current.isLoading).toBe(false);
    expect(undefinedNumber.result.current.isLoading).toBe(false);
    expect(mockNutritionApi.getConsultation).not.toHaveBeenCalled();
    expect(mockNutritionApi.getConsultationByNumber).not.toHaveBeenCalled();
  });

  it('fetches diet plans and consultation diet plans', async () => {
    mockNutritionApi.listDietPlans.mockResolvedValueOnce(mockPaginatedDietPlans as never);
    mockNutritionApi.getDietPlan.mockResolvedValueOnce(mockDietPlan as never);
    mockNutritionApi.getConsultationDietPlans.mockResolvedValueOnce([mockDietPlan] as never);

    const list = renderHook(() => useDietPlans({ status: 'DRAFT' as never }), {
      wrapper: createWrapper().wrapper,
    });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(mockNutritionApi.listDietPlans).toHaveBeenCalledWith({ status: 'DRAFT' });

    const detail = renderHook(() => useDietPlan(2), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    expect(mockNutritionApi.getDietPlan).toHaveBeenCalledWith(2);

    const consultationPlans = renderHook(() => useConsultationDietPlans(1), {
      wrapper: createWrapper().wrapper,
    });
    await waitFor(() => expect(consultationPlans.result.current.isSuccess).toBe(true));
    expect(mockNutritionApi.getConsultationDietPlans).toHaveBeenCalledWith(1);
  });
});

describe('nutrition mutation hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates consultation queries for create, update, lifecycle, and delete flows', async () => {
    const cases = [
      {
        useHook: useCreateNutritionConsultation,
        apiMock: mockNutritionApi.createConsultation,
        input: { patient_id: 1, encounter_id: 100, consultation_type: 'INITIAL', reason: 'Weight management' },
        resolved: mockConsultation,
        calledWith: [{ patient_id: 1, encounter_id: 100, consultation_type: 'INITIAL', reason: 'Weight management' }],
        keys: [nutritionKeys.consultations()],
      },
      {
        useHook: useUpdateNutritionConsultation,
        apiMock: mockNutritionApi.updateConsultation,
        input: { id: 1, data: { reason: 'Updated reason' } },
        resolved: mockConsultation,
        calledWith: [1, { reason: 'Updated reason' }],
        keys: [nutritionKeys.consultation(1), nutritionKeys.consultations()],
      },
      {
        useHook: useDeleteNutritionConsultation,
        apiMock: mockNutritionApi.deleteConsultation,
        input: 1,
        resolved: undefined,
        calledWith: [1],
        keys: [nutritionKeys.consultations()],
      },
      {
        useHook: useApproveNutritionConsultation,
        apiMock: mockNutritionApi.approveConsultation,
        input: 1,
        resolved: { ...mockConsultation, status: 'APPROVED' },
        calledWith: [1],
        keys: [nutritionKeys.consultation(1), nutritionKeys.consultations()],
      },
      {
        useHook: useAssignDietitian,
        apiMock: mockNutritionApi.assignDietitian,
        input: { id: 1, dietitianId: 5 },
        resolved: mockConsultation,
        calledWith: [1, 5],
        keys: [nutritionKeys.consultation(1), nutritionKeys.consultations()],
      },
      {
        useHook: useSyncAnthropometrics,
        apiMock: mockNutritionApi.syncAnthropometrics,
        input: 1,
        resolved: { ...mockConsultation, bmi: 24.5 },
        calledWith: [1],
        keys: [nutritionKeys.consultation(1)],
      },
      {
        useHook: useCompleteNutritionConsultation,
        apiMock: mockNutritionApi.completeConsultation,
        input: 1,
        resolved: { ...mockConsultation, status: 'COMPLETED' },
        calledWith: [1],
        keys: [nutritionKeys.consultation(1), nutritionKeys.consultations()],
      },
      {
        useHook: useCancelNutritionConsultation,
        apiMock: mockNutritionApi.cancelConsultation,
        input: { id: 1, reason: 'Patient unavailable' },
        resolved: { ...mockConsultation, status: 'CANCELLED' },
        calledWith: [1, 'Patient unavailable'],
        keys: [nutritionKeys.consultation(1), nutritionKeys.consultations()],
      },
    ];

    for (const testCase of cases) {
      testCase.apiMock.mockResolvedValueOnce(testCase.resolved as never);
      const ctx = createWrapper();
      const { result } = renderHook(() => testCase.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(testCase.input as never);
      });
      expect(testCase.apiMock).toHaveBeenCalledWith(...(testCase.calledWith as []));
      for (const key of testCase.keys) {
        expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key });
      }
    }
  });

  it('invalidates diet plan queries for create, update, and status transitions', async () => {
    const cases = [
      {
        useHook: useCreateDietPlan,
        apiMock: mockNutritionApi.createDietPlan,
        input: { consultation: 1, title: 'Plan', plan_type: 'WEIGHT_MANAGEMENT' },
        resolved: mockDietPlan,
        calledWith: [{ consultation: 1, title: 'Plan', plan_type: 'WEIGHT_MANAGEMENT' }],
        keys: [nutritionKeys.dietPlans(), nutritionKeys.consultationDietPlans(1)],
      },
      {
        useHook: useUpdateDietPlan,
        apiMock: mockNutritionApi.updateDietPlan,
        input: { id: 2, data: { title: 'Updated plan' } },
        resolved: mockDietPlan,
        calledWith: [2, { title: 'Updated plan' }],
        keys: [nutritionKeys.dietPlan(2), nutritionKeys.dietPlans()],
      },
      {
        useHook: useDeleteDietPlan,
        apiMock: mockNutritionApi.deleteDietPlan,
        input: 2,
        resolved: undefined,
        calledWith: [2],
        keys: [nutritionKeys.dietPlans()],
      },
      {
        useHook: useActivateDietPlan,
        apiMock: mockNutritionApi.activateDietPlan,
        input: 2,
        resolved: { ...mockDietPlan, status: 'ACTIVE' },
        calledWith: [2],
        keys: [nutritionKeys.dietPlan(2), nutritionKeys.dietPlans()],
      },
      {
        useHook: useDiscontinueDietPlan,
        apiMock: mockNutritionApi.discontinueDietPlan,
        input: { id: 2, reason: 'No longer needed' },
        resolved: { ...mockDietPlan, status: 'DISCONTINUED' },
        calledWith: [2, 'No longer needed'],
        keys: [nutritionKeys.dietPlan(2), nutritionKeys.dietPlans()],
      },
      {
        useHook: usePutDietPlanOnHold,
        apiMock: mockNutritionApi.putDietPlanOnHold,
        input: { id: 2, reason: 'Awaiting labs' },
        resolved: { ...mockDietPlan, status: 'ON_HOLD' },
        calledWith: [2, 'Awaiting labs'],
        keys: [nutritionKeys.dietPlan(2), nutritionKeys.dietPlans()],
      },
      {
        useHook: useCompleteDietPlan,
        apiMock: mockNutritionApi.completeDietPlan,
        input: 2,
        resolved: { ...mockDietPlan, status: 'COMPLETED' },
        calledWith: [2],
        keys: [nutritionKeys.dietPlan(2), nutritionKeys.dietPlans()],
      },
    ];

    for (const testCase of cases) {
      testCase.apiMock.mockResolvedValueOnce(testCase.resolved as never);
      const ctx = createWrapper();
      const { result } = renderHook(() => testCase.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(testCase.input as never);
      });
      expect(testCase.apiMock).toHaveBeenCalledWith(...(testCase.calledWith as []));
      for (const key of testCase.keys) {
        expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key });
      }
    }
  });
});
