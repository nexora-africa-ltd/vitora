import {
  deriveStageFromStatuses,
  selectPatientById,
  selectPatientsAwaitingAdmission,
  selectPatientsAwaitingConsultation,
  selectPatientsAwaitingImaging,
  selectPatientsAwaitingLab,
  selectPatientsAwaitingPharmacy,
  selectPatientsAwaitingTriage,
  usePatientJourneyStore,
} from '@/lib/stores/patient-journey';

describe('patient-journey helpers', () => {
  it('derives stages from triage and consultation statuses', () => {
    expect(deriveStageFromStatuses('PENDING', 'WAITING')).toBe('AWAITING_TRIAGE');
    expect(deriveStageFromStatuses('IN_PROGRESS', 'WAITING')).toBe('IN_TRIAGE');
    expect(deriveStageFromStatuses('COMPLETED', 'WAITING')).toBe('AWAITING_CONSULTATION');
    expect(deriveStageFromStatuses('BYPASSED', 'WAITING')).toBe('AWAITING_CONSULTATION');
    expect(deriveStageFromStatuses('NOT_APPLICABLE', 'WAITING')).toBe('AWAITING_CONSULTATION');
    expect(deriveStageFromStatuses('COMPLETED', 'CALLED')).toBe('AWAITING_CONSULTATION');
    expect(deriveStageFromStatuses('COMPLETED', 'IN_PROGRESS')).toBe('IN_CONSULTATION');
    expect(deriveStageFromStatuses('COMPLETED', 'COMPLETED')).toBeNull();
  });
});

describe('usePatientJourneyStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    usePatientJourneyStore.setState({
      activePatients: {},
      selectedPatientId: null,
      isLoading: false,
    });
  });

  it('tracks outpatient flow from registration through consultation', () => {
    const store = usePatientJourneyStore.getState();
    store.registerPatient({ id: 1, mrn: 'MRN-001', name: 'John Doe', gender: 'M' });
    store.checkInPatient(1, { encounter_id: 10, encounter_type: 'OPD', chief_complaint: 'Headache' });
    store.addToWaitingQueue(1);
    store.startTriage(1);
    store.completeTriage(1, {
      assessment_id: 99,
      triage_category: 'YELLOW',
      assigned_area: 'General',
    });
    store.callPatient(1);
    store.startConsultation(1, 7, 'Dr. House');
    store.endConsultation(1, 'Stable', 'A01');

    const patient = usePatientJourneyStore.getState().getPatient(1);
    expect(patient?.mrn).toBe('MRN-001');
    expect(patient?.encounter_id).toBe(10);
    expect(patient?.triage_assessment_id).toBe(99);
    expect(patient?.triage_category).toBe('YELLOW');
    expect(patient?.consultation_status).toBe('COMPLETED');
    expect(patient?.assigned_clinician_name).toBe('Dr. House');
    expect(patient?.primary_diagnosis).toBe('A01');
    expect(patient?.stage).toBe('AWAITING_DISCHARGE');
    expect(patient?.timestamps.arrival_time).toBeTruthy();
    expect(patient?.timestamps.triage_start_time).toBeTruthy();
    expect(patient?.timestamps.consultation_end_time).toBeTruthy();
  });

  it('tracks lab, imaging, pharmacy, billing, and admission transitions', () => {
    const store = usePatientJourneyStore.getState();
    store.registerPatient({ id: 2, mrn: 'MRN-002', name: 'Jane Doe' });
    store.checkInPatient(2, { priority_hint: 'URGENT' });
    store.addLabOrder(2, { id: 101, test_name: 'CBC', status: 'PENDING', is_urgent: true });
    store.markLabCollected(2, 101);
    store.markLabCompleted(2, 101);
    store.addImagingOrder(2, { id: 201, modality: 'XRAY', body_part: 'Chest', status: 'PENDING', is_urgent: false });
    store.markImagingPerformed(2, 201);
    store.markImagingReported(2, 201);
    store.addPharmacyOrder(2, { id: 301, prescription_id: 55, medication_count: 2, status: 'PENDING' });
    store.markPharmacyReady(2, 301);
    store.markPharmacyDispensed(2, 301);
    store.setBilling(2, {
      invoice_id: 1,
      total_amount: 2000,
      amount_paid: 0,
      payment_status: 'PENDING',
      sha_claim_status: 'PENDING',
      last_updated: '',
    });
    store.updateBillingStatus(2, 'PAID', 2000);
    store.recommendAdmission(2, { recommendation_id: 88, recommended_by: 'Dr. Smith', reason: 'Observation' });
    store.assignBed(2, 'B-01', 'Medical Ward');
    store.admitPatient(2, 500);
    store.startDischargePlanning(2);
    store.dischargePatient(2);

    const patient = usePatientJourneyStore.getState().getPatient(2);
    expect(patient?.has_pending_lab).toBe(false);
    expect(patient?.has_pending_imaging).toBe(false);
    expect(patient?.has_pending_pharmacy).toBe(false);
    expect(patient?.billing?.payment_status).toBe('PAID');
    expect(patient?.billing?.amount_paid).toBe(2000);
    expect(patient?.admission?.bed_assigned).toBe('B-01');
    expect(patient?.admission?.admission_id).toBe(500);
    expect(patient?.stage).toBe('DISCHARGED');
    expect(patient?.timestamps.billing_completed_at).toBeTruthy();
    expect(patient?.timestamps.admission_recommended_at).toBeTruthy();
    expect(patient?.timestamps.discharge_time).toBeTruthy();
  });

  it('handles bypass, sync, selectors, and cleanup operations', () => {
    const store = usePatientJourneyStore.getState();
    store.registerPatient({ id: 3, mrn: 'MRN-003', name: 'Mary Wanjiku' });
    store.bypassTriage(3, 'CONSULTANT_DECISION');
    store.updateConsultationStatus(3, 'WAITING');
    store.syncFromEncounter(3, {
      triage_status: 'BYPASSED',
      consultation_status: 'WAITING',
      triage_bypass_reason: 'CONSULTANT_DECISION',
      triage_category: 'GREEN',
    });
    store.sendToLab(3);
    store.sendToImaging(3);
    store.sendToPharmacy(3);
    store.sendToBilling(3);
    store.moveToStage(3, 'ADMISSION_RECOMMENDED');
    store.selectPatient(3);
    store.setEncounter(3, 77, 'EMERGENCY');
    store.updatePatient(3, { notes: 'Priority patient' });
    store.setLoading(true);

    const state = usePatientJourneyStore.getState();
    expect(state.getStageFromStatuses(3)).toBe('AWAITING_CONSULTATION');
    expect(state.getSelectedPatient()?.id).toBe(3);
    expect(state.getArrivalTime(3)).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.getPatientsAwaitingAdmission()).toHaveLength(1);
    expect(selectPatientById(3)(state)?.encounter_id).toBe(77);
    expect(selectPatientsAwaitingAdmission(state)).toHaveLength(1);
    expect(selectPatientsAwaitingConsultation(state)).toHaveLength(0);
    expect(selectPatientsAwaitingLab(state)).toHaveLength(0);
    expect(selectPatientsAwaitingImaging(state)).toHaveLength(0);
    expect(selectPatientsAwaitingPharmacy(state)).toHaveLength(0);
    expect(selectPatientsAwaitingTriage(state)).toHaveLength(0);

    state.markLeftWithoutBeingSeen(3);
    expect(usePatientJourneyStore.getState().getPatient(3)?.stage).toBe('LEFT_WITHOUT_BEING_SEEN');

    state.removePatient(3);
    expect(usePatientJourneyStore.getState().getPatient(3)).toBeUndefined();

    state.registerPatient({ id: 4, mrn: 'MRN-004', name: 'Another Patient' });
    state.clearAllPatients();
    expect(Object.keys(usePatientJourneyStore.getState().activePatients)).toHaveLength(0);
  });
});
