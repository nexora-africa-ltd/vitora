/**
 * Encounter-related TypeScript types.
 * Enhanced types for clinical encounters, diagnoses, and treatment plans.
 */

export interface Encounter {
  id: number;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;
  
  // Encounter details
  encounter_type: 'OPD' | 'IPD' | 'EMERGENCY';
  encounter_date: string;
  chief_complaint: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  
  // Vitals
  temperature: number | null;
  pulse: number | null;
  blood_pressure: string | null;
  respiratory_rate: number | null;
  spo2: number | null;
  weight: number | null;
  height: number | null;
  
  // Computed vitals
  bmi?: number | null;
  bmi_classification?: string | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  has_critical_vitals?: boolean;
  alerts?: string;
  vitals_summary?: string;
  
  // Medical history
  allergies: string;
  chronic_conditions: string;
  current_medications: string;
  past_surgeries: string;
  family_history: string;
  social_history: string;
  
  // Clinical notes
  notes: string;
  history_of_present_illness?: string;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  
  // Status workflow
  finalized_by?: number | null;
  finalized_by_username?: string | null;
  finalized_at?: string | null;
  cancellation_reason?: string;
  
  // Metadata
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Diagnosis {
  id: number;
  encounter: number;
  icd10_code: number | null;
  icd10_code_display?: string;
  icd10_description?: string;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL';
  free_text_diagnosis?: string;
  notes: string;
  is_confirmed: boolean;
  certainty: 'SUSPECTED' | 'PROBABLE' | 'CONFIRMED';
  diagnosed_by?: number | null;
  diagnosed_by_name?: string;
  diagnosed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlan {
  id: number;
  encounter: number;
  template?: number | null;
  template_name?: string;
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
  created_by_name?: string;
  approved_by?: number | null;
  approved_by_name?: string;
  created_at: string;
  updated_at: string;
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

export interface VitalSign {
  name: string;
  value: number | string | null;
  unit: string;
  normalRange: string;
  isAbnormal: boolean;
  isCritical: boolean;
}

export interface EncounterListParams {
  page?: number;
  page_size?: number;
  patient?: number;
  status?: string;
  encounter_type?: string;
  ordering?: string;
}

// =============================================================================
// Consultation Queue Types (Phase 3.1)
// Aligned with backend hmis/apps/encounters/models.py
// =============================================================================

// Encounter Type Choices - matches ENCOUNTER_TYPE_CHOICES
export type EncounterType =
  // Existing (MANDATORY triage)
  | 'OPD'           // Outpatient Department
  | 'IPD'           // Inpatient Department
  | 'EMERGENCY'     // Emergency
  // High-risk clinics (MANDATORY triage)
  | 'ANC'           // Antenatal Clinic
  | 'PAEDIATRIC'    // Paediatric Clinic
  | 'DIALYSIS'      // Dialysis Unit
  | 'ONCOLOGY'      // Oncology Clinic
  // Scheduled visits (OPTIONAL triage)
  | 'SCHEDULED_OPD' // Scheduled Outpatient
  | 'FOLLOW_UP'     // Follow-up Visit
  | 'CONSULTANT_REVIEW' // Consultant Review
  | 'CHRONIC_STABLE'    // Stable Chronic Care
  | 'SPECIALIST_CLINIC' // Specialist Clinic
  // Pre-assessed (NOT_REQUIRED triage)
  | 'PROCEDURE'     // Scheduled Procedure
  | 'DAY_CASE'      // Day Case
  | 'WARD_ROUND'    // Ward Round
  | 'DISCHARGE_REVIEW'; // Discharge Review

// Display labels for encounter types
export const ENCOUNTER_TYPE_DISPLAY: Record<EncounterType, string> = {
  OPD: 'Outpatient Department',
  IPD: 'Inpatient Department',
  EMERGENCY: 'Emergency',
  ANC: 'Antenatal Clinic',
  PAEDIATRIC: 'Paediatric Clinic',
  DIALYSIS: 'Dialysis Unit',
  ONCOLOGY: 'Oncology Clinic',
  SCHEDULED_OPD: 'Scheduled Outpatient',
  FOLLOW_UP: 'Follow-up Visit',
  CONSULTANT_REVIEW: 'Consultant Review',
  CHRONIC_STABLE: 'Stable Chronic Care',
  SPECIALIST_CLINIC: 'Specialist Clinic',
  PROCEDURE: 'Scheduled Procedure',
  DAY_CASE: 'Day Case',
  WARD_ROUND: 'Ward Round',
  DISCHARGE_REVIEW: 'Discharge Review',
};

// Triage Requirement - matches TRIAGE_REQUIREMENT_CHOICES
export type TriageRequirement = 'MANDATORY' | 'OPTIONAL' | 'NOT_REQUIRED';

// Maps encounter type to triage requirement - matches ENCOUNTER_TYPE_TRIAGE_MAP
export const ENCOUNTER_TYPE_TRIAGE_MAP: Record<EncounterType, TriageRequirement> = {
  // Mandatory triage types
  OPD: 'MANDATORY',
  IPD: 'MANDATORY',
  EMERGENCY: 'MANDATORY',
  ANC: 'MANDATORY',
  PAEDIATRIC: 'MANDATORY',
  DIALYSIS: 'MANDATORY',
  ONCOLOGY: 'MANDATORY',
  // Optional triage types
  SCHEDULED_OPD: 'OPTIONAL',
  FOLLOW_UP: 'OPTIONAL',
  CONSULTANT_REVIEW: 'OPTIONAL',
  CHRONIC_STABLE: 'OPTIONAL',
  SPECIALIST_CLINIC: 'OPTIONAL',
  // Not required triage types
  PROCEDURE: 'NOT_REQUIRED',
  DAY_CASE: 'NOT_REQUIRED',
  WARD_ROUND: 'NOT_REQUIRED',
  DISCHARGE_REVIEW: 'NOT_REQUIRED',
};

// Triage Status - matches TRIAGE_STATUS_CHOICES
export type TriageStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYPASSED' | 'NOT_APPLICABLE';

export const TRIAGE_STATUS_DISPLAY: Record<TriageStatus, string> = {
  PENDING: 'Pending - Awaiting triage',
  IN_PROGRESS: 'In Progress - Being triaged',
  COMPLETED: 'Completed - Triage done',
  BYPASSED: 'Bypassed - Triage skipped',
  NOT_APPLICABLE: 'Not Applicable - Triage not required',
};

// Triage Category (from triage app)
export type TriageCategory = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;

// Triage Bypass Reason - matches TRIAGE_BYPASS_REASON_CHOICES
export type TriageBypassReason =
  | 'STABLE_FOLLOW_UP'      // Stable follow-up patient
  | 'CONSULTANT_DECISION'   // Consultant/senior decision
  | 'CHRONIC_CARE_REVIEW'   // Chronic care review
  | 'STAFF_SHORTAGE'        // Staff shortage
  | 'PATIENT_PREFERENCE'    // Patient preference
  | 'OTHER'                 // Other reason
  | null;

export const TRIAGE_BYPASS_REASON_DISPLAY: Record<Exclude<TriageBypassReason, null>, string> = {
  STABLE_FOLLOW_UP: 'Stable follow-up patient',
  CONSULTANT_DECISION: 'Consultant/senior decision',
  CHRONIC_CARE_REVIEW: 'Chronic care review',
  STAFF_SHORTAGE: 'Staff shortage',
  PATIENT_PREFERENCE: 'Patient preference',
  OTHER: 'Other reason',
};

// Consultation Status - matches CONSULTATION_STATUS_CHOICES
export type ConsultationStatus = 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED';

export const CONSULTATION_STATUS_DISPLAY: Record<ConsultationStatus, string> = {
  WAITING: 'Waiting for consultation',
  CALLED: 'Called - Patient summoned',
  IN_PROGRESS: 'In Progress - Being seen',
  COMPLETED: 'Completed - Consultation done',
};

export interface ConsultationQueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number;
  patient_gender: 'M' | 'F' | 'O';
  encounter_type: string;
  encounter_type_display: string;
  chief_complaint: string;
  triage_status: TriageStatus;
  triage_category: TriageCategory;
  triage_bypass_reason: TriageBypassReason;
  consultation_status: ConsultationStatus;
  arrival_time: string;
  triage_completed_at: string | null;
  wait_time_minutes: number;
  called_at: string | null;
}

export interface ConsultationQueueFilters {
  consultation_status?: ConsultationStatus;
  triage_status?: TriageStatus;
  search?: string;
}

export interface ConsultationQueueStats {
  total: number;
  waiting: number;
  called: number;
  by_category: {
    RED: number;
    ORANGE: number;
    YELLOW: number;
    GREEN: number;
    BLUE: number;
    bypassed: number;
    direct: number;
  };
}

