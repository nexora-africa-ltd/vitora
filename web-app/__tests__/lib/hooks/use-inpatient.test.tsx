/**
 * TDD Tests for Inpatient Hooks
 * Tests all inpatient hooks with mocked inpatientApi
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  inpatientQueryKeys,
  useInpatientWards,
  useInpatientWard,
  useUpdateWard,
  useGenerateWardBeds,
  useBeds,
  useWardBeds,
  useCheckWardCompatibility,
  useBulkCompatibilityCheck,
  useAdmissionRecommendations,
  useAdmissionRecommendation,
  useCreateAdmissionRecommendation,
  useAcceptAdmissionRecommendation,
  useDeclineAdmissionRecommendation,
  useAdmissions,
  useAdmission,
  useCreateAdmission,
  useUpdateAdmission,
  useUpdateBed,
  useDischarges,
  useDischarge,
  useCreateDischarge,
  useUpdateDischarge,
  useTransfers,
  useTransfer,
  useCreateTransfer,
  useWardRounds,
  useWardRound,
  useAdmissionWardRounds,
  useCreateWardRound,
  useUpdateWardRound,
  useReviewRequests,
  useReviewRequest,
  useAdmissionReviewRequests,
  usePendingReviewRequests,
  useCreateReviewRequest,
  useAcknowledgeReviewRequest,
  useCompleteReviewRequest,
  useCancelReviewRequest,
  useKardexList,
  useKardex,
  useKardexByAdmission,
  useUpdateKardex,
  useAddKardexShiftNote,
  useAddKardexHandoverNote,
  useAddCarePlanEntry,
  useUpdateCarePlanEntry,
  useShiftHandovers,
  useShiftHandover,
  useCreateShiftHandover,
  useAcknowledgeShiftHandover,
  useAutoPopulateShiftHandover,
  useAdmissionOrders,
  useAdmissionLabOrders,
  useAdmissionImagingOrders,
  useAdmissionPrescriptions,
  useAdmissionConsumableUsage,
  useRecordAdmissionConsumableUsage,
  useReverseAdmissionConsumableUsage,
  useTemperatureReadings,
  useCreateTemperatureReading,
  useFluidBalanceSheets,
  useFluidBalanceEntries,
  useCreateFluidBalanceSheet,
  useUpdateFluidBalanceSheet,
  useCreateFluidBalanceEntry,
  useBloodTransfusions,
  useBloodTransfusion,
  useCreateBloodTransfusion,
  useAddTransfusionObservation,
  useMarkTransfusionReaction,
  useCompleteTransfusion,
  useBPReadings,
  useCreateBPReading,
} from '@/lib/hooks/use-inpatient';
import { inpatientApi } from '@/lib/api/inpatient';

// Mock the inpatient API module (not apiClient) to avoid Zod validation in tests
jest.mock('@/lib/api/inpatient');
const mockInpatientApi = inpatientApi as jest.Mocked<typeof inpatientApi>;

// Mock data
const mockWards = [
  { id: 1, name: 'Medical Ward 1', code: 'MED-01', ward_type: 'MEDICAL', capacity: 20, available_beds: 5 },
  { id: 2, name: 'Surgical Ward 1', code: 'SUR-01', ward_type: 'SURGICAL', capacity: 15, available_beds: 3 },
];

const mockBeds = [
  { id: 1, ward: 1, ward_name: 'Medical Ward 1', bed_number: 'M-01', status: 'AVAILABLE' },
  { id: 2, ward: 1, ward_name: 'Medical Ward 1', bed_number: 'M-02', status: 'OCCUPIED' },
  { id: 3, ward: 2, ward_name: 'Surgical Ward 1', bed_number: 'S-01', status: 'AVAILABLE' },
];

const mockRecommendations = [
  { id: 1, encounter: 1, urgency: 'URGENT', status: 'PENDING', reason: 'Severe malaria' },
  { id: 2, encounter: 2, urgency: 'EMERGENCY', status: 'PENDING', reason: 'Chest pain' },
  { id: 3, encounter: 3, urgency: 'ROUTINE', status: 'ACCEPTED', reason: 'Post-op monitoring' },
];

const mockAdmissions = [
  { id: 1, admission_number: 'ADM-20260103-0001', patient: 1, patient_name: 'John Doe', ward: 1, admission_status: 'ACTIVE' },
  { id: 2, admission_number: 'ADM-20260102-0001', patient: 2, patient_name: 'Mary Wanjiku', ward: 2, admission_status: 'ACTIVE' },
];

const mockTransfer = {
  id: 1,
  admission: 1,
  from_ward: 1,
  to_ward: 2,
  status: 'COMPLETED',
};

const mockWardRound = {
  id: 1,
  admission: 1,
  notes: 'Stable progress',
};

const mockReviewRequest = {
  id: 1,
  admission: 1,
  status: 'PENDING',
  reason: 'Consult physician review',
};

const mockKardex = {
  id: 1,
  admission: 1,
  shift_notes: [],
  handover_notes: [],
  care_plan_entries: [],
};

const mockShiftHandover = {
  id: 1,
  admission: 1,
  status: 'PENDING',
};

const mockConsumableUsage = {
  id: 1,
  admission: 1,
  stock_batch: 9,
  quantity: 2,
};

const mockTemperatureReading = {
  id: 1,
  admission: 1,
  temperature_celsius: 37.5,
};

const mockFluidBalanceSheet = {
  id: 1,
  admission: 1,
  chart_date: '2026-03-15',
};

const mockFluidBalanceEntry = {
  id: 1,
  fluid_balance_sheet: 1,
  entry_type: 'INPUT',
  amount_ml: 500,
};

const mockBloodTransfusion = {
  id: 1,
  admission: 1,
  status: 'IN_PROGRESS',
};

const mockBPReading = {
  id: 1,
  admission: 1,
  systolic: 120,
  diastolic: 80,
};

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch wards list', async () => {
    mockInpatientApi.listWards.mockResolvedValue({
      count: mockWards.length,
      next: null,
      previous: null,
      results: mockWards,
    });

    const { result } = renderHook(() => useInpatientWards(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Data could be paginated or array
    const data = result.current.data as any;
    const wards = Array.isArray(data) ? data : data?.results ?? [];
    expect(wards).toHaveLength(2);
    expect(wards[0].name).toBe('Medical Ward 1');
    expect(mockInpatientApi.listWards).toHaveBeenCalled();
  });

  it('should fetch a single ward by id', async () => {
    mockInpatientApi.getWard.mockResolvedValue(mockWards[0] as any);

    const { result } = renderHook(() => useInpatientWard(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.code).toBe('MED-01');
    expect(mockInpatientApi.getWard).toHaveBeenCalledWith(1);
  });

  it('should not fetch ward details when wardId is undefined', () => {
    const { result } = renderHook(() => useInpatientWard(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockInpatientApi.getWard).not.toHaveBeenCalled();
  });
});

describe('ward management mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update a ward and invalidate ward caches', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockInpatientApi.updateWard.mockResolvedValue({
      ...mockWards[0],
      available_beds: 6,
    } as any);

    const { result } = renderHook(() => useUpdateWard(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 1,
        data: { available_beds: 6 },
      });
    });

    expect(mockInpatientApi.updateWard).toHaveBeenCalledWith(1, { available_beds: 6 });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'wards', 1] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'wards'] });
    invalidateQueriesSpy.mockRestore();
  });

  it('should generate ward beds and invalidate bed caches', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockInpatientApi.generateWardBeds.mockResolvedValue({
      created: 5,
      total: 20,
      capacity: 20,
      message: 'Generated 5 bed(s)',
    } as any);

    const { result } = renderHook(() => useGenerateWardBeds(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(mockInpatientApi.generateWardBeds).toHaveBeenCalledWith(1);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'wards', 1] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'wards', 1, 'beds', undefined] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'beds', undefined] });
    invalidateQueriesSpy.mockRestore();
  });
});

describe('useBeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch beds list', async () => {
    mockInpatientApi.listBeds.mockResolvedValue({
      count: mockBeds.length,
      next: null,
      previous: null,
      results: mockBeds,
    });

    // useBeds requires a ward parameter to be enabled
    const { result } = renderHook(() => useBeds({ ward: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const beds = (result.current.data as any)?.results || result.current.data;
    expect(beds.length).toBeGreaterThan(0);
  });

  it('should filter beds by ward', async () => {
    const ward1Beds = mockBeds.filter((b) => b.ward === 1);
    mockInpatientApi.listBeds.mockResolvedValue({
      count: ward1Beds.length,
      next: null,
      previous: null,
      results: ward1Beds,
    });

    const { result } = renderHook(() => useBeds({ ward: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const beds = (result.current.data as any)?.results || result.current.data;
    expect(beds.every((b: any) => b.ward === 1)).toBe(true);
  });

  it('should filter beds by status', async () => {
    const availableBeds = mockBeds.filter((b) => b.status === 'AVAILABLE');
    mockInpatientApi.listBeds.mockResolvedValue({
      count: availableBeds.length,
      next: null,
      previous: null,
      results: availableBeds,
    });

    // useBeds requires a ward parameter to be enabled
    const { result } = renderHook(() => useBeds({ ward: 1, status: 'AVAILABLE' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const beds = (result.current.data as any)?.results || result.current.data;
    expect(beds.every((b: any) => b.status === 'AVAILABLE')).toBe(true);
  });
});

describe('useWardBeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch beds for a specific ward', async () => {
    const ward1Beds = mockBeds.filter((b) => b.ward === 1);
    mockInpatientApi.listWardBeds.mockResolvedValue({
      count: ward1Beds.length,
      next: null,
      previous: null,
      results: ward1Beds,
    });

    const { result } = renderHook(() => useWardBeds(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as any;
    const beds = data?.results || data;
    expect(beds.every((b: any) => b.ward === 1)).toBe(true);
  });

  it('should not fetch when wardId is undefined', () => {
    const { result } = renderHook(() => useWardBeds(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('ward compatibility checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should check a single patient against a ward', async () => {
    mockInpatientApi.checkWardCompatibility.mockResolvedValue({
      compatible: true,
      reasons: [],
    } as any);

    const { result } = renderHook(() => useCheckWardCompatibility(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ wardId: 1, patientId: 99, requiresIsolation: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockInpatientApi.checkWardCompatibility).toHaveBeenCalledWith(1, 99, false, undefined, undefined);
    expect(result.current.data?.compatible).toBe(true);
  });

  it('should bulk check patient compatibility across wards', async () => {
    mockInpatientApi.bulkCheckCompatibility.mockResolvedValue({
      results: [{ patient_id: 1, compatible_wards: [1, 2] }],
    } as any);

    const { result } = renderHook(() => useBulkCompatibilityCheck(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ patientIds: [1], requiresIsolation: [false] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockInpatientApi.bulkCheckCompatibility).toHaveBeenCalledWith([1], [false]);
    expect(result.current.data?.results?.[0]?.patient_id).toBe(1);
  });
});

describe('useAdmissionRecommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch admission recommendations', async () => {
    mockInpatientApi.listAdmissionRecommendations.mockResolvedValue({
      count: mockRecommendations.length,
      next: null,
      previous: null,
      results: mockRecommendations as any,
    });

    const { result } = renderHook(() => useAdmissionRecommendations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toBeDefined();
    expect(result.current.data?.results.length).toBeGreaterThan(0);
  });

  it('should filter recommendations by status', async () => {
    const pendingRecs = mockRecommendations.filter((r) => r.status === 'PENDING');
    mockInpatientApi.listAdmissionRecommendations.mockResolvedValue({
      count: pendingRecs.length,
      next: null,
      previous: null,
      results: pendingRecs as any,
    });

    const { result } = renderHook(
      () => useAdmissionRecommendations({ status: 'PENDING' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const recommendations = result.current.data?.results || [];
    expect(recommendations.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('should filter recommendations by urgency', async () => {
    const urgentRecs = mockRecommendations.filter((r) => r.urgency === 'URGENT');
    mockInpatientApi.listAdmissionRecommendations.mockResolvedValue({
      count: urgentRecs.length,
      next: null,
      previous: null,
      results: urgentRecs as any,
    });

    const { result } = renderHook(
      () => useAdmissionRecommendations({ urgency: 'URGENT' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const recommendations = result.current.data?.results || [];
    expect(recommendations.every((r) => r.urgency === 'URGENT')).toBe(true);
  });
});

describe('useAdmissionRecommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch a single recommendation by id', async () => {
    mockInpatientApi.getAdmissionRecommendation.mockResolvedValue(mockRecommendations[0] as any);

    const { result } = renderHook(() => useAdmissionRecommendation(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.reason).toBe('Severe malaria');
    expect(mockInpatientApi.getAdmissionRecommendation).toHaveBeenCalledWith(1);
  });

  it('should not fetch recommendation details when id is undefined', () => {
    const { result } = renderHook(() => useAdmissionRecommendation(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockInpatientApi.getAdmissionRecommendation).not.toHaveBeenCalled();
  });
});

describe('useCreateAdmissionRecommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a new admission recommendation', async () => {
    const newRec = { id: 4, status: 'PENDING', encounter: 5, reason: 'Test' };
    mockInpatientApi.createAdmissionRecommendation.mockResolvedValue(newRec as any);

    const { result } = renderHook(() => useCreateAdmissionRecommendation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      encounter: 5,
      recommended_by: 1,
      reason: 'Test recommendation',
      urgency: 'ROUTINE',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('PENDING');
  });
});

describe('useAcceptAdmissionRecommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept a pending recommendation', async () => {
    mockInpatientApi.acceptAdmissionRecommendation.mockResolvedValue({
      ...mockRecommendations[0],
      status: 'ACCEPTED',
    } as any);

    const { result } = renderHook(() => useAcceptAdmissionRecommendation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: 1, userId: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('ACCEPTED');
  });
});

describe('useDeclineAdmissionRecommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should decline a pending recommendation', async () => {
    mockInpatientApi.declineAdmissionRecommendation.mockResolvedValue({
      ...mockRecommendations[0],
      status: 'DECLINED',
    } as any);

    const { result } = renderHook(() => useDeclineAdmissionRecommendation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: 1, userId: 1, reason: 'Patient declined' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('DECLINED');
  });
});

describe('useAdmissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch admissions list', async () => {
    mockInpatientApi.listAdmissions.mockResolvedValue({
      count: mockAdmissions.length,
      next: null,
      previous: null,
      results: mockAdmissions as any,
    });

    const { result } = renderHook(() => useAdmissions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toBeDefined();
    expect(result.current.data?.results.length).toBeGreaterThan(0);
  });

  it('should filter admissions by status', async () => {
    const activeAdmissions = mockAdmissions.filter((a) => a.admission_status === 'ACTIVE');
    mockInpatientApi.listAdmissions.mockResolvedValue({
      count: activeAdmissions.length,
      next: null,
      previous: null,
      results: activeAdmissions as any,
    });

    const { result } = renderHook(
      () => useAdmissions({ admission_status: 'ACTIVE' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const admissions = result.current.data?.results || [];
    expect(admissions.every((a) => a.admission_status === 'ACTIVE')).toBe(true);
  });

  it('should filter admissions by patient', async () => {
    const patientAdmissions = mockAdmissions.filter((a) => a.patient === 1);
    mockInpatientApi.listAdmissions.mockResolvedValue({
      count: patientAdmissions.length,
      next: null,
      previous: null,
      results: patientAdmissions as any,
    });

    const { result } = renderHook(() => useAdmissions({ patient: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const admissions = result.current.data?.results || [];
    expect(admissions.every((a) => a.patient === 1)).toBe(true);
  });

  it('should filter admissions by ward', async () => {
    const wardAdmissions = mockAdmissions.filter((a) => a.ward === 1);
    mockInpatientApi.listAdmissions.mockResolvedValue({
      count: wardAdmissions.length,
      next: null,
      previous: null,
      results: wardAdmissions as any,
    });

    const { result } = renderHook(() => useAdmissions({ ward: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const admissions = result.current.data?.results || [];
    expect(admissions.every((a) => a.ward === 1)).toBe(true);
  });
});

describe('useAdmission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch a single admission by ID', async () => {
    mockInpatientApi.getAdmission.mockResolvedValue(mockAdmissions[0] as any);

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a new admission', async () => {
    const newAdmission = {
      id: 3,
      admission_number: 'ADM-20260103-0002',
      admission_status: 'ACTIVE',
      patient: 3,
    };
    mockInpatientApi.createAdmission.mockResolvedValue(newAdmission as any);

    const { result } = renderHook(() => useCreateAdmission(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      patient: 3,
      ward: 1,
      bed: 1,
      admitting_officer: 1,
      admitting_diagnosis: 'B50.0',
      payer_type: 'CASH',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.admission_status).toBe('ACTIVE');
    expect(result.current.data?.admission_number).toContain('ADM-');
  });
});

describe('useUpdateAdmission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update an admission', async () => {
    mockInpatientApi.updateAdmission.mockResolvedValue({
      ...mockAdmissions[0],
      admission_status: 'DISCHARGED',
    } as any);

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update a bed status', async () => {
    mockInpatientApi.updateBed.mockResolvedValue({
      ...mockBeds[0],
      status: 'OCCUPIED',
      notes: 'Patient admitted',
    } as any);

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

describe('discharge hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch discharge list and a single discharge', async () => {
    const mockDischarge = {
      id: 1,
      admission: 1,
      discharge_date: '2026-03-15',
      disposition: 'HOME',
      summary: 'Recovered well',
    };
    mockInpatientApi.listDischarges.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockDischarge],
    } as any);
    mockInpatientApi.getDischarge.mockResolvedValue(mockDischarge as any);

    const list = renderHook(() => useDischarges({ admission: 1 } as any), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(mockInpatientApi.listDischarges).toHaveBeenCalledWith({ admission: 1 });

    const detail = renderHook(() => useDischarge(1), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    expect(mockInpatientApi.getDischarge).toHaveBeenCalledWith(1);
  });

  it('should create a discharge and invalidate dependent inpatient queries', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockInpatientApi.createDischarge.mockResolvedValue({
      id: 1,
      admission: 1,
      discharge_date: '2026-03-15',
      disposition: 'HOME',
    } as any);

    const { result } = renderHook(() => useCreateDischarge(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        admission: 1,
        discharge_date: '2026-03-15',
        disposition: 'HOME',
      } as any);
    });

    expect(mockInpatientApi.createDischarge).toHaveBeenCalled();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'discharges'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'admissions', 1] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'admissions'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'beds', undefined] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'wards'] });
    invalidateQueriesSpy.mockRestore();
  });

  it('should update a discharge and invalidate detail and list queries', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockInpatientApi.updateDischarge.mockResolvedValue({
      id: 1,
      admission: 1,
      disposition: 'TRANSFER',
    } as any);

    const { result } = renderHook(() => useUpdateDischarge(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 1,
        data: { disposition: 'TRANSFER' },
      });
    });

    expect(mockInpatientApi.updateDischarge).toHaveBeenCalledWith(1, { disposition: 'TRANSFER' });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'discharges', 1] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['inpatient', 'discharges'] });
    invalidateQueriesSpy.mockRestore();
  });
});

describe('additional inpatient hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches transfers, ward rounds, review requests, kardex, handovers, orders, readings, sheets, transfusions, and BP readings', async () => {
    mockInpatientApi.listTransfers.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockTransfer] } as any);
    mockInpatientApi.getTransfer.mockResolvedValue(mockTransfer as any);
    mockInpatientApi.listWardRounds.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockWardRound] } as any);
    mockInpatientApi.getWardRound.mockResolvedValue(mockWardRound as any);
    mockInpatientApi.listReviewRequests.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockReviewRequest] } as any);
    mockInpatientApi.getReviewRequest.mockResolvedValue(mockReviewRequest as any);
    mockInpatientApi.listKardex.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockKardex] } as any);
    mockInpatientApi.getKardex.mockResolvedValue(mockKardex as any);
    mockInpatientApi.getKardexByAdmission.mockResolvedValue(mockKardex as any);
    mockInpatientApi.listShiftHandovers.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockShiftHandover] } as any);
    mockInpatientApi.getShiftHandover.mockResolvedValue(mockShiftHandover as any);
    mockInpatientApi.getAdmissionOrders.mockResolvedValue([{ id: 1 }] as any);
    mockInpatientApi.getAdmissionLabOrders.mockResolvedValue([{ id: 2 }] as any);
    mockInpatientApi.getAdmissionImagingOrders.mockResolvedValue([{ id: 3 }] as any);
    mockInpatientApi.getAdmissionPrescriptions.mockResolvedValue([{ id: 4 }] as any);
    mockInpatientApi.getAdmissionConsumableUsage.mockResolvedValue([mockConsumableUsage] as any);
    mockInpatientApi.listTemperatureReadings.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockTemperatureReading] } as any);
    mockInpatientApi.listFluidBalanceSheets.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockFluidBalanceSheet] } as any);
    mockInpatientApi.listFluidBalanceEntries.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockFluidBalanceEntry] } as any);
    mockInpatientApi.listBloodTransfusions.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockBloodTransfusion] } as any);
    mockInpatientApi.getBloodTransfusion.mockResolvedValue(mockBloodTransfusion as any);
    mockInpatientApi.listBPReadings.mockResolvedValue({ count: 1, next: null, previous: null, results: [mockBPReading] } as any);

    const wrapper = createWrapper();
    const hooks = [
      renderHook(() => useTransfers({ admission: 1 } as any), { wrapper }),
      renderHook(() => useTransfer(1), { wrapper }),
      renderHook(() => useWardRounds({ admission: 1 } as any), { wrapper }),
      renderHook(() => useWardRound(1), { wrapper }),
      renderHook(() => useAdmissionWardRounds(1), { wrapper }),
      renderHook(() => useReviewRequests({ admission: 1 } as any), { wrapper }),
      renderHook(() => useReviewRequest(1), { wrapper }),
      renderHook(() => useAdmissionReviewRequests(1), { wrapper }),
      renderHook(() => usePendingReviewRequests(), { wrapper }),
      renderHook(() => useKardexList({ admission: 1 } as any), { wrapper }),
      renderHook(() => useKardex(1), { wrapper }),
      renderHook(() => useKardexByAdmission(1), { wrapper }),
      renderHook(() => useShiftHandovers({ admission: 1 } as any), { wrapper }),
      renderHook(() => useShiftHandover(1), { wrapper }),
      renderHook(() => useAdmissionOrders(1), { wrapper }),
      renderHook(() => useAdmissionLabOrders(1), { wrapper }),
      renderHook(() => useAdmissionImagingOrders(1), { wrapper }),
      renderHook(() => useAdmissionPrescriptions(1), { wrapper }),
      renderHook(() => useAdmissionConsumableUsage(1), { wrapper }),
      renderHook(() => useTemperatureReadings(1), { wrapper }),
      renderHook(() => useFluidBalanceSheets(1), { wrapper }),
      renderHook(() => useFluidBalanceEntries(1), { wrapper }),
      renderHook(() => useBloodTransfusions(1), { wrapper }),
      renderHook(() => useBloodTransfusion(1), { wrapper }),
      renderHook(() => useBPReadings(1), { wrapper }),
    ];

    await waitFor(() => {
      hooks.forEach((hook) => expect(hook.result.current.isSuccess).toBe(true));
    });

    expect(mockInpatientApi.listReviewRequests).toHaveBeenCalledWith({ status: 'PENDING' });
    expect(mockInpatientApi.listTemperatureReadings).toHaveBeenCalledWith({ admission: 1, page_size: 100 });
    expect(mockInpatientApi.listFluidBalanceSheets).toHaveBeenCalledWith({ admission: 1, page_size: 30 });
    expect(mockInpatientApi.listFluidBalanceEntries).toHaveBeenCalledWith({ fluid_balance_sheet: 1, page_size: 200 });
    expect(mockInpatientApi.listBPReadings).toHaveBeenCalledWith({ admission: 1, page_size: 100 });
  });

  it('does not fetch disabled detail hooks when ids are undefined', () => {
    const wrapper = createWrapper();
    renderHook(() => useTransfer(undefined), { wrapper });
    renderHook(() => useWardRound(undefined), { wrapper });
    renderHook(() => useReviewRequest(undefined), { wrapper });
    renderHook(() => useKardex(undefined), { wrapper });
    renderHook(() => useKardexByAdmission(undefined), { wrapper });
    renderHook(() => useShiftHandover(undefined), { wrapper });
    renderHook(() => useAdmissionOrders(undefined), { wrapper });
    renderHook(() => useAdmissionConsumableUsage(undefined), { wrapper });
    renderHook(() => useTemperatureReadings(undefined), { wrapper });
    renderHook(() => useFluidBalanceSheets(undefined), { wrapper });
    renderHook(() => useFluidBalanceEntries(undefined), { wrapper });
    renderHook(() => useBloodTransfusions(undefined), { wrapper });
    renderHook(() => useBloodTransfusion(undefined), { wrapper });
    renderHook(() => useBPReadings(undefined), { wrapper });

    expect(mockInpatientApi.getTransfer).not.toHaveBeenCalled();
    expect(mockInpatientApi.getWardRound).not.toHaveBeenCalled();
    expect(mockInpatientApi.getReviewRequest).not.toHaveBeenCalled();
    expect(mockInpatientApi.getKardex).not.toHaveBeenCalled();
    expect(mockInpatientApi.getShiftHandover).not.toHaveBeenCalled();
    expect(mockInpatientApi.getBloodTransfusion).not.toHaveBeenCalled();
  });

  it('invalidates the correct caches for additional inpatient mutations', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    const cases = [
      { useHook: useCreateTransfer, api: mockInpatientApi.createTransfer, input: { admission: 1, to_ward: 2 }, called: [{ admission: 1, to_ward: 2 }], resolved: mockTransfer, keys: [inpatientQueryKeys.transfers(), inpatientQueryKeys.admission(1), inpatientQueryKeys.admissions(), inpatientQueryKeys.beds(), inpatientQueryKeys.wards()] },
      { useHook: useCreateWardRound, api: mockInpatientApi.createWardRound, input: { admission: 1, notes: 'review' }, called: [{ admission: 1, notes: 'review' }], resolved: mockWardRound, keys: [inpatientQueryKeys.wardRounds(), inpatientQueryKeys.wardRounds({ admission: 1 })] },
      { useHook: useUpdateWardRound, api: mockInpatientApi.updateWardRound, input: { id: 1, data: { notes: 'updated' } }, called: [1, { notes: 'updated' }], resolved: mockWardRound, keys: [inpatientQueryKeys.wardRound(1), inpatientQueryKeys.wardRounds()] },
      { useHook: useCreateReviewRequest, api: mockInpatientApi.createReviewRequest, input: { admission: 1, reason: 'review' }, called: [{ admission: 1, reason: 'review' }], resolved: mockReviewRequest, keys: [inpatientQueryKeys.reviewRequests(), inpatientQueryKeys.reviewRequests({ admission: 1 })] },
      { useHook: useAcknowledgeReviewRequest, api: mockInpatientApi.acknowledgeReviewRequest, input: 1, called: [1], resolved: mockReviewRequest, keys: [inpatientQueryKeys.reviewRequest(1), inpatientQueryKeys.reviewRequests()] },
      { useHook: useCompleteReviewRequest, api: mockInpatientApi.completeReviewRequest, input: 1, called: [1], resolved: { ...mockReviewRequest, status: 'COMPLETED' }, keys: [inpatientQueryKeys.reviewRequest(1), inpatientQueryKeys.reviewRequests()] },
      { useHook: useCancelReviewRequest, api: mockInpatientApi.cancelReviewRequest, input: { requestId: 1, reason: 'cancel' }, called: [1, 'cancel'], resolved: { ...mockReviewRequest, status: 'CANCELLED' }, keys: [inpatientQueryKeys.reviewRequest(1), inpatientQueryKeys.reviewRequests()] },
      { useHook: useUpdateKardex, api: mockInpatientApi.updateKardex, input: { id: 1, data: { diagnosis: 'Dx' } }, called: [1, { diagnosis: 'Dx' }], resolved: mockKardex, keys: [inpatientQueryKeys.kardexById(1), inpatientQueryKeys.kardex()] },
      { useHook: useAddKardexShiftNote, api: mockInpatientApi.addKardexShiftNote, input: { kardexId: 1, data: { note: 'shift' } }, called: [1, { note: 'shift' }], resolved: {}, keys: [inpatientQueryKeys.kardexById(1)] },
      { useHook: useAddKardexHandoverNote, api: mockInpatientApi.addKardexHandoverNote, input: { kardexId: 1, data: { note: 'handover' } }, called: [1, { note: 'handover' }], resolved: {}, keys: [inpatientQueryKeys.kardexById(1)] },
      { useHook: useAddCarePlanEntry, api: mockInpatientApi.addCarePlanEntry, input: { kardexId: 1, data: { problem: 'Pain' } }, called: [1, { problem: 'Pain' }], resolved: {}, keys: [inpatientQueryKeys.kardexById(1)] },
      { useHook: useUpdateCarePlanEntry, api: mockInpatientApi.updateCarePlanEntry, input: { kardexId: 1, entryId: 9, data: { status: 'DONE' } }, called: [1, 9, { status: 'DONE' }], resolved: {}, keys: [inpatientQueryKeys.kardexById(1)] },
      { useHook: useCreateShiftHandover, api: mockInpatientApi.createShiftHandover, input: { admission: 1 }, called: [{ admission: 1 }], resolved: mockShiftHandover, keys: [inpatientQueryKeys.shiftHandovers()] },
      { useHook: useAcknowledgeShiftHandover, api: mockInpatientApi.acknowledgeShiftHandover, input: 1, called: [1], resolved: mockShiftHandover, keys: [inpatientQueryKeys.shiftHandover(1), inpatientQueryKeys.shiftHandovers()] },
      { useHook: useAutoPopulateShiftHandover, api: mockInpatientApi.autoPopulateShiftHandover, input: 1, called: [1], resolved: mockShiftHandover, keys: [inpatientQueryKeys.shiftHandover(1)] },
      { useHook: useRecordAdmissionConsumableUsage, api: mockInpatientApi.recordAdmissionConsumableUsage, input: { admissionId: 1, data: { stock_batch: 9, quantity: 2 } }, called: [1, { stock_batch: 9, quantity: 2 }], resolved: mockConsumableUsage, keys: [inpatientQueryKeys.admissionConsumableUsage(1), inpatientQueryKeys.admission(1), ['stock-batches']] },
      { useHook: useReverseAdmissionConsumableUsage, api: mockInpatientApi.reverseAdmissionConsumableUsage, input: { admissionId: 1, usageId: 1, data: { reason: 'error' } }, called: [1, 1, { reason: 'error' }], resolved: mockConsumableUsage, keys: [inpatientQueryKeys.admissionConsumableUsage(1), inpatientQueryKeys.admission(1), ['stock-batches']] },
      { useHook: useCreateTemperatureReading, api: mockInpatientApi.createTemperatureReading, input: { admission: 1, temperature_celsius: 37.5 }, called: [{ admission: 1, temperature_celsius: 37.5 }], resolved: mockTemperatureReading, keys: [inpatientQueryKeys.temperatureReadings(1)] },
      { useHook: useCreateFluidBalanceSheet, api: mockInpatientApi.createFluidBalanceSheet, input: { admission: 1, chart_date: '2026-03-15' }, called: [{ admission: 1, chart_date: '2026-03-15' }], resolved: mockFluidBalanceSheet, keys: [[...inpatientQueryKeys.all, 'fluid-balance-sheets']] },
      { useHook: useUpdateFluidBalanceSheet, api: mockInpatientApi.updateFluidBalanceSheet, input: { id: 1, data: { chart_date: '2026-03-16' } }, called: [1, { chart_date: '2026-03-16' }], resolved: mockFluidBalanceSheet, keys: [inpatientQueryKeys.fluidBalanceSheet(1), [...inpatientQueryKeys.all, 'fluid-balance-sheets']] },
      { useHook: useCreateFluidBalanceEntry, api: mockInpatientApi.createFluidBalanceEntry, input: { fluid_balance_sheet: 1, entry_type: 'INPUT', amount_ml: 500 }, called: [{ fluid_balance_sheet: 1, entry_type: 'INPUT', amount_ml: 500 }], resolved: mockFluidBalanceEntry, keys: [inpatientQueryKeys.fluidBalanceEntries({ fluid_balance_sheet: 1, page_size: 200 }), [...inpatientQueryKeys.all, 'fluid-balance-sheets']] },
      { useHook: useCreateBloodTransfusion, api: mockInpatientApi.createBloodTransfusion, input: { admission: 1, blood_product: 'PRBC' }, called: [{ admission: 1, blood_product: 'PRBC' }], resolved: mockBloodTransfusion, keys: [inpatientQueryKeys.bloodTransfusions(1)] },
      { useHook: useAddTransfusionObservation, api: mockInpatientApi.addTransfusionObservation, input: { transfusionId: 1, data: { temperature: 37.2 } }, called: [1, { temperature: 37.2 }], resolved: {}, keys: [inpatientQueryKeys.all] },
      { useHook: useMarkTransfusionReaction, api: mockInpatientApi.markTransfusionReaction, input: { transfusionId: 1, data: { reaction_type: 'FEVER', action_taken: 'Stopped' } }, called: [1, { reaction_type: 'FEVER', action_taken: 'Stopped' }], resolved: {}, keys: [inpatientQueryKeys.all] },
      { useHook: useCompleteTransfusion, api: mockInpatientApi.completeTransfusion, input: { transfusionId: 1, data: { time_ended: '12:00' } }, called: [1, { time_ended: '12:00' }], resolved: {}, keys: [inpatientQueryKeys.all] },
      { useHook: useCreateBPReading, api: mockInpatientApi.createBPReading, input: { admission: 1, systolic: 120, diastolic: 80 }, called: [{ admission: 1, systolic: 120, diastolic: 80 }], resolved: mockBPReading, keys: [inpatientQueryKeys.bpReadings(1)] },
    ];

    for (const testCase of cases) {
      testCase.api.mockResolvedValueOnce(testCase.resolved as any);
      const { result } = renderHook(() => testCase.useHook(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(testCase.input as any);
      });

      expect(testCase.api).toHaveBeenCalledWith(...(testCase.called as []));
      testCase.keys.forEach((key) => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: key });
      });
    }

    invalidateQueriesSpy.mockRestore();
  });
});
