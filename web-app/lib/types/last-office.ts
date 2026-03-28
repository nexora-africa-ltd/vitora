/**
 * Types for Death Records (Last Office / Morgue)
 */

export type DeathRecordStatus =
  | 'PENDING_CERTIFICATION'
  | 'CERTIFIED'
  | 'REPORTED_TO_CIVIL_REGISTRY'
  | 'RELEASED_TO_FAMILY'
  | 'VOIDED';

export type MannerOfDeath =
  | 'NATURAL'
  | 'ACCIDENT'
  | 'SUICIDE'
  | 'HOMICIDE'
  | 'UNDETERMINED'
  | 'PENDING_INVESTIGATION';

export type PlaceOfDeath =
  | 'INPATIENT'
  | 'EMERGENCY'
  | 'THEATRE'
  | 'ICU'
  | 'BROUGHT_IN_DEAD'
  | 'OTHER';

export type NotificationSource =
  | 'INPATIENT_DISCHARGE'
  | 'EMERGENCY'
  | 'MANUAL_ENTRY'
  | 'CLIENT_REGISTRY';

export type BodyStatus =
  | 'IN_MORGUE'
  | 'RELEASED'
  | 'TRANSFERRED'
  | 'PENDING_COLLECTION';

export interface DeathRecordListItem {
  id: number;
  patient: number;
  patient_mrn: string;
  patient_name: string;
  date_of_death: string;
  time_of_death: string | null;
  manner_of_death: MannerOfDeath;
  manner_of_death_display: string;
  place_of_death: PlaceOfDeath;
  status: DeathRecordStatus;
  status_display: string;
  body_status: BodyStatus;
  body_status_display: string;
  is_voided: boolean;
  is_certified: boolean;
  recorded_by_username: string;
  created_at: string;
}

export interface DeathRecord {
  id: number;
  // Patient
  patient: number;
  patient_mrn: string;
  patient_name: string;
  patient_date_of_birth: string;
  patient_gender: string;
  // Status
  status: DeathRecordStatus;
  status_display: string;
  // Death details
  date_of_death: string;
  time_of_death: string | null;
  manner_of_death: MannerOfDeath;
  manner_of_death_display: string;
  place_of_death: PlaceOfDeath;
  place_of_death_display: string;
  place_of_death_detail: string;
  notification_source: NotificationSource;
  notification_source_display: string;
  // Cause of death
  primary_cause: string;
  primary_cause_icd10: number | null;
  primary_cause_icd10_code: string | null;
  primary_cause_icd10_description: string | null;
  antecedent_cause: string;
  antecedent_cause_icd10: number | null;
  antecedent_cause_icd10_code: string | null;
  antecedent_cause_icd10_description: string | null;
  underlying_cause: string;
  underlying_cause_icd10: number | null;
  underlying_cause_icd10_code: string | null;
  underlying_cause_icd10_description: string | null;
  contributing_conditions: string;
  // Certification
  certified_by: number | null;
  certified_by_username: string | null;
  certified_at: string | null;
  death_certificate_number: string;
  // Morgue / Last Office
  body_status: BodyStatus;
  body_status_display: string;
  morgue_admission_date: string | null;
  morgue_compartment: string;
  released_to: string;
  released_to_id_number: string;
  released_to_relationship: string;
  release_date: string | null;
  burial_permit_number: string;
  // Linked records
  admission: number | null;
  encounter: number | null;
  // Audit
  recorded_by: number;
  recorded_by_username: string;
  notes: string;
  voided_by: number | null;
  voided_by_username: string | null;
  voided_at: string | null;
  void_reason: string;
  // Computed
  is_voided: boolean;
  is_certified: boolean;
  is_released: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface DeathRecordCreateData {
  patient: number;
  date_of_death: string;
  time_of_death?: string;
  manner_of_death?: MannerOfDeath;
  place_of_death?: PlaceOfDeath;
  place_of_death_detail?: string;
  notification_source?: NotificationSource;
  primary_cause: string;
  primary_cause_icd10?: number | null;
  antecedent_cause?: string;
  antecedent_cause_icd10?: number | null;
  underlying_cause?: string;
  underlying_cause_icd10?: number | null;
  contributing_conditions?: string;
  admission?: number | null;
  encounter?: number | null;
  morgue_compartment?: string;
  notes?: string;
}

export interface DeathRecordListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: DeathRecordStatus;
  body_status?: BodyStatus;
  manner_of_death?: MannerOfDeath;
  place_of_death?: PlaceOfDeath;
  patient?: number;
  ordering?: string;
}

export interface CertifyData {
  certificate_number?: string;
}

export interface ReleaseBodyData {
  released_to: string;
  id_number?: string;
  relationship?: string;
  burial_permit_number?: string;
}

export interface VoidData {
  reason: string;
}

// Status badge color mapping
export const DEATH_RECORD_STATUS_COLORS: Record<DeathRecordStatus, string> = {
  PENDING_CERTIFICATION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  CERTIFIED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  REPORTED_TO_CIVIL_REGISTRY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  RELEASED_TO_FAMILY: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  VOIDED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export const BODY_STATUS_COLORS: Record<BodyStatus, string> = {
  IN_MORGUE: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
  RELEASED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  TRANSFERRED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PENDING_COLLECTION: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};
