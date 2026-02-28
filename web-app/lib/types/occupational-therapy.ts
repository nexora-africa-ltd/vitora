/**
 * Occupational Therapy Module Types
 * Sprint Allied Health - Occupational Therapy
 *
 * IMPORTANT: These types match the backend serializers exactly.
 * The backend returns flat IDs + `_name` fields, NOT nested objects.
 */

import {
  AlliedHealthOrderStatus,
  AlliedHealthPriority,
  AlliedHealthSessionStatus,
  AlliedHealthOrderListParams,
  AlliedHealthSessionListParams,
  SessionOutcome,
} from './allied-health';

// =============================================================================
// TREATMENT TYPE
// =============================================================================

export type OTCategory =
  | 'ADL_TRAINING'
  | 'COGNITIVE_REHAB'
  | 'HAND_THERAPY'
  | 'SENSORY_INTEGRATION'
  | 'PEDIATRIC_OT'
  | 'MENTAL_HEALTH_OT'
  | 'WORK_REHAB'
  | 'HOME_MODIFICATION'
  | 'ASSISTIVE_TECHNOLOGY'
  | 'SPLINTING'
  | 'NEURO_REHAB'
  | 'GERIATRIC_OT'
  | 'OTHER';

/**
 * Functional Independence Measure (FIM) level
 * 1 = Total Assistance, 7 = Complete Independence
 */
export type FIMLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const FIM_LEVEL_LABELS: Record<FIMLevel, { label: string; description: string }> = {
  1: { label: 'Total Assistance', description: 'Helper does all the activity (patient < 25%)' },
  2: { label: 'Maximal Assistance', description: 'Patient performs 25-49% of effort' },
  3: { label: 'Moderate Assistance', description: 'Patient performs 50-74% of effort' },
  4: { label: 'Minimal Assistance', description: 'Patient performs 75% or more of effort' },
  5: { label: 'Supervision', description: 'Requires cueing, prompting, or setup only' },
  6: { label: 'Modified Independence', description: 'Uses device or extra time but no helper' },
  7: { label: 'Complete Independence', description: 'Performs safely without modification' },
};

export interface OTTreatmentType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: OTCategory;
  category_display?: string;
  typical_duration_minutes: number;
  recommended_sessions: number;
  recommended_frequency: string;
  cost_per_session: string;
  sha_claimable: boolean;
  sha_intervention_code: string;
  requires_equipment: boolean;
  equipment_needed: string;
  contraindications: string;
  precautions: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ORDER (flat IDs — matches OccupationalTherapyOrderSerializer)
// =============================================================================

export interface OTOrder {
  id: number;
  order_number: string;
  // Patient
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  // Treatment type
  treatment_type: number;
  treatment_type_name: string;
  // Staff
  ordered_by: number;
  ordered_by_name: string;
  assigned_therapist: number | null;
  assigned_therapist_name: string | null;
  // Assessment
  assessment_type?: string;
  assessment_type_display?: string;
  // Referral
  referral_reason?: string;
  referral_reason_display?: string;
  clinical_indication?: string;
  relevant_history?: string;
  diagnosis?: string;
  precautions?: string;
  contraindications?: string;
  // Goals
  treatment_goals?: string;
  short_term_goals?: string;
  long_term_goals?: string;
  functional_limitations?: string;
  // Sessions
  total_sessions: number;
  sessions_completed: number;
  sessions_remaining?: number;
  progress_percentage: number;
  frequency?: string;
  // Priority & Status
  priority: AlliedHealthPriority;
  priority_display?: string;
  status: AlliedHealthOrderStatus;
  status_display?: string;
  // Dates
  start_date?: string | null;
  expected_end_date?: string | null;
  // Clinic & billing
  clinic_visit?: number | null;
  total_cost?: string | null;
  is_paid?: boolean;
  invoice?: number | null;
  // Nested sessions
  sessions?: unknown[];
  // Timestamps
  ordered_at: string;
  completed_at?: string | null;
}

export interface OTOrderListItem {
  id: number;
  order_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  treatment_type: number;
  treatment_type_name: string;
  assessment_type?: string;
  assessment_type_display?: string;
  assigned_therapist: number | null;
  assigned_therapist_name: string | null;
  status: AlliedHealthOrderStatus;
  status_display?: string;
  priority: AlliedHealthPriority;
  priority_display?: string;
  total_sessions: number;
  sessions_completed: number;
  progress_percentage: number;
  ordered_at: string;
}

export interface OTOrderCreateData {
  patient: number;
  encounter?: number;
  treatment_type: number;
  priority?: AlliedHealthPriority;
  assessment_type?: string;
  clinical_indication: string;
  referral_reason?: string;
  relevant_history?: string;
  diagnosis?: string;
  total_sessions?: number;
  frequency?: string;
  treatment_goals?: string;
  short_term_goals?: string;
  long_term_goals?: string;
  functional_limitations?: string;
  precautions?: string;
  contraindications?: string;
}

export interface OTOrderUpdateData {
  priority?: AlliedHealthPriority;
  assessment_type?: string;
  clinical_indication?: string;
  referral_reason?: string;
  relevant_history?: string;
  diagnosis?: string;
  total_sessions?: number;
  frequency?: string;
  treatment_goals?: string;
  short_term_goals?: string;
  long_term_goals?: string;
  functional_limitations?: string;
  precautions?: string;
  contraindications?: string;
}

// =============================================================================
// SESSION (flat IDs — matches OTSessionSerializer)
// =============================================================================

export interface OTSession {
  id: number;
  order: number;
  therapist: number | null;
  therapist_name: string | null;
  patient_name?: string | null;
  patient_mrn?: string;
  session_number: number;
  scheduled_date: string;
  scheduled_time: string | null;
  actual_date: string | null;
  duration_minutes: number | null;
  status: AlliedHealthSessionStatus;
  status_display?: string;
  // Pre-session
  pre_functional_status?: string | null;
  pre_functional_status_display?: string | null;
  pre_assessment_notes?: string;
  patient_reported_changes?: string;
  patient_goals_for_session?: string;
  // Activities
  activities_performed?: string;
  adl_activities?: string;
  cognitive_exercises?: string;
  sensory_activities?: string;
  fine_motor_exercises?: string;
  gross_motor_activities?: string;
  adaptive_equipment_training?: string;
  splint_orthotics?: string;
  // Patient response
  patient_response?: string;
  patient_engagement?: string | null;
  patient_engagement_display?: string | null;
  // Post-session
  post_functional_status?: string | null;
  post_functional_status_display?: string | null;
  outcome: SessionOutcome | null;
  outcome_display?: string;
  // Progress
  progress_notes?: string;
  goals_addressed?: string;
  goals_progress?: string;
  // Home program
  home_activities?: string;
  home_activity_instructions?: string;
  caregiver_education?: string;
  environmental_recommendations?: string;
  // Follow-up
  precautions_advised?: string;
  follow_up_recommendations?: string;
  next_session_goals?: string;
  equipment_recommendations?: string;
  // Clinic & billing
  clinic_visit?: number | null;
  is_billed?: boolean;
  // Computed
  functional_improvement?: number | null;
  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface OTSessionListItem {
  id: number;
  session_number: number;
  order: number;
  patient_name?: string | null;
  patient_mrn?: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: AlliedHealthSessionStatus;
  status_display?: string;
  therapist_name: string | null;
  outcome: SessionOutcome | null;
}

export interface OTSessionCreateData {
  order: number;
  scheduled_date: string;
  scheduled_time?: string;
  therapist?: number;
}

export interface OTSessionCompleteData {
  actual_date?: string;
  duration_minutes: number;
  pre_functional_status?: string;
  pre_assessment_notes?: string;
  patient_reported_changes?: string;
  patient_goals_for_session?: string;
  activities_performed?: string;
  adl_activities?: string;
  cognitive_exercises?: string;
  sensory_activities?: string;
  fine_motor_exercises?: string;
  gross_motor_activities?: string;
  adaptive_equipment_training?: string;
  splint_orthotics?: string;
  patient_response?: string;
  patient_engagement?: string;
  post_functional_status?: string;
  outcome: SessionOutcome;
  progress_notes?: string;
  goals_addressed?: string;
  goals_progress?: string;
  home_activities?: string;
  home_activity_instructions?: string;
  caregiver_education?: string;
  environmental_recommendations?: string;
  precautions_advised?: string;
  follow_up_recommendations?: string;
  next_session_goals?: string;
  equipment_recommendations?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface OTOrderListParams extends AlliedHealthOrderListParams {
  treatment_type_id?: number;
  category?: OTCategory;
  assigned_therapist_id?: number;
}

export interface OTSessionListParams extends AlliedHealthSessionListParams {
  order_id?: number;
}

export interface OTTreatmentTypeListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: OTCategory;
  is_active?: boolean;
  sha_claimable?: boolean;
}
