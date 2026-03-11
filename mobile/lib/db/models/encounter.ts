import type { Encounter, EncounterCreateData } from '@/lib/types/encounter';
import type { LocalPatientRecord } from '../schema';

import type { LocalEncounterRecord } from '../schema';

export function toLocalEncounterRecord(encounter: Encounter, syncedAt?: string): LocalEncounterRecord {
  return {
    ...encounter,
    local_only: false,
    sync_error: null,
    sync_state: 'synced',
    last_synced_at: syncedAt ?? encounter.updated_at ?? encounter.created_at,
  };
}

export function buildOfflineEncounterRecord(id: number, data: EncounterCreateData, patient?: LocalPatientRecord | null): LocalEncounterRecord {
  const timestamp = new Date().toISOString();
  const derivedPatientName = [patient?.first_name, patient?.middle_name, patient?.last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const patientName = patient?.full_name ?? derivedPatientName;

  return {
    id,
    patient: data.patient,
    patient_id: data.patient,
    patient_name: patientName || null,
    patient_mrn: patient?.mrn ?? null,
    patient_gender: patient?.gender ?? null,
    patient_date_of_birth: patient?.date_of_birth ?? null,
    patient_age: patient?.age ?? null,
    encounter_type: data.encounter_type,
    encounter_type_display: null,
    encounter_date: data.encounter_date,
    chief_complaint: data.chief_complaint.trim(),
    status: 'CREATED',
    arrival_time: null,
    temperature: data.temperature ?? null,
    pulse: data.pulse ?? null,
    blood_pressure: data.blood_pressure ?? null,
    systolic_bp: null,
    diastolic_bp: null,
    respiratory_rate: data.respiratory_rate ?? null,
    spo2: data.spo2 ?? null,
    vitals_source: null,
    vitals_recorded_by: null,
    vitals_recorded_at: null,
    weight: data.weight ?? null,
    height: data.height ?? null,
    bmi: null,
    bmi_classification: null,
    vitals_summary: null,
    has_critical_vitals: typeof data.spo2 === 'number' ? data.spo2 < 95 : false,
    alerts: typeof data.spo2 === 'number' && data.spo2 < 95 ? 'Low oxygen saturation pending server sync.' : null,
    allergies: data.allergies ?? null,
    chronic_conditions: data.chronic_conditions ?? null,
    current_medications: data.current_medications ?? null,
    past_surgeries: data.past_surgeries ?? null,
    family_history: data.family_history ?? null,
    social_history: data.social_history ?? null,
    notes: data.notes ?? null,
    history_of_present_illness: data.history_of_present_illness ?? null,
    physical_examination: data.physical_examination ?? null,
    assessment: data.assessment ?? null,
    clinical_template: null,
    clinical_template_data: null,
    disposition: data.disposition ?? null,
    disposition_notes: data.disposition_notes ?? null,
    cancellation_reason: null,
    triage_requirement: null,
    triage_status: null,
    triage_category: null,
    triage_completed_at: null,
    consultation_status: null,
    linked_encounter: null,
    visit_reason: null,
    created_by: null,
    created_by_name: null,
    assigned_clinician: null,
    assigned_clinician_username: null,
    assigned_clinician_name: null,
    claimed_at: null,
    clinic_visit_id: null,
    clinic_name: null,
    clinic_type: null,
    finalized_by: null,
    finalized_by_username: null,
    finalized_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync_error: null,
    sync_state: 'pending_create',
    last_synced_at: null,
  };
}

export function matchesEncounterSearch(encounter: LocalEncounterRecord, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const haystack = [
    encounter.patient_name,
    encounter.patient_mrn,
    encounter.chief_complaint,
    encounter.encounter_type,
    encounter.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedSearch);
}

export function sortEncounters(records: LocalEncounterRecord[]): LocalEncounterRecord[] {
  return [...records].sort((left, right) => {
    const rightTime = Date.parse(right.created_at || right.encounter_date);
    const leftTime = Date.parse(left.created_at || left.encounter_date);
    return rightTime - leftTime;
  });
}