import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  triageKeys,
  useBreachActions,
  useBreachSummary,
  useCalculateTriageCategory,
  useCancelWaitingEntry,
  useCheckInPatient,
  useCompleteTriageAssessment,
  useCreateTriageAssessment,
  useCriticalPatients,
  useERBedActions,
  useERBedBoard,
  useERBedSummary,
  useEscalatePatient,
  useEscalationActions,
  useEscalations,
  useSuggestedERBed,
  useStartTriage,
  useTriageAssessment,
  useTriageAssessmentByEncounter,
  useTriageQueue,
  useTriageQueueActions,
  useTriageReports,
  useTriageVitalThresholds,
  useTriageVolumeReport,
  useTriageWaitTimeStats,
  useUpdateTriageAssessment,
  useUpdateVitalThreshold,
  useToggleThresholdActive,
  useResetThresholdToDefault,
  useResetAllThresholdsToDefaults,
  useImportThresholds,
  useWaitingQueue,
  useWaitTimeBreaches,
  useZonesSummary,
} from '@/lib/hooks/use-triage';
import { apiClient } from '@/lib/api/client';
import { triageApi } from '@/lib/api/triage';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('@/lib/api/triage', () => ({
  triageApi: {
    listAssessments: jest.fn(),
    createAssessment: jest.fn(),
    completeAssessment: jest.fn(),
    routeToClinic: jest.fn(),
    getVolumeReport: jest.fn(),
    getCriticalPatients: jest.fn(),
    getZonesSummary: jest.fn(),
    getERBedBoard: jest.fn(),
    getERBedSummary: jest.fn(),
    assignERBedPatient: jest.fn(),
    releaseERBed: jest.fn(),
    updateERBedStatus: jest.fn(),
    createERBed: jest.fn(),
    suggestERBed: jest.fn(),
    getBreaches: jest.fn(),
    getBreachSummary: jest.fn(),
    acknowledgeBreach: jest.fn(),
    resolveBreach: jest.fn(),
    getEscalations: jest.fn(),
    escalateQueueEntry: jest.fn(),
    resolveEscalation: jest.fn(),
    dismissEscalation: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-consultation-queue', () => ({
  consultationQueueKeys: {
    all: ['consultation-queue'],
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockTriageApi = triageApi as jest.Mocked<typeof triageApi>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = 'TriageHookWrapper';
  return Wrapper;
};

describe('triageKeys', () => {
  it('builds stable keys for major triage resources', () => {
    expect(triageKeys.all).toEqual(['triage']);
    expect(triageKeys.assessment(1)).toEqual(['triage', 'assessments', 1]);
    expect(triageKeys.queue()).toEqual(['triage', 'queue']);
    expect(triageKeys.thresholds()).toEqual(['triage', 'thresholds']);
    expect(triageKeys.erBedBoard('RED')).toEqual(['triage', 'er-beds', 'board', 'RED']);
  });
});

describe('triage assessment hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches an assessment by id and respects disabled state', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { id: 1, encounter: 100, triage_category: 'YELLOW' } } as never);

    const { result } = renderHook(() => useTriageAssessment(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiClient.get).toHaveBeenCalledWith('/api/triage/assessments/1/');
    expect(result.current.data?.triage_category).toBe('YELLOW');

    const disabled = renderHook(() => useTriageAssessment(undefined), { wrapper: createWrapper() });
    expect(disabled.result.current.fetchStatus).toBe('idle');
  });

  it('fetches assessment by encounter and returns the first result', async () => {
    mockTriageApi.listAssessments.mockResolvedValueOnce({
      count: 1,
      results: [{ id: 2, encounter: 100, triage_category: 'RED' }],
    } as never);

    const { result } = renderHook(() => useTriageAssessmentByEncounter(100), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockTriageApi.listAssessments).toHaveBeenCalledWith({ encounter: 100 });
    expect(result.current.data?.id).toBe(2);
  });

  it('invalidates queue and encounters when creating, updating, and completing assessments', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockTriageApi.createAssessment.mockResolvedValueOnce({ id: 3, encounter: 100 } as never);
    mockApiClient.patch.mockResolvedValueOnce({ data: { id: 3, encounter: 100 } } as never);
    mockTriageApi.completeAssessment.mockResolvedValueOnce({ id: 3, encounter: 100 } as never);

    const createHook = renderHook(() => useCreateTriageAssessment(), { wrapper: createWrapper() });
    await act(async () => {
      await createHook.result.current.mutateAsync({ encounter: 100 } as never);
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'queue'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'assessments'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['encounters', 100] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['encounters'] });

    const updateHook = renderHook(() => useUpdateTriageAssessment(), { wrapper: createWrapper() });
    await act(async () => {
      await updateHook.result.current.mutateAsync({ id: 3, data: { triage_category: 'ORANGE' } as never });
    });
    expect(mockApiClient.patch).toHaveBeenCalledWith('/api/triage/assessments/3/', { triage_category: 'ORANGE' });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'assessments', 3] });

    const completeHook = renderHook(() => useCompleteTriageAssessment(), { wrapper: createWrapper() });
    await act(async () => {
      await completeHook.result.current.mutateAsync(3);
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'assessments', 3] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'assessments'] });
    invalidateQueriesSpy.mockRestore();
  });

  it('posts to calculate triage category endpoint', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { suggested_category: 'RED', alerts: [] } } as never);

    const { result } = renderHook(() => useCalculateTriageCategory(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ mental_status: 'ALERT', chief_complaint_category: 'TRAUMA' });
    });

    expect(mockApiClient.post).toHaveBeenCalledWith('/api/triage/assessments/calculate-category/', {
      mental_status: 'ALERT',
      chief_complaint_category: 'TRAUMA',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.suggested_category).toBe('RED');
  });
});

describe('triage queue and waiting queue hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds queue query strings and invalidates queue actions', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockApiClient.get.mockResolvedValueOnce({ data: { count: 1, results: [{ id: 1 }] } } as never);
    mockApiClient.post
      .mockResolvedValueOnce({ data: { id: 1 } } as never)
      .mockResolvedValueOnce({ data: { id: 1 } } as never)
      .mockResolvedValueOnce({ data: { id: 1 } } as never)
      .mockResolvedValueOnce({ data: { id: 1 } } as never);

    const queue = renderHook(() => useTriageQueue({ area: 'ER', category: 'RED', status: 'WAITING' } as never), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(queue.result.current.isSuccess).toBe(true));
    expect(mockApiClient.get).toHaveBeenCalledWith('/api/triage/queue/?area=ER&triage_category=RED&status=WAITING');

    const actions = renderHook(() => useTriageQueueActions(), { wrapper: createWrapper() });
    await act(async () => {
      await actions.result.current.callPatient(1);
      await actions.result.current.markWithClinician(1);
      await actions.result.current.markComplete(1);
      await actions.result.current.markLWBS(1, 'Patient left');
    });

    expect(mockApiClient.post).toHaveBeenNthCalledWith(1, '/api/triage/queue/1/call/');
    expect(mockApiClient.post).toHaveBeenNthCalledWith(2, '/api/triage/queue/1/with-clinician/');
    expect(mockApiClient.post).toHaveBeenNthCalledWith(3, '/api/triage/queue/1/complete/');
    expect(mockApiClient.post).toHaveBeenNthCalledWith(4, '/api/triage/queue/1/lwbs/', { reason: 'Patient left' });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'queue'] });
    invalidateQueriesSpy.mockRestore();
  });

  it('handles waiting queue queries and mutations', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockApiClient.get.mockResolvedValueOnce({ data: { count: 1, results: [{ id: 9, status: 'WAITING_TRIAGE' }] } } as never);
    mockApiClient.post
      .mockResolvedValueOnce({ data: { id: 9, status: 'WAITING_TRIAGE' } } as never)
      .mockResolvedValueOnce({ data: { id: 9, status: 'IN_TRIAGE' } } as never)
      .mockResolvedValueOnce({ data: { id: 9, status: 'CANCELLED' } } as never);

    const waiting = renderHook(() => useWaitingQueue({ status: 'WAITING_TRIAGE', show_all: true }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(waiting.result.current.isSuccess).toBe(true));
    expect(mockApiClient.get).toHaveBeenCalledWith('/api/triage/waiting/?status=WAITING_TRIAGE&show_all=true');

    const checkIn = renderHook(() => useCheckInPatient(), { wrapper: createWrapper() });
    await act(async () => {
      await checkIn.result.current.mutateAsync({ patient_id: 1, reason_for_visit: 'Fever' } as never);
    });
    expect(mockApiClient.post).toHaveBeenNthCalledWith(1, '/api/triage/waiting/', { patient_id: 1, reason_for_visit: 'Fever' });

    const start = renderHook(() => useStartTriage(), { wrapper: createWrapper() });
    await act(async () => {
      await start.result.current.mutateAsync(9);
    });
    expect(mockApiClient.post).toHaveBeenNthCalledWith(2, '/api/triage/waiting/9/start-triage/');

    const cancel = renderHook(() => useCancelWaitingEntry(), { wrapper: createWrapper() });
    await act(async () => {
      await cancel.result.current.mutateAsync({ id: 9, reason: 'Duplicate entry' });
    });
    expect(mockApiClient.post).toHaveBeenNthCalledWith(3, '/api/triage/waiting/9/cancel/', { reason: 'Duplicate entry' });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'waiting'] });
    invalidateQueriesSpy.mockRestore();
  });
});

describe('triage thresholds and reports hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles threshold reads and mutations', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockApiClient.get.mockResolvedValueOnce({ data: { results: [{ id: 1, vital_type: 'HEART_RATE' }] } } as never);
    mockApiClient.put.mockResolvedValueOnce({ data: { id: 1, vital_type: 'HEART_RATE' } } as never);
    mockApiClient.patch.mockResolvedValueOnce({ data: { id: 1, is_active: false } } as never);
    mockApiClient.post
      .mockResolvedValueOnce({ data: { id: 1 } } as never)
      .mockResolvedValueOnce({ data: { success: true } } as never)
      .mockResolvedValueOnce({ data: { success: true } } as never);

    const thresholds = renderHook(() => useTriageVitalThresholds(), { wrapper: createWrapper() });
    await waitFor(() => expect(thresholds.result.current.isSuccess).toBe(true));
    expect(mockApiClient.get).toHaveBeenCalledWith('/api/triage/vital-thresholds/', { params: { page_size: 100 } });

    const update = renderHook(() => useUpdateVitalThreshold(), { wrapper: createWrapper() });
    await act(async () => {
      await update.result.current.mutateAsync({ id: 1, vital_type: 'HEART_RATE' } as never);
    });
    expect(mockApiClient.put).toHaveBeenCalledWith('/api/triage/vital-thresholds/1/', { id: 1, vital_type: 'HEART_RATE' });

    const toggle = renderHook(() => useToggleThresholdActive(), { wrapper: createWrapper() });
    await act(async () => {
      await toggle.result.current.mutateAsync({ id: 1, isActive: false });
    });
    expect(mockApiClient.patch).toHaveBeenCalledWith('/api/triage/vital-thresholds/1/', { is_active: false });

    const resetOne = renderHook(() => useResetThresholdToDefault(), { wrapper: createWrapper() });
    await act(async () => {
      await resetOne.result.current.mutateAsync(1);
    });

    const resetAll = renderHook(() => useResetAllThresholdsToDefaults(), { wrapper: createWrapper() });
    await act(async () => {
      await resetAll.result.current.mutateAsync();
    });

    const importHook = renderHook(() => useImportThresholds(), { wrapper: createWrapper() });
    await act(async () => {
      await importHook.result.current.mutateAsync({ HEART_RATE: { critical_high: 140 } });
    });

    expect(mockApiClient.post).toHaveBeenNthCalledWith(1, '/api/triage/vital-thresholds/1/reset/');
    expect(mockApiClient.post).toHaveBeenNthCalledWith(2, '/api/triage/vital-thresholds/reset-all/');
    expect(mockApiClient.post).toHaveBeenNthCalledWith(3, '/api/triage/vital-thresholds/import/', { HEART_RATE: { critical_high: 140 } });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'thresholds'] });
    invalidateQueriesSpy.mockRestore();
  });

  it('fetches reports, wait times, and volume reports', async () => {
    mockApiClient.get
      .mockResolvedValueOnce({ data: { summary: { total: 10 } } } as never)
      .mockResolvedValueOnce({ data: { total_assessments: 12 } } as never);
    mockTriageApi.getVolumeReport.mockResolvedValueOnce({ categories: [], areas: [] } as never);

    const reports = renderHook(() => useTriageReports({ dateRange: 'week', area: 'ER', category: 'RED' } as never), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(reports.result.current.isSuccess).toBe(true));
    expect(mockApiClient.get).toHaveBeenCalledWith('/api/triage/reports/?date_range=week&area=ER&category=RED');

    const waitTimes = renderHook(() => useTriageWaitTimeStats({ dateRange: 'today' }), { wrapper: createWrapper() });
    await waitFor(() => expect(waitTimes.result.current.isSuccess).toBe(true));
    expect(mockApiClient.get).toHaveBeenCalledWith('/api/triage/reports/wait-times/?date_range=today');

    const volume = renderHook(() => useTriageVolumeReport({ dateRange: 'month' }), { wrapper: createWrapper() });
    await waitFor(() => expect(volume.result.current.isSuccess).toBe(true));
    expect(mockTriageApi.getVolumeReport).toHaveBeenCalledWith({ date_range: 'month' });
  });
});

describe('emergency, bed board, breaches, and escalations hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches emergency and bed board data and supports ER bed actions', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockTriageApi.getCriticalPatients.mockResolvedValueOnce({ results: [] } as never);
    mockTriageApi.getZonesSummary.mockResolvedValueOnce({ zones: [] } as never);
    mockTriageApi.getERBedBoard.mockResolvedValueOnce({ zones: [] } as never);
    mockTriageApi.getERBedSummary.mockResolvedValueOnce({ total: 10 } as never);
    mockTriageApi.suggestERBed.mockResolvedValueOnce({ id: 1, bed_number: 'R-01' } as never);
    mockTriageApi.assignERBedPatient.mockResolvedValueOnce({ id: 1 } as never);
    mockTriageApi.releaseERBed.mockResolvedValueOnce({ id: 1 } as never);
    mockTriageApi.updateERBedStatus.mockResolvedValueOnce({ id: 1 } as never);
    mockTriageApi.createERBed.mockResolvedValueOnce({ id: 2 } as never);

    const critical = renderHook(() => useCriticalPatients(), { wrapper: createWrapper() });
    const zones = renderHook(() => useZonesSummary(), { wrapper: createWrapper() });
    const board = renderHook(() => useERBedBoard('RED'), { wrapper: createWrapper() });
    const summary = renderHook(() => useERBedSummary(), { wrapper: createWrapper() });
    const suggest = renderHook(() => useSuggestedERBed('RED'), { wrapper: createWrapper() });
    await waitFor(() => expect(critical.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(zones.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(board.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(summary.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(suggest.result.current.isSuccess).toBe(true));

    expect(mockTriageApi.getCriticalPatients).toHaveBeenCalled();
    expect(mockTriageApi.getZonesSummary).toHaveBeenCalled();
    expect(mockTriageApi.getERBedBoard).toHaveBeenCalledWith('RED');
    expect(mockTriageApi.getERBedSummary).toHaveBeenCalled();
    expect(mockTriageApi.suggestERBed).toHaveBeenCalledWith('RED');

    const actions = renderHook(() => useERBedActions(), { wrapper: createWrapper() });
    await act(async () => {
      await actions.result.current.assignPatient.mutateAsync({ bedId: 1, patient: 99, triage_assessment: 3 });
      await actions.result.current.releaseBed.mutateAsync({ bedId: 1, markCleaning: false });
      await actions.result.current.updateStatus.mutateAsync({ bedId: 1, status: 'OUT_OF_SERVICE', reason: 'Maintenance' });
      await actions.result.current.createBed.mutateAsync({ zone: 'RED', bed_number: 'R-02' });
    });

    expect(mockTriageApi.assignERBedPatient).toHaveBeenCalledWith(1, { patient: 99, triage_assessment: 3 });
    expect(mockTriageApi.releaseERBed).toHaveBeenCalledWith(1, false);
    expect(mockTriageApi.updateERBedStatus).toHaveBeenCalledWith(1, { status: 'OUT_OF_SERVICE', reason: 'Maintenance' });
    expect(mockTriageApi.createERBed).toHaveBeenCalledWith({ zone: 'RED', bed_number: 'R-02' });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'er-beds'] });
    invalidateQueriesSpy.mockRestore();
  });

  it('handles breach and escalation queries and actions', async () => {
    const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    mockTriageApi.getBreaches.mockResolvedValueOnce([{ id: 1 }] as never);
    mockTriageApi.getBreachSummary.mockResolvedValueOnce({ total: 1 } as never);
    mockTriageApi.getEscalations.mockResolvedValueOnce([{ id: 2 }] as never);
    mockTriageApi.acknowledgeBreach.mockResolvedValueOnce({ id: 1 } as never);
    mockTriageApi.resolveBreach.mockResolvedValueOnce({ id: 1 } as never);
    mockTriageApi.escalateQueueEntry.mockResolvedValueOnce({ id: 2 } as never);
    mockTriageApi.resolveEscalation.mockResolvedValueOnce({ id: 2 } as never);
    mockTriageApi.dismissEscalation.mockResolvedValueOnce({ id: 2 } as never);

    const breaches = renderHook(() => useWaitTimeBreaches({ severity: 'HIGH', triageCategory: 'RED' }), { wrapper: createWrapper() });
    const summary = renderHook(() => useBreachSummary(), { wrapper: createWrapper() });
    const escalations = renderHook(() => useEscalations({ escalationType: 'OVERDUE' }), { wrapper: createWrapper() });
    await waitFor(() => expect(breaches.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(summary.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(escalations.result.current.isSuccess).toBe(true));

    expect(mockTriageApi.getBreaches).toHaveBeenCalledWith({ active_only: true, severity: 'HIGH', triage_category: 'RED' });
    expect(mockTriageApi.getBreachSummary).toHaveBeenCalled();
    expect(mockTriageApi.getEscalations).toHaveBeenCalledWith({ active_only: true, escalation_type: 'OVERDUE' });

    const breachActions = renderHook(() => useBreachActions(), { wrapper: createWrapper() });
    await act(async () => {
      await breachActions.result.current.acknowledgeBreach({ breachId: 1, notes: 'Seen' });
      await breachActions.result.current.resolveBreach(1);
    });
    expect(mockTriageApi.acknowledgeBreach).toHaveBeenCalledWith(1, 'Seen');
    expect(mockTriageApi.resolveBreach).toHaveBeenCalledWith(1);

    const escalate = renderHook(() => useEscalatePatient(), { wrapper: createWrapper() });
    await act(async () => {
      await escalate.result.current.mutateAsync({ queueEntryId: 10, escalationType: 'OVERDUE', reason: 'Exceeded wait target' });
    });
    expect(mockTriageApi.escalateQueueEntry).toHaveBeenCalledWith(10, { escalation_type: 'OVERDUE', reason: 'Exceeded wait target' });

    const escalationActions = renderHook(() => useEscalationActions(), { wrapper: createWrapper() });
    await act(async () => {
      await escalationActions.result.current.resolveEscalation({ escalationId: 2, notes: 'Handled' });
      await escalationActions.result.current.dismissEscalation({ escalationId: 2, notes: 'False alarm' });
    });
    expect(mockTriageApi.resolveEscalation).toHaveBeenCalledWith(2, 'Handled');
    expect(mockTriageApi.dismissEscalation).toHaveBeenCalledWith(2, 'False alarm');
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'breaches'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['triage', 'escalations'] });
    invalidateQueriesSpy.mockRestore();
  });
});
