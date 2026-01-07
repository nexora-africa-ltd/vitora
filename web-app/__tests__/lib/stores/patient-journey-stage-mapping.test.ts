/**
 * TDD Tests for Patient Journey Store - Phase 5.2 Stage Mapping
 *
 * Tests cover:
 * 1. deriveStageFromStatuses helper function
 * 2. syncFromEncounter action for backend sync
 * 3. Stage derivation from triage_status and consultation_status
 *
 * Stage Mapping Rules:
 * - triage_status=PENDING → stage: AWAITING_TRIAGE
 * - triage_status=IN_PROGRESS → stage: IN_TRIAGE
 * - triage_status=COMPLETED + consultation_status=WAITING → stage: AWAITING_CONSULTATION
 * - consultation_status=CALLED → stage: AWAITING_CONSULTATION (sub-state)
 * - consultation_status=IN_PROGRESS → stage: IN_CONSULTATION
 * - triage_status=BYPASSED + consultation_status=WAITING → stage: AWAITING_CONSULTATION
 * - triage_status=NOT_APPLICABLE + consultation_status=WAITING → stage: AWAITING_CONSULTATION
 */
import { act, renderHook } from '@testing-library/react';
import {
  usePatientJourneyStore,
  deriveStageFromStatuses,
  type TriageStatus,
  type ConsultationStatus,
  type PatientStage,
} from '@/lib/stores/patient-journey';

// =============================================================================
// Test Setup
// =============================================================================

describe('Patient Journey Store - Stage Mapping (Phase 5.2)', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = usePatientJourneyStore.getState();
    store.clearAllPatients?.();
    usePatientJourneyStore.setState({ activePatients: {} });
  });

  // ===========================================================================
  // 1. deriveStageFromStatuses Helper Function Tests
  // ===========================================================================
  describe('deriveStageFromStatuses Helper', () => {
    it('should return AWAITING_TRIAGE when triage_status is PENDING', () => {
      const stage = deriveStageFromStatuses('PENDING', 'WAITING');
      expect(stage).toBe('AWAITING_TRIAGE');
    });

    it('should return IN_TRIAGE when triage_status is IN_PROGRESS', () => {
      const stage = deriveStageFromStatuses('IN_PROGRESS', 'WAITING');
      expect(stage).toBe('IN_TRIAGE');
    });

    it('should return AWAITING_CONSULTATION when triage_status is COMPLETED and consultation_status is WAITING', () => {
      const stage = deriveStageFromStatuses('COMPLETED', 'WAITING');
      expect(stage).toBe('AWAITING_CONSULTATION');
    });

    it('should return AWAITING_CONSULTATION when consultation_status is CALLED', () => {
      const stage = deriveStageFromStatuses('COMPLETED', 'CALLED');
      expect(stage).toBe('AWAITING_CONSULTATION');
    });

    it('should return IN_CONSULTATION when consultation_status is IN_PROGRESS', () => {
      const stage = deriveStageFromStatuses('COMPLETED', 'IN_PROGRESS');
      expect(stage).toBe('IN_CONSULTATION');
    });

    it('should return AWAITING_CONSULTATION when triage_status is BYPASSED and consultation_status is WAITING', () => {
      const stage = deriveStageFromStatuses('BYPASSED', 'WAITING');
      expect(stage).toBe('AWAITING_CONSULTATION');
    });

    it('should return AWAITING_CONSULTATION when triage_status is NOT_APPLICABLE and consultation_status is WAITING', () => {
      const stage = deriveStageFromStatuses('NOT_APPLICABLE', 'WAITING');
      expect(stage).toBe('AWAITING_CONSULTATION');
    });

    it('should return IN_CONSULTATION when bypassed patient starts consultation', () => {
      const stage = deriveStageFromStatuses('BYPASSED', 'IN_PROGRESS');
      expect(stage).toBe('IN_CONSULTATION');
    });

    it('should return IN_CONSULTATION when NOT_APPLICABLE patient starts consultation', () => {
      const stage = deriveStageFromStatuses('NOT_APPLICABLE', 'IN_PROGRESS');
      expect(stage).toBe('IN_CONSULTATION');
    });

    it('should return null for consultation_status COMPLETED (post-consultation stages vary)', () => {
      const stage = deriveStageFromStatuses('COMPLETED', 'COMPLETED');
      // After consultation, the stage depends on next action (lab, pharmacy, discharge)
      // So we return null to indicate "stage not determined by these statuses alone"
      expect(stage).toBeNull();
    });
  });

  // ===========================================================================
  // 2. syncFromEncounter Action Tests
  // ===========================================================================
  describe('syncFromEncounter Action', () => {
    it('should have syncFromEncounter action', () => {
      const { result } = renderHook(() => usePatientJourneyStore());
      expect(result.current.syncFromEncounter).toBeDefined();
      expect(typeof result.current.syncFromEncounter).toBe('function');
    });

    it('should update triage_status from encounter data', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'WAITING',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('COMPLETED');
    });

    it('should update consultation_status from encounter data', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'CALLED',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.consultation_status).toBe('CALLED');
    });

    it('should derive and update stage from encounter statuses', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'PENDING',
          consultation_status: 'WAITING',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.stage).toBe('AWAITING_TRIAGE');
    });

    it('should update stage to IN_TRIAGE when syncing IN_PROGRESS triage_status', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'IN_PROGRESS',
          consultation_status: 'WAITING',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.stage).toBe('IN_TRIAGE');
    });

    it('should update stage to AWAITING_CONSULTATION after triage completed', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'WAITING',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.stage).toBe('AWAITING_CONSULTATION');
    });

    it('should update stage to AWAITING_CONSULTATION when patient is called', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'CALLED',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.stage).toBe('AWAITING_CONSULTATION');
    });

    it('should update stage to IN_CONSULTATION when consultation starts', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'IN_PROGRESS',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.stage).toBe('IN_CONSULTATION');
    });

    it('should handle BYPASSED triage correctly', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'BYPASSED',
          consultation_status: 'WAITING',
          triage_bypass_reason: 'STABLE_FOLLOW_UP',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('BYPASSED');
      expect(patient!.triage_bypass_reason).toBe('STABLE_FOLLOW_UP');
      expect(patient!.stage).toBe('AWAITING_CONSULTATION');
    });

    it('should handle NOT_APPLICABLE triage correctly', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'NOT_APPLICABLE',
          consultation_status: 'WAITING',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_status).toBe('NOT_APPLICABLE');
      expect(patient!.stage).toBe('AWAITING_CONSULTATION');
    });

    it('should update triage_category from encounter data', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'WAITING',
          triage_category: 'ORANGE',
        });
      });

      const patient = result.current.activePatients[1];
      expect(patient!.triage_category).toBe('ORANGE');
    });

    it('should not change stage when consultation is COMPLETED (depends on next step)', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        // First set to IN_CONSULTATION
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'IN_PROGRESS',
        });
      });

      const patientBefore = result.current.activePatients[1];
      expect(patientBefore!.stage).toBe('IN_CONSULTATION');

      act(() => {
        // Then sync consultation completed - stage should not be derived
        result.current.syncFromEncounter(1, {
          triage_status: 'COMPLETED',
          consultation_status: 'COMPLETED',
        });
      });

      const patientAfter = result.current.activePatients[1];
      // Stage should remain IN_CONSULTATION (not changed by sync when stage can't be derived)
      expect(patientAfter!.consultation_status).toBe('COMPLETED');
      // Stage is NOT changed by sync when deriveStageFromStatuses returns null
      expect(patientAfter!.stage).toBe('IN_CONSULTATION');
    });
  });

  // ===========================================================================
  // 3. Stage Getter Tests
  // ===========================================================================
  describe('getStageFromStatuses Getter', () => {
    it('should have getStageFromStatuses action', () => {
      const { result } = renderHook(() => usePatientJourneyStore());
      expect(result.current.getStageFromStatuses).toBeDefined();
      expect(typeof result.current.getStageFromStatuses).toBe('function');
    });

    it('should compute stage for a patient based on their statuses', () => {
      const { result } = renderHook(() => usePatientJourneyStore());

      act(() => {
        result.current.registerPatient({
          id: 1,
          mrn: 'MRN-20260105-0001',
          name: 'John Kamau',
        });
        result.current.updateTriageStatus(1, 'COMPLETED');
        result.current.updateConsultationStatus(1, 'CALLED');
      });

      const derivedStage = result.current.getStageFromStatuses(1);
      expect(derivedStage).toBe('AWAITING_CONSULTATION');
    });

    it('should return null for non-existent patient', () => {
      const { result } = renderHook(() => usePatientJourneyStore());
      const derivedStage = result.current.getStageFromStatuses(999);
      expect(derivedStage).toBeNull();
    });
  });
});
