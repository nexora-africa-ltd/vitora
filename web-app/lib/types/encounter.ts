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
// =============================================================================

export type TriageStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYPASSED' | 'NOT_APPLICABLE';
export type TriageCategory = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
export type ConsultationStatus = 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED';
export type TriageBypassReason = 
  | 'FOLLOW_UP' 
  | 'CONSULTANT_REVIEW' 
  | 'STABLE_CHRONIC' 
  | 'EMERGENCY_STABILIZED' 
  | 'CLINICIAN_DISCRETION' 
  | 'SYSTEM_OVERRIDE'
  | null;

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

