/**
 * TDD Tests for Patient Journey Store - Phase 5.1 Store Updates
 *
 * Tests cover:
 * 1. triage_status field in patient journey state
 * 2. consultation_status field in patient journey state
 * 3. Updates on: triage completed, bypassed, called, consultation started
 */
import { act, renderHook } from '@testing-library/react';
import { usePatientJourneyStore } from '@/lib/stores/patient-journey';

// =============================================================================
// Test Setup
// =============================================================================

describe('Patient Journey Store - Triage & Consultation Status', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = usePatientJourneyStore.getState();
    store.clearAllPatients?.();
    // Re-initialize if needed
    usePatientJourneyStore.setState({ activePatients: {} });
  });

  // ===========================================================================
  // 1. Initial State Tests
  // ===========================================================================
  describe('Initial State', () => {
    it('should have triage_status field on ActivePatient', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      // Register a patient
      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient).toBeDefined();
      expect(patient).toHaveProperty('triage_status');
    });

    it('should have consultation_status field on ActivePatient', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient).toBeDefined();
      expect(patient).toHaveProperty('consultation_status');
    });

    it('should initialize triage_status as PENDING for new patients', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('PENDING');
    });

    it('should initialize consultation_status as WAITING for new patients', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('WAITING');
    });
  });

  // ===========================================================================
  // 2. Triage Status Updates
  // ===========================================================================
  describe('Triage Status Updates', () => {
    it('should update triage_status to IN_PROGRESS when triage starts', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.startTriage(1);
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('IN_PROGRESS');
    });

    it('should update triage_status to COMPLETED when triage completes', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.startTriage(1);
        result.current.completeTriage(1, {
          assessment_id: 100,
          triage_category: 'GREEN',
          assigned_area: 'OPD',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('COMPLETED');
    });

    it('should update triage_status to BYPASSED when triage is bypassed', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.bypassTriage(1, 'STABLE_FOLLOW_UP');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('BYPASSED');
    });

    it('should store bypass reason when triage is bypassed', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.bypassTriage(1, 'CONSULTANT_DECISION');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_bypass_reason).toBe('CONSULTANT_DECISION');
    });

    it('should set triage_status to NOT_APPLICABLE for direct encounters', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.setTriageNotApplicable(1);
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('NOT_APPLICABLE');
    });
  });

  // ===========================================================================
  // 3. Consultation Status Updates
  // ===========================================================================
  describe('Consultation Status Updates', () => {
    it('should keep consultation_status as WAITING after triage completes', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.completeTriage(1, {
          assessment_id: 100,
          triage_category: 'GREEN',
          assigned_area: 'OPD',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('WAITING');
    });

    it('should update consultation_status to CALLED when patient is called', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.completeTriage(1, {
          assessment_id: 100,
          triage_category: 'GREEN',
          assigned_area: 'OPD',
        });
        result.current.callPatient(1);
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('CALLED');
    });

    it('should update consultation_status to IN_PROGRESS when consultation starts', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.callPatient(1);
        result.current.startConsultation(1, 10, 'Dr. Jane Wanjiku');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('IN_PROGRESS');
    });

    it('should update consultation_status to COMPLETED when consultation ends', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.startConsultation(1, 10, 'Dr. Jane Wanjiku');
        result.current.endConsultation(1, 'Patient has flu', 'J11.1');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('COMPLETED');
    });
  });

  // ===========================================================================
  // 4. Stage Mapping Tests
  // ===========================================================================
  describe('Stage Mapping from Triage/Consultation Status', () => {
    it('should have stage AWAITING_TRIAGE when triage_status is PENDING', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.addToWaitingQueue(1);
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('PENDING');
      expect(patient!.stage).toBe('AWAITING_TRIAGE');
    });

    it('should have stage IN_TRIAGE when triage_status is IN_PROGRESS', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.startTriage(1);
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('IN_PROGRESS');
      expect(patient!.stage).toBe('IN_TRIAGE');
    });

    it('should have stage AWAITING_CONSULTATION when triage_status is COMPLETED and consultation_status is WAITING', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.completeTriage(1, {
          assessment_id: 100,
          triage_category: 'GREEN',
          assigned_area: 'OPD',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('COMPLETED');
      expect(patient!.consultation_status).toBe('WAITING');
      expect(patient!.stage).toBe('AWAITING_CONSULTATION');
    });

    it('should have stage AWAITING_CONSULTATION when consultation_status is CALLED', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.completeTriage(1, {
          assessment_id: 100,
          triage_category: 'GREEN',
          assigned_area: 'OPD',
        });
        result.current.callPatient(1);
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('CALLED');
      expect(patient!.stage).toBe('AWAITING_CONSULTATION');
    });

    it('should have stage IN_CONSULTATION when consultation_status is IN_PROGRESS', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.startConsultation(1, 10, 'Dr. Jane Wanjiku');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('IN_PROGRESS');
      expect(patient!.stage).toBe('IN_CONSULTATION');
    });
  });

  // ===========================================================================
  // 5. Timestamp Updates
  // ===========================================================================
  describe('Timestamp Updates', () => {
    it('should set triage_bypassed_at when triage is bypassed', () => {
      const { result } = renderHook(() => usePatientJourneyStore());
      const beforeTime = new Date().toISOString();

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.bypassTriage(1, 'STABLE_FOLLOW_UP');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.timestamps.triage_bypassed_at).toBeDefined();
      expect(new Date(patient!.timestamps.triage_bypassed_at!).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime()
      );
    });

    it('should set called_at when patient is called', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.callPatient(1);
      });

      const patient = result.current.activePatients[1];
      expect(patient!.timestamps.called_at).toBeDefined();
    });
  });

  // ===========================================================================
  // 6. updateTriageStatus Action
  // ===========================================================================
  describe('updateTriageStatus Action', () => {
    it('should have updateTriageStatus action', () => {
      const { result } = renderHook(() => usePatientJourneyStore());
      expect(result.current.updateTriageStatus).toBeDefined();
      expect(typeof result.current.updateTriageStatus).toBe('function');
    });

    it('should update triage_status directly via updateTriageStatus', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.updateTriageStatus(1, 'COMPLETED');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('COMPLETED');
    });
  });

  // ===========================================================================
  // 7. updateConsultationStatus Action
  // ===========================================================================
  describe('updateConsultationStatus Action', () => {
    it('should have updateConsultationStatus action', () => {
      const { result } = renderHook(() => usePatientJourneyStore());
      expect(result.current.updateConsultationStatus).toBeDefined();
      expect(typeof result.current.updateConsultationStatus).toBe('function');
    });

    it('should update consultation_status directly via updateConsultationStatus', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.updateConsultationStatus(1, 'CALLED');
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('CALLED');
    });
  });
});
