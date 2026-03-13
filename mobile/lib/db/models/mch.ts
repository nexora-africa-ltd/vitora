import type { ANCVisit, ANCVisitCreateData, ANCVisitListItem, ImmunizationRecord, ImmunizationRecordListItem, MCHRegistration, MCHRegistrationListItem } from '@/lib/types/mch';

import type { LocalANCVisitRecord, LocalImmunizationRecord, LocalMCHRegistrationRecord } from '../schema';

function getVisitDate(record: { created_at?: string; visit_date?: string; updated_at?: string }): number {
  return Date.parse(record.visit_date ?? record.updated_at ?? record.created_at ?? '') || 0;
}

export function toLocalMCHRegistrationRecord(record: MCHRegistration | MCHRegistrationListItem): LocalMCHRegistrationRecord {
  return {
    anc_enrollment: 'anc_enrollment' in record ? record.anc_enrollment : null,
    all_babies_info: 'all_babies_info' in record ? record.all_babies_info : [],
    anc_visit_count: record.anc_visit_count,
    baby: 'baby' in record ? record.baby : null,
    baby_count: 'baby_count' in record ? record.baby_count : 0,
    baby_mrn: 'baby_mrn' in record ? record.baby_mrn : null,
    baby_name: 'baby_name' in record ? record.baby_name : null,
    completed_at: 'completed_at' in record ? record.completed_at : null,
    created_at: record.created_at,
    current_gestation_weeks: record.current_gestation_weeks,
    edd: record.edd,
    gbv_related: 'gbv_related' in record ? record.gbv_related : false,
    gestation_display: record.gestation_display,
    gravida: record.gravida,
    id: record.id,
    inter_pregnancy_interval_days: 'inter_pregnancy_interval_days' in record ? record.inter_pregnancy_interval_days : null,
    is_high_risk: record.is_high_risk,
    is_multiple_pregnancy: 'is_multiple_pregnancy' in record ? record.is_multiple_pregnancy : false,
    is_sensitive: 'is_sensitive' in record ? record.is_sensitive : false,
    linda_jamii_beneficiary: record.linda_jamii_beneficiary,
    mch_number: record.mch_number,
    mother: record.mother,
    mother_mrn: record.mother_mrn,
    mother_name: record.mother_name,
    notes: 'notes' in record ? record.notes : '',
    parity: record.parity,
    pnc_visit_count: 'pnc_visit_count' in record ? record.pnc_visit_count : 0,
    registered_by: 'registered_by' in record ? record.registered_by : null,
    registered_by_name: 'registered_by_name' in record ? record.registered_by_name : null,
    registration_date: record.registration_date,
    risk_factors: 'risk_factors' in record ? record.risk_factors : '',
    sha_claimable: 'sha_claimable' in record ? record.sha_claimable : false,
    status: record.status,
    trimester: record.trimester,
    updated_at: 'updated_at' in record ? record.updated_at : record.created_at,
  };
}

export function sortMCHRegistrations(records: LocalMCHRegistrationRecord[]): LocalMCHRegistrationRecord[] {
  return [...records].sort((left, right) => Date.parse(right.registration_date) - Date.parse(left.registration_date));
}

export function toLocalANCVisitRecord(record: ANCVisit | ANCVisitListItem, syncedAt?: string): LocalANCVisitRecord {
  return {
    alerts: record.alerts,
    blood_pressure: record.blood_pressure,
    blood_sugar: 'blood_sugar' in record ? record.blood_sugar : null,
    calcium_given: 'calcium_given' in record ? record.calcium_given : false,
    clinic_visit: record.clinic_visit ?? null,
    conducted_by: 'conducted_by' in record ? record.conducted_by : null,
    conducted_by_name: 'conducted_by_name' in record ? record.conducted_by_name : null,
    created_at: record.created_at,
    deworming_given: 'deworming_given' in record ? record.deworming_given : false,
    encounter: 'encounter' in record ? record.encounter : null,
    fetal_heart_rate: record.fetal_heart_rate,
    fetal_movements: 'fetal_movements' in record ? record.fetal_movements : null,
    fundal_height: 'fundal_height' in record ? record.fundal_height : null,
    gestation_weeks: record.gestation_weeks,
    hb_level: 'hb_level' in record ? record.hb_level : null,
    hiv_test_done: 'hiv_test_done' in record ? record.hiv_test_done : false,
    id: record.id,
    iron_folate_given: 'iron_folate_given' in record ? record.iron_folate_given : false,
    is_fetal_heart_rate_normal: 'is_fetal_heart_rate_normal' in record ? record.is_fetal_heart_rate_normal : true,
    last_synced_at: syncedAt ?? ('updated_at' in record ? record.updated_at : record.created_at),
    lie: 'lie' in record ? record.lie : '',
    local_only: false,
    next_visit_date: record.next_visit_date,
    notes: 'notes' in record ? record.notes : '',
    presentation: 'presentation' in record ? record.presentation : '',
    registration: record.registration,
    registration_mch_number: 'registration_mch_number' in record ? record.registration_mch_number : '',
    sync_error: null,
    sync_state: 'synced',
    syphilis_test_done: 'syphilis_test_done' in record ? record.syphilis_test_done : false,
    tetanus_toxoid_dose: 'tetanus_toxoid_dose' in record ? record.tetanus_toxoid_dose : null,
    updated_at: 'updated_at' in record ? record.updated_at : record.created_at,
    urine_glucose: 'urine_glucose' in record ? record.urine_glucose : '',
    urine_protein: 'urine_protein' in record ? record.urine_protein : '',
    visit_date: record.visit_date,
    visit_number: record.visit_number,
    weight: record.weight,
  };
}

export function buildOfflineANCVisitRecord(id: number, data: ANCVisitCreateData, registration: LocalMCHRegistrationRecord | null): LocalANCVisitRecord {
  const timestamp = new Date().toISOString();
  return {
    alerts: [],
    blood_pressure: data.blood_pressure ?? '',
    blood_sugar: data.blood_sugar ?? null,
    calcium_given: data.calcium_given ?? false,
    clinic_visit: data.clinic_visit ?? null,
    conducted_by: data.conducted_by ?? null,
    conducted_by_name: null,
    created_at: timestamp,
    deworming_given: data.deworming_given ?? false,
    encounter: data.encounter ?? null,
    fetal_heart_rate: data.fetal_heart_rate ?? null,
    fetal_movements: data.fetal_movements ?? null,
    fundal_height: data.fundal_height ?? null,
    gestation_weeks: registration?.current_gestation_weeks ?? null,
    hb_level: data.hb_level ?? null,
    hiv_test_done: data.hiv_test_done ?? false,
    id,
    iron_folate_given: data.iron_folate_given ?? false,
    is_fetal_heart_rate_normal: data.fetal_heart_rate == null ? true : data.fetal_heart_rate >= 120 && data.fetal_heart_rate <= 160,
    last_synced_at: null,
    lie: data.lie ?? '',
    local_only: true,
    next_visit_date: data.next_visit_date ?? null,
    notes: data.notes ?? '',
    presentation: data.presentation ?? '',
    registration: data.registration,
    registration_mch_number: registration?.mch_number ?? '',
    sync_error: null,
    sync_state: 'pending_create',
    syphilis_test_done: data.syphilis_test_done ?? false,
    tetanus_toxoid_dose: data.tetanus_toxoid_dose ?? null,
    updated_at: timestamp,
    urine_glucose: data.urine_glucose ?? '',
    urine_protein: data.urine_protein ?? '',
    visit_date: data.visit_date ?? timestamp.slice(0, 10),
    visit_number: data.visit_number ?? (registration?.anc_visit_count ?? 0) + 1,
    weight: data.weight ?? null,
  };
}

export function sortANCVisits(records: LocalANCVisitRecord[]): LocalANCVisitRecord[] {
  return [...records].sort((left, right) => getVisitDate(right) - getVisitDate(left));
}

export function toLocalImmunizationRecord(record: ImmunizationRecord | ImmunizationRecordListItem, syncedAt?: string): LocalImmunizationRecord {
  return {
    administered_by: 'administered_by' in record ? record.administered_by : null,
    administered_by_name: 'administered_by_name' in record ? record.administered_by_name : null,
    administered_date: record.administered_date,
    batch_number: 'batch_number' in record ? record.batch_number : '',
    created_at: record.created_at,
    days_overdue: 'days_overdue' in record ? record.days_overdue : null,
    expiry_date: 'expiry_date' in record ? record.expiry_date : null,
    id: record.id,
    is_overdue: record.is_overdue,
    lot_number: 'lot_number' in record ? record.lot_number : '',
    next_dose_date: 'next_dose_date' in record ? record.next_dose_date : null,
    notes: 'notes' in record ? record.notes : '',
    patient: record.patient,
    patient_mrn: 'patient_mrn' in record ? record.patient_mrn : '',
    patient_name: 'patient_name' in record ? record.patient_name : '',
    scheduled_date: record.scheduled_date,
    site: 'site' in record ? record.site : '',
    status: record.status,
    updated_at: 'updated_at' in record ? record.updated_at : record.created_at,
    vaccine: record.vaccine,
    vaccine_code: record.vaccine_code,
    vaccine_name: record.vaccine_name,
    dose_number: record.dose_number,
    last_synced_at: syncedAt ?? ('updated_at' in record ? record.updated_at : record.created_at),
    local_only: false,
    sync_error: null,
    sync_state: 'synced',
  };
}

export function sortImmunizationRecords(records: LocalImmunizationRecord[]): LocalImmunizationRecord[] {
  return [...records].sort((left, right) => Date.parse(left.scheduled_date) - Date.parse(right.scheduled_date));
}