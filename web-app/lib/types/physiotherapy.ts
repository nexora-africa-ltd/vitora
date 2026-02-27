/**
 * Physiotherapy Module Types
 * Sprint Allied Health - Physiotherapy
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

export type PhysiotherapyCategory =
  | 'MUSCULOSKELETAL'
  | 'NEUROLOGICAL'
  | 'CARDIORESPIRATORY'
  | 'PEDIATRIC'
  | 'GERIATRIC'
  | 'SPORTS'
  | 'WOMENS_HEALTH'
  | 'POST_SURGICAL'
  | 'PAIN_MANAGEMENT'
  | 'ORTHOPEDIC'
  | 'STROKE'
  | 'OTHER';

export interface PhysiotherapyTreatmentType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: PhysiotherapyCategory;
  category_display?: string;
  typical_duration_minutes: number;
  recommended_sessions: number;
  recommended_frequency: string;
  requires_equipment: boolean;
  equipment_needed: string;
  contraindications: string;
  precautions: string;
  sha_intervention_code: string;
  sha_claimable: boolean;
  cost_per_session: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ORDER (flat IDs — matches PhysiotherapyOrderSerializer)
// =============================================================================

export interface PhysiotherapyOrder {
  id: number;
  order_number: string;
  // Patient (flat ID + name)
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  // Treatment type (flat ID + name/code)
  treatment_type: number;
  treatment_type_name: string;
  treatment_type_code?: string;
  // Staff (flat IDs + names)
  ordered_by: number;
  ordered_by_name: string;
  assigned_therapist: number | null;
  assigned_therapist_name: string | null;
  // Referral details
  referral_reason?: string;
  referral_reason_display?: string;
  clinical_indication?: string;
  relevant_history?: string;
  diagnosis?: string;
  precautions?: string;
  contraindications?: string;
  // Sessions
  total_sessions: number;
  sessions_completed: number;
  sessions_remaining?: number;
  frequency?: string;
  treatment_goals?: string;
  // Priority & Status
  priority: AlliedHealthPriority;
  priority_display?: string;
  status: AlliedHealthOrderStatus;
  status_display?: string;
  status_changed_at?: string | null;
  // Dates
  start_date?: string | null;
  expected_end_date?: string | null;
  // Clinic & billing
  clinic_visit?: number | null;
  total_cost?: string | null;
  is_paid?: boolean;
  invoice?: number | null;
  // Progress
  progress_percentage: number;
  // Nested sessions
  sessions?: unknown[];
  // Timestamps
  ordered_at: string;
  completed_at?: string | null;
}

export interface PhysiotherapyOrderListItem {
  id: number;
  order_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  treatment_type_name: string;
  status: AlliedHealthOrderStatus;
  status_display?: string;
  priority: AlliedHealthPriority;
  priority_display?: string;
  total_sessions: number;
  sessions_completed: number;
  progress_percentage: number;
  assigned_therapist_name: string | null;
  ordered_at: string;
}

export interface PhysiotherapyOrderCreateData {
  patient: number;
  encounter?: number;
  treatment_type: number;
  priority?: AlliedHealthPriority;
  clinical_indication: string;
  referral_reason?: string;
  relevant_history?: string;
  diagnosis?: string;
  total_sessions?: number;
  frequency?: string;
  treatment_goals?: string;
  precautions?: string;
  contraindications?: string;
}

export interface PhysiotherapyOrderUpdateData {
  priority?: AlliedHealthPriority;
  clinical_indication?: string;
  referral_reason?: string;
  relevant_history?: string;
  diagnosis?: string;
  total_sessions?: number;
  frequency?: string;
  treatment_goals?: string;
  precautions?: string;
  contraindications?: string;
}

// =============================================================================
// SESSION (flat IDs — matches PhysiotherapySessionSerializer)
// =============================================================================

export interface PhysiotherapySession {
  id: number;
  order: number;
  therapist: number | null;
  therapist_name: string | null;
  session_number: string;
  scheduled_date: string;
  scheduled_time: string | null;
  actual_date: string | null;
  duration_minutes: number | null;
  status: AlliedHealthSessionStatus;
  status_display?: string;
  // Pre-session
  pre_pain_score: number | null;
  pre_assessment_notes?: string;
  patient_reported_changes?: string;
  // Treatment
  interventions?: string;
  exercises_performed?: string;
  modalities_used?: string;
  patient_response?: string;
  // Post-session
  post_pain_score: number | null;
  outcome: SessionOutcome | null;
  outcome_display?: string;
  progress_notes?: string;
  // Home exercises
  home_exercises?: string;
  home_exercise_instructions?: string;
  // Follow-up
  precautions_advised?: string;
  follow_up_recommendations?: string;
  next_session_goals?: string;
  // Clinic & billing
  clinic_visit?: number | null;
  is_billed?: boolean;
  // Computed
  pain_improvement?: number | null;
  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface PhysiotherapySessionListItem {
  id: number;
  session_number: string;
  order: number;
  patient_name: string;
  patient_mrn: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: AlliedHealthSessionStatus;
  status_display?: string;
  therapist_name: string | null;
  outcome: SessionOutcome | null;
}

export interface PhysiotherapySessionCreateData {
  order: number;
  scheduled_date: string;
  scheduled_time?: string;
  therapist?: number;
}

export interface PhysiotherapySessionCompleteData {
  actual_date?: string;
  duration_minutes: number;
  pre_pain_score?: number;
  pre_assessment_notes?: string;
  patient_reported_changes?: string;
  interventions?: string;
  exercises_performed?: string;
  modalities_used?: string;
  patient_response?: string;
  post_pain_score?: number;
  outcome: SessionOutcome;
  progress_notes?: string;
  home_exercises?: string;
  home_exercise_instructions?: string;
  precautions_advised?: string;
  follow_up_recommendations?: string;
  next_session_goals?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface PhysiotherapyOrderListParams extends AlliedHealthOrderListParams {
  treatment_type_id?: number;
  category?: PhysiotherapyCategory;
  assigned_therapist_id?: number;
}

export interface PhysiotherapySessionListParams extends AlliedHealthSessionListParams {
  order_id?: number;
}

export interface PhysiotherapyTreatmentTypeListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: PhysiotherapyCategory;
  is_active?: boolean;
  sha_claimable?: boolean;
}
