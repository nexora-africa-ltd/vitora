import type { EncounterStatus, Gender } from './common';

export type EncounterType =
  | 'OPD'
  | 'EMERGENCY'
  | 'IPD'
  | 'ANC'
  | 'PAEDIATRIC'
  | 'DIALYSIS'
  | 'ONCOLOGY'
  | 'SCHEDULED_OPD'
  | 'FOLLOW_UP'
  | 'CONSULTANT_REVIEW'
  | 'CHRONIC_STABLE'
  | 'SPECIALIST_CLINIC'
  | 'PROCEDURE'
  | 'DAY_CASE'
  | 'WARD_ROUND'
  | 'DISCHARGE_REVIEW';

export interface Encounter {
  id: number;
  patient: number;
  patient_id?: number | null;
  patient_name?: string | null;
  patient_mrn?: string | null;
  patient_gender?: Gender | null;
  patient_date_of_birth?: string | null;
  patient_age?: number | null;
  encounter_type: EncounterType;
  encounter_type_display?: string | null;
  encounter_date: string;
  chief_complaint: string;
  status: EncounterStatus;
  arrival_time?: string | null;
  temperature?: number | null;
  pulse?: number | null;
  blood_pressure?: string | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  vitals_source?: string | null;
  vitals_recorded_by?: number | null;
  vitals_recorded_at?: string | null;
  weight?: number | null;
  height?: number | null;
  bmi?: number | null;
  bmi_classification?: string | null;
  vitals_summary?: string | null;
  has_critical_vitals?: boolean;
  alerts?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  current_medications?: string | null;
  past_surgeries?: string | null;
  family_history?: string | null;
  social_history?: string | null;
  notes?: string | null;
  history_of_present_illness?: string | null;
  physical_examination?: string | null;
  assessment?: string | null;
  clinical_template?: number | null;
  clinical_template_data?: Record<string, unknown> | null;
  disposition?: string | null;
  disposition_notes?: string | null;
  cancellation_reason?: string | null;
  triage_requirement?: string | null;
  triage_status?: string | null;
  triage_category?: string | null;
  triage_completed_at?: string | null;
  consultation_status?: string | null;
  linked_encounter?: number | null;
  visit_reason?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  assigned_clinician?: number | null;
  assigned_clinician_username?: string | null;
  assigned_clinician_name?: string | null;
  claimed_at?: string | null;
  clinic_visit_id?: number | null;
  clinic_name?: string | null;
  clinic_type?: string | null;
  finalized_by?: number | null;
  finalized_by_username?: string | null;
  finalized_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface EncounterCreateData {
  patient: number;
  encounter_type: EncounterType;
  encounter_date: string;
  chief_complaint: string;
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  allergies?: string;
  chronic_conditions?: string;
  current_medications?: string;
  past_surgeries?: string;
  family_history?: string;
  social_history?: string;
  notes?: string;
  history_of_present_illness?: string;
  physical_examination?: string;
  assessment?: string;
  disposition?: string;
  disposition_notes?: string;
}

export interface EncounterQuickConsultationData {
  patient: number;
  chief_complaint?: string;
  encounter_type?: EncounterType;
}

export interface EncounterUpdateData extends Partial<EncounterCreateData> {}

export interface EncounterTransitionResponse {
  id: number;
  status: EncounterStatus;
  previous_status: EncounterStatus;
  transitioned_at: string;
  transitioned_by: string;
}

export interface EncounterTransitionInput {
  to_status: EncounterStatus;
  reason?: string;
}

export interface ICD10Code {
  id: number;
  code: string;
  short_description?: string | null;
  description: string;
  long_description?: string | null;
  category?: string | null;
  chapter?: string | null;
  is_billable: boolean;
  is_active: boolean;
}

export interface Diagnosis {
  id: number;
  encounter: number;
  icd10_code: number | null;
  icd10_code_display?: string | null;
  icd10_description?: string | null;
  icd11_code?: string | null;
  icd11_display?: string | null;
  // SNOMED CT (supplementary coding for FHIR interoperability)
  snomed_code?: string | null;
  snomed_display?: string | null;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
  free_text_diagnosis?: string | null;
  notes: string;
  is_confirmed: boolean;
  certainty: 'suspected' | 'probable' | 'confirmed' | 'ruled_out' | 'provisional';
  diagnosed_by?: number | null;
  diagnosed_by_name?: string | null;
  diagnosed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnosisInput {
  icd10_code?: number | null;
  icd11_code?: string;
  icd11_display?: string;
  snomed_code?: string;
  snomed_display?: string;
  diagnosis_type: Diagnosis['diagnosis_type'];
  free_text_diagnosis?: string;
  notes?: string;
  is_confirmed?: boolean;
  certainty?: Diagnosis['certainty'];
}

export interface Medication {
  id: number;
  treatment_plan: number;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  instructions: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TreatmentPlan {
  id: number;
  encounter: number;
  template?: number | null;
  template_name?: string | null;
  clinical_notes: string;
  medications_json: unknown;
  procedures_json: unknown;
  follow_up_instructions: string;
  follow_up_date: string | null;
  diet_recommendations: string;
  activity_restrictions: string;
  referral_needed: boolean;
  referral_specialty: string;
  referral_notes: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED';
  has_follow_up?: boolean;
  has_referral?: boolean;
  medications: Medication[];
  created_by?: number | null;
  created_by_name?: string | null;
  approved_by?: number | null;
  approved_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlanInput {
  template?: number | null;
  clinical_notes?: string;
  medications_json?: unknown;
  procedures_json?: unknown;
  follow_up_instructions?: string;
  follow_up_date?: string | null;
  diet_recommendations?: string;
  activity_restrictions?: string;
  referral_needed?: boolean;
  referral_specialty?: string;
  referral_notes?: string;
  status?: TreatmentPlan['status'];
}

export interface EncounterListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  search?: string;
  ordering?: string;
  status?: string;
  modified_after?: string;
}