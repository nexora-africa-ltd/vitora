/**
 * TDD Tests for Clinic Hooks
 *
 * Tests for clinic hooks with patient-journey store integration:
 * - useAddToQueue → syncs to journeyStore.registerPatient + addToWaitingQueue
 * - useCallPatient → syncs to journeyStore.callPatient
 * - useStartConsultation → syncs to journeyStore.startConsultation + setEncounter
 * - useCompleteVisit → syncs to journeyStore.endConsultation
 * - useMarkNoShow → syncs to journeyStore.markLeftWithoutBeingSeen
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAddToQueue,
  useCallPatient,
  useStartConsultation,
  useCompleteVisit,
  useMarkNoShow,
} from '@/lib/hooks/use-clinics';
import { clinicsApi } from '@/lib/api/clinics';
import { usePatientJourneyStore } from '@/lib/stores/patient-journey';
import type { ClinicVisit } from '@/lib/types/clinic';

jest.mock('@/lib/api/clinics');

const mockClinicsApi = clinicsApi as jest.Mocked<typeof clinicsApi>;

// Mock visit data factory
const createMockVisit = (overrides: Partial<ClinicVisit> = {}): ClinicVisit => ({
  id: 1,
  session: 1,
  patient: {
    id: 101,
    mrn: 'MRN-20260126-0001',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    date_of_birth: '1990-01-15',
    age: 36,
    gender: 'M',
    phone_number: '0712345678',
  },
  queue_number: 1,
  status: 'waiting',
  status_display: 'Waiting',
  priority: 'normal',
  priority_display: 'Normal',
  visit_type: 'new',
  visit_type_display: 'New Visit',
  source: 'walk_in',
  source_display: 'Walk In',
  chief_complaint: 'Headache',
  notes: '',
  registered_at: '2026-01-26T08:00:00Z',
  called_at: null,
  consultation_started_at: null,
  completed_at: null,
  wait_time_minutes: 15,
  encounter: null,
  triage_assessment: null,
  assigned_clinician: null,
  assigned_clinician_name: null,
  referred_from: null,
  referred_to_clinic: null,
  referral_reason: '',
  registered_by: 1,
  registered_by_name: 'Reception Staff',
  created_at: '2026-01-26T08:00:00Z',
  updated_at: '2026-01-26T08:00:00Z',
  ...overrides,
});

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

describe('Clinic Hooks - Patient Journey Store Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset patient journey store before each test
    usePatientJourneyStore.getState().clearAllPatients();
  });

  // ===========================================================================
  // useAddToQueue
  // ===========================================================================
  describe('useAddToQueue', () => {
    it('should add patient to queue and sync to journey store', async () => {
      const mockVisit = createMockVisit();
      mockClinicsApi.addToQueue.mockResolvedValue(mockVisit);
      const invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');

      const { result } = renderHook(() => useAddToQueue(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          clinicId: 1,
          data: { patient: 101, chief_complaint: 'Headache' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify API was called
      expect(mockClinicsApi.addToQueue).toHaveBeenCalledWith(1, {
        patient: 101,
        chief_complaint: 'Headache',
      });

      // Verify patient journey store was updated
      const journeyStore = usePatientJourneyStore.getState();
      const patient = journeyStore.activePatients[101];
      
      expect(patient).toBeDefined();
      expect(patient?.id).toBe(101);
      expect(patient?.mrn).toBe('MRN-20260126-0001');
      expect(patient?.name).toBe('John Doe');
      // addToWaitingQueue sets stage to AWAITING_TRIAGE per journey store logic
      expect(patient?.stage).toBe('AWAITING_TRIAGE');
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['consultation-queue'] });

      invalidateQueriesSpy.mockRestore();
    });

    it('should register patient with correct details', async () => {
      const mockVisit = createMockVisit({
        patient: {
          id: 202,
          mrn: 'MRN-20260126-0002',
          first_name: 'Jane',
          last_name: 'Smith',
          full_name: 'Jane Smith',
          date_of_birth: '1985-05-20',
          age: 40,
          gender: 'F',
          phone_number: '0723456789',
        },
      });
      mockClinicsApi.addToQueue.mockResolvedValue(mockVisit);

      const { result } = renderHook(() => useAddToQueue(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          clinicId: 1,
          data: { patient: 202, chief_complaint: 'Back pain' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const journeyStore = usePatientJourneyStore.getState();
      const patient = journeyStore.activePatients[202];
      
      expect(patient).toBeDefined();
      expect(patient?.mrn).toBe('MRN-20260126-0002');
      expect(patient?.name).toBe('Jane Smith');
      expect(patient?.date_of_birth).toBe('1985-05-20');
      expect(patient?.gender).toBe('F');
      expect(patient?.phone).toBe('0723456789');
    });
  });

  // ===========================================================================
  // useCallPatient
  // ===========================================================================
  describe('useCallPatient', () => {
    it('should call patient and sync to journey store', async () => {
      // First add patient to store
      usePatientJourneyStore.getState().registerPatient({
        id: 101,
        mrn: 'MRN-001',
        name: 'John Doe',
      });
      usePatientJourneyStore.getState().addToWaitingQueue(101);

      const mockVisit = createMockVisit({
        status: 'called',
        called_at: '2026-01-26T08:30:00Z',
      });
      mockClinicsApi.callPatient.mockResolvedValue(mockVisit);

      const { result } = renderHook(() => useCallPatient(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(1);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify API was called
      expect(mockClinicsApi.callPatient).toHaveBeenCalledWith(1);

      // Verify journey store was updated
      const journeyStore = usePatientJourneyStore.getState();
      const patient = journeyStore.activePatients[101];
      
      expect(patient?.consultation_status).toBe('CALLED');
    });
  });

  // ===========================================================================
  // useStartConsultation
  // ===========================================================================
  describe('useStartConsultation', () => {
    it('should start consultation and sync to journey store', async () => {
      // First add patient to store and call them
      usePatientJourneyStore.getState().registerPatient({
        id: 101,
        mrn: 'MRN-001',
        name: 'John Doe',
      });
      usePatientJourneyStore.getState().addToWaitingQueue(101);
      usePatientJourneyStore.getState().callPatient(101);

      const mockVisit = createMockVisit({
        status: 'in_consultation',
        consultation_started_at: '2026-01-26T08:35:00Z',
        assigned_clinician: 5,
        assigned_clinician_name: 'Dr. Sarah Wilson',
        encounter: 1001,
      });
      mockClinicsApi.startConsultation.mockResolvedValue(mockVisit);

      const { result } = renderHook(() => useStartConsultation(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(1);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify API was called
      expect(mockClinicsApi.startConsultation).toHaveBeenCalledWith(1);

      // Verify journey store was updated
      const journeyStore = usePatientJourneyStore.getState();
      const patient = journeyStore.activePatients[101];
      
      expect(patient?.stage).toBe('IN_CONSULTATION');
      expect(patient?.consultation_status).toBe('IN_PROGRESS');
      expect(patient?.assigned_clinician_id).toBe(5);
      expect(patient?.assigned_clinician_name).toBe('Dr. Sarah Wilson');
      expect(patient?.encounter_id).toBe(1001);
    });

    it('should handle missing encounter gracefully', async () => {
      usePatientJourneyStore.getState().registerPatient({
        id: 101,
        mrn: 'MRN-001',
        name: 'John Doe',
      });
      usePatientJourneyStore.getState().addToWaitingQueue(101);
      usePatientJourneyStore.getState().callPatient(101);

      const mockVisit = createMockVisit({
        status: 'in_consultation',
        encounter: null, // No encounter yet
      });
      mockClinicsApi.startConsultation.mockResolvedValue(mockVisit);

      const { result } = renderHook(() => useStartConsultation(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(1);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const journeyStore = usePatientJourneyStore.getState();
      const patient = journeyStore.activePatients[101];
      
      expect(patient?.stage).toBe('IN_CONSULTATION');
      // Encounter should remain null/undefined
      expect(patient?.encounter_id).toBeNull();
    });
  });

  // ===========================================================================
  // useCompleteVisit
  // ===========================================================================
  describe('useCompleteVisit', () => {
    it('should complete visit and sync to journey store', async () => {
      // Set up patient in consultation
      usePatientJourneyStore.getState().registerPatient({
        id: 101,
        mrn: 'MRN-001',
        name: 'John Doe',
      });
      usePatientJourneyStore.getState().addToWaitingQueue(101);
      usePatientJourneyStore.getState().callPatient(101);
      usePatientJourneyStore.getState().startConsultation(101);

      const mockVisit = createMockVisit({
        status: 'completed',
        completed_at: '2026-01-26T09:00:00Z',
      });
      mockClinicsApi.completeVisit.mockResolvedValue(mockVisit);

      const { result } = renderHook(() => useCompleteVisit(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(1);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify API was called
      expect(mockClinicsApi.completeVisit).toHaveBeenCalledWith(1);

      // Verify journey store was updated
      const journeyStore = usePatientJourneyStore.getState();
      const patient = journeyStore.activePatients[101];
      
      expect(patient?.consultation_status).toBe('COMPLETED');
    });
  });

  // ===========================================================================
  // useMarkNoShow
  // ===========================================================================
  describe('useMarkNoShow', () => {
    it('should mark no-show and sync to journey store', async () => {
      // Set up patient in queue
      usePatientJourneyStore.getState().registerPatient({
        id: 101,
        mrn: 'MRN-001',
        name: 'John Doe',
      });
      usePatientJourneyStore.getState().addToWaitingQueue(101);

      const mockVisit = createMockVisit({
        status: 'no_show',
      });
      mockClinicsApi.markNoShow.mockResolvedValue(mockVisit);

      const { result } = renderHook(() => useMarkNoShow(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(1);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify API was called
      expect(mockClinicsApi.markNoShow).toHaveBeenCalledWith(1);

      // Verify journey store was updated
      const journeyStore = usePatientJourneyStore.getState();
      const patient = journeyStore.activePatients[101];
      
      expect(patient?.stage).toBe('LEFT_WITHOUT_BEING_SEEN');
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('Error Handling', () => {
    it('should not update journey store on API error', async () => {
      mockClinicsApi.addToQueue.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAddToQueue(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          clinicId: 1,
          data: { patient: 101, chief_complaint: 'Test' },
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Journey store should NOT have the patient
      const journeyStore = usePatientJourneyStore.getState();
      expect(journeyStore.activePatients[101]).toBeUndefined();
    });
  });
});
