import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';

describe('useNewEncounterStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useNewEncounterStore.setState({ session: null });
  });

  it('initializes and clears a session', () => {
    const firstId = useNewEncounterStore.getState().initSession();
    const secondId = useNewEncounterStore.getState().initSession();

    expect(firstId).toBe(secondId);
    expect(useNewEncounterStore.getState().hasSession()).toBe(true);
    expect(useNewEncounterStore.getState().getSession()?.sessionId).toBe(firstId);

    useNewEncounterStore.getState().clearSession();
    expect(useNewEncounterStore.getState().hasSession()).toBe(false);
  });

  it('stores patient, details, vitals, history, and notes', () => {
    useNewEncounterStore.getState().initSession();
    useNewEncounterStore.getState().setPatient(1, {
      id: 1,
      mrn: 'MRN-001',
      first_name: 'John',
      last_name: 'Doe',
      full_name: 'John Doe',
    } as never);
    useNewEncounterStore.getState().setDetails({
      encounter_type: 'EMERGENCY',
      encounter_date: '2026-03-15',
      chief_complaint: 'Severe headache',
    });
    useNewEncounterStore.getState().setRecordVitalsNow(true);
    useNewEncounterStore.getState().setVitals({ temperature: 38.5, pulse: 120, spo2: 93 });
    useNewEncounterStore.getState().setHistory({ allergies: 'Penicillin', social_history: 'Smoker' });
    useNewEncounterStore.getState().setNotes({ assessment: 'Likely infection', notes: 'Urgent review' });

    expect(useNewEncounterStore.getState().getPatient().id).toBe(1);
    expect(useNewEncounterStore.getState().getDetails()).toEqual({
      encounter_type: 'EMERGENCY',
      encounter_date: '2026-03-15',
      chief_complaint: 'Severe headache',
    });
    expect(useNewEncounterStore.getState().getRecordVitalsNow()).toBe(true);
    expect(useNewEncounterStore.getState().getVitals().pulse).toBe(120);
    expect(useNewEncounterStore.getState().hasVitals()).toBe(true);
    expect(useNewEncounterStore.getState().getHistory().allergies).toBe('Penicillin');
    expect(useNewEncounterStore.getState().getNotes().assessment).toBe('Likely infection');
    expect(useNewEncounterStore.getState().isDirtyState()).toBe(true);
  });

  it('manages diagnoses and section completion', () => {
    useNewEncounterStore.getState().initSession();

    useNewEncounterStore.getState().addDiagnosis({ icd10_code: 'A01', diagnosis_text: 'Typhoid' } as never);
    useNewEncounterStore.getState().addDiagnosis({ icd10_code: 'B02', diagnosis_text: 'Zoster' } as never);
    useNewEncounterStore.getState().updateDiagnosis(1, { icd10_code: 'B03', diagnosis_text: 'Updated' } as never);
    useNewEncounterStore.getState().removeDiagnosis(0);
    useNewEncounterStore.getState().markSectionComplete('patient');
    useNewEncounterStore.getState().markSectionComplete('details');
    useNewEncounterStore.getState().setDirty(false);

    expect(useNewEncounterStore.getState().getDiagnoses()).toEqual([
      { icd10_code: 'B03', diagnosis_text: 'Updated' },
    ]);
    expect(useNewEncounterStore.getState().getSectionCompletion()).toEqual({
      patient: true,
      details: true,
      vitals: false,
      history: false,
      notes: false,
      diagnosis: false,
    });
    expect(useNewEncounterStore.getState().isDirtyState()).toBe(false);
  });

  it('builds encounter form data from the current session', () => {
    useNewEncounterStore.getState().initSession();
    useNewEncounterStore.getState().setPatient(9, null);
    useNewEncounterStore.getState().setDetails({
      chief_complaint: 'Cough',
      encounter_type: 'OPD',
      encounter_date: '2026-03-15',
    });
    useNewEncounterStore.getState().setVitals({ temperature: 37.2, weight: 70 });
    useNewEncounterStore.getState().setHistory({ allergies: 'Dust', current_medications: 'Paracetamol' });
    useNewEncounterStore.getState().setNotes({
      history_of_present_illness: 'Started two days ago',
      clinical_template: 2,
      clinical_template_data: { respiratory: { cough: true } },
    });

    expect(useNewEncounterStore.getState().getFormData()).toEqual(
      expect.objectContaining({
        patient: 9,
        encounter_type: 'OPD',
        encounter_date: '2026-03-15',
        chief_complaint: 'Cough',
        status: 'CREATED',
        temperature: 37.2,
        weight: 70,
        allergies: 'Dust',
        current_medications: 'Paracetamol',
        history_of_present_illness: 'Started two days ago',
        clinical_template: 2,
        clinical_template_data: { respiratory: { cough: true } },
      })
    );
  });

  it('returns sensible defaults when no session exists', () => {
    expect(useNewEncounterStore.getState().getPatient()).toEqual({ id: null, data: null });
    expect(useNewEncounterStore.getState().getRecordVitalsNow()).toBe(false);
    expect(useNewEncounterStore.getState().getVitals()).toEqual({});
    expect(useNewEncounterStore.getState().hasVitals()).toBe(false);
    expect(useNewEncounterStore.getState().getHistory()).toEqual({});
    expect(useNewEncounterStore.getState().getNotes()).toEqual({});
    expect(useNewEncounterStore.getState().getDiagnoses()).toEqual([]);
    expect(useNewEncounterStore.getState().getSectionCompletion()).toBeNull();
    expect(useNewEncounterStore.getState().isDirtyState()).toBe(false);
    expect(useNewEncounterStore.getState().getFormData()).toBeNull();
  });
});