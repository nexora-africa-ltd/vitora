import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  calculateBMI,
  getVitalAlerts,
  useAddDiagnosis,
  useAutoSave,
  useCreateEncounterWithValidation,
  useICD10Search,
  usePatientSearch,
  useRecentPatients,
} from '@/lib/hooks/use-encounter-form';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'EncounterFormHookWrapper';
  return { wrapper, invalidateQueries };
}

describe('use-encounter-form hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches ICD-10 search, patient search, and recent patients', async () => {
    mockApiClient.get
      .mockResolvedValueOnce({ data: { results: [{ code: 'A01', description: 'Typhoid fever' }] } } as never)
      .mockResolvedValueOnce({ data: { results: [{ id: 1, full_name: 'John Doe' }] } } as never)
      .mockResolvedValueOnce({ data: { results: [{ id: 2, full_name: 'Jane Doe' }] } } as never);

    const wrapper = createWrapper().wrapper;
    const icd = renderHook(() => useICD10Search('ty'), { wrapper });
    const patients = renderHook(() => usePatientSearch('jo'), { wrapper });
    const recent = renderHook(() => useRecentPatients(5), { wrapper });

    await waitFor(() => {
      expect(icd.result.current.isSuccess).toBe(true);
      expect(patients.result.current.isSuccess).toBe(true);
      expect(recent.result.current.isSuccess).toBe(true);
    });

    expect(mockApiClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/icd10-codes/?search=ty&page_size=20'
    );
    expect(mockApiClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/patients/?search=jo&page_size=10'
    );
    expect(mockApiClient.get).toHaveBeenNthCalledWith(
      3,
      '/api/patients/?ordering=-updated_at&page_size=5'
    );
  });

  it('does not run short search queries', () => {
    const wrapper = createWrapper().wrapper;
    const icd = renderHook(() => useICD10Search('t'), { wrapper });
    const patients = renderHook(() => usePatientSearch('j'), { wrapper });

    expect(icd.result.current.fetchStatus).toBe('idle');
    expect(patients.result.current.fetchStatus).toBe('idle');
    expect(mockApiClient.get).not.toHaveBeenCalled();
  });

  it('creates encounters with transformed blood pressure and invalidates related queries', async () => {
    const ctx = createWrapper();
    mockApiClient.post.mockResolvedValueOnce({ data: { id: 1, patient: 8 } } as never);

    const { result } = renderHook(() => useCreateEncounterWithValidation(), {
      wrapper: ctx.wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        patient: 8,
        encounter_type: 'OPD',
        encounter_date: '2026-03-15',
        chief_complaint: 'Fever',
        blood_pressure_systolic: 120,
        blood_pressure_diastolic: 80,
        status: 'CREATED',
      } as never);
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/api/encounters/',
      expect.objectContaining({ blood_pressure: '120/80', patient: 8 })
    );
    expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['encounters'] });
    expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['patients', 8, 'encounters'] });
  });

  it('adds diagnosis and invalidates diagnosis queries', async () => {
    const ctx = createWrapper();
    mockApiClient.post.mockResolvedValueOnce({ data: { id: 1 } } as never);
    const { result } = renderHook(() => useAddDiagnosis(5), { wrapper: ctx.wrapper });

    await act(async () => {
      await result.current.mutateAsync({ icd10_code: 'A01', diagnosis_text: 'Typhoid' } as never);
    });

    expect(mockApiClient.post).toHaveBeenCalledWith('/api/encounters/5/diagnoses/', {
      icd10_code: 'A01',
      diagnosis_text: 'Typhoid',
    });
    expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['encounters', 5, 'diagnoses'] });
  });

  it('calculates vital alerts across warning and critical ranges', () => {
    const alerts = getVitalAlerts({
      patient: 1,
      encounter_type: 'OPD',
      encounter_date: '2026-03-15',
      chief_complaint: 'Unwell',
      temperature: 39.5,
      pulse: 130,
      spo2: 84,
      respiratory_rate: 32,
      blood_pressure_systolic: 185,
      blood_pressure_diastolic: 121,
      status: 'CREATED',
    } as never);

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'temperature', severity: 'critical' }),
        expect.objectContaining({ field: 'pulse', severity: 'critical' }),
        expect.objectContaining({ field: 'spo2', severity: 'critical' }),
        expect.objectContaining({ field: 'respiratory_rate', severity: 'critical' }),
        expect.objectContaining({ field: 'blood_pressure', severity: 'critical' }),
      ])
    );

    expect(
      getVitalAlerts({
        patient: 1,
        encounter_type: 'OPD',
        encounter_date: '2026-03-15',
        chief_complaint: 'Checkup',
        temperature: 36.5,
        pulse: 80,
        spo2: 97,
        respiratory_rate: 16,
        status: 'CREATED',
      } as never)
    ).toEqual([]);
  });

  it('calculates BMI and classification correctly', () => {
    expect(calculateBMI(null, 180)).toEqual({ bmi: null, classification: '' });
    expect(calculateBMI(50, 170)).toEqual({ bmi: 17.3, classification: 'Underweight' });
    expect(calculateBMI(68, 170)).toEqual({ bmi: 23.5, classification: 'Normal' });
    expect(calculateBMI(80, 170)).toEqual({ bmi: 27.7, classification: 'Overweight' });
    expect(calculateBMI(100, 170)).toEqual({ bmi: 34.6, classification: 'Obese' });
  });

  it('auto-saves encounter edits when dirty and encounter id is present', async () => {
    mockApiClient.patch.mockResolvedValueOnce({ data: { id: 1 } } as never);
    const { result } = renderHook(
      () =>
        useAutoSave(
          {
            patient: 1,
            encounter_type: 'OPD',
            encounter_date: '2026-03-15',
            chief_complaint: 'Cough',
            blood_pressure_systolic: 110,
            blood_pressure_diastolic: 70,
            status: 'CREATED',
          } as never,
          1,
          true
        ),
      { wrapper: createWrapper().wrapper }
    );

    await waitFor(() => expect(mockApiClient.patch).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isSaving).toBe(false));

    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/api/encounters/1/',
      expect.objectContaining({ blood_pressure: '110/70' })
    );
    expect(result.current.lastSaved).toBeInstanceOf(Date);
  });

  it('does not auto-save when encounter id is missing or form is clean, and logs failures', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    renderHook(
      () =>
        useAutoSave(
          {
            patient: 1,
            encounter_type: 'OPD',
            encounter_date: '2026-03-15',
            chief_complaint: 'Cough',
            status: 'CREATED',
          } as never,
          null,
          true
        ),
      { wrapper: createWrapper().wrapper }
    );

    renderHook(
      () =>
        useAutoSave(
          {
            patient: 1,
            encounter_type: 'OPD',
            encounter_date: '2026-03-15',
            chief_complaint: 'Cough',
            status: 'CREATED',
          } as never,
          1,
          false
        ),
      { wrapper: createWrapper().wrapper }
    );

    expect(mockApiClient.patch).not.toHaveBeenCalled();

    mockApiClient.patch.mockRejectedValueOnce(new Error('save failed'));
    const { result } = renderHook(
      () =>
        useAutoSave(
          {
            patient: 1,
            encounter_type: 'OPD',
            encounter_date: '2026-03-15',
            chief_complaint: 'Cough',
            status: 'CREATED',
          } as never,
          2,
          true
        ),
      { wrapper: createWrapper().wrapper }
    );

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(errorSpy).toHaveBeenCalledWith('Auto-save failed:', expect.any(Error));
    errorSpy.mockRestore();
  });
});
