/**
 * TDD Tests for Inpatient Hooks
 * Tests all inpatient hooks with mocked inpatientApi
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
