/**
 * Occupational Therapy Module Types
 * Sprint Allied Health - Occupational Therapy
 */

import {
  BaseAlliedHealthOrder,
  BaseAlliedHealthSession,
  AlliedHealthOrderListParams,
  AlliedHealthSessionListParams,
  StaffReference,
  SessionOutcome,
} from './allied-health';

// =============================================================================
// TREATMENT TYPE
// =============================================================================

/**
 * OT treatment category
 */
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

/**
 * FIM level descriptions
 */
export const FIM_LEVEL_LABELS: Record<FIMLevel, { label: string; description: string }> = {
  1: { label: 'Total Assistance', description: 'Helper does all the activity (patient < 25%)' },
  2: { label: 'Maximal Assistance', description: 'Patient performs 25-49% of effort' },
  3: { label: 'Moderate Assistance', description: 'Patient performs 50-74% of effort' },
  4: { label: 'Minimal Assistance', description: 'Patient performs 75% or more of effort' },
  5: { label: 'Supervision', description: 'Requires cueing, prompting, or setup only' },
  6: { label: 'Modified Independence', description: 'Uses device or extra time but no helper' },
  7: { label: 'Complete Independence', description: 'Performs safely without modification' },
};

/**
 * OT treatment type catalog entry
 */
export interface OTTreatmentType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: OTCategory;
  default_duration_minutes: number;
  recommended_sessions: number;
  recommended_frequency: string;
  assessment_tools: string;
  sha_code: string | null;
  sha_claimable: boolean;
  unit_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ORDER
// =============================================================================

/**
 * OT order (referral)
 */
export interface OTOrder extends BaseAlliedHealthOrder {
  treatment_type: OTTreatmentType;
  treatment_type_id: number;
  assigned_therapist: StaffReference | null;
  assigned_therapist_id: number | null;
  recommended_sessions: number;
  frequency: string;
  duration_per_session: number;
  // Functional assessment
  baseline_adl_score: FIMLevel | null;
  baseline_iadl_score: FIMLevel | null;
  baseline_cognitive_score: FIMLevel | null;
  // Goals
  short_term_goals: string;
  long_term_goals: string;
  discharge_criteria: string;
  // Equipment
  assistive_devices_needed: string;
  home_modifications_needed: string;
  // Progress
  completed_sessions: number;
  total_sessions: number;
  progress_percentage: number;
}

/**
 * OT order list item
 */
export interface OTOrderListItem {
  id: number;
  order_number: string;
  patient_name: string;
  patient_mrn: string;
  treatment_type_name: string;
  category: OTCategory;
  status: OTOrder['status'];
  priority: OTOrder['priority'];
  assigned_therapist_name: string | null;
  completed_sessions: number;
  total_sessions: number;
  created_at: string;
}

/**
 * Create OT order payload
 */
export interface OTOrderCreateData {
  patient_id: number;
  encounter_id?: number;
  treatment_type_id: number;
  priority?: OTOrder['priority'];
  clinical_notes: string;
  recommended_sessions?: number;
  frequency?: string;
  duration_per_session?: number;
  baseline_adl_score?: FIMLevel;
  baseline_iadl_score?: FIMLevel;
  baseline_cognitive_score?: FIMLevel;
  short_term_goals?: string;
  long_term_goals?: string;
  discharge_criteria?: string;
  assistive_devices_needed?: string;
  home_modifications_needed?: string;
}

/**
 * Update OT order payload
 */
export interface OTOrderUpdateData {
  priority?: OTOrder['priority'];
  clinical_notes?: string;
  recommended_sessions?: number;
  frequency?: string;
  duration_per_session?: number;
  short_term_goals?: string;
  long_term_goals?: string;
  discharge_criteria?: string;
  assistive_devices_needed?: string;
  home_modifications_needed?: string;
}

// =============================================================================
// SESSION
// =============================================================================

/**
 * OT session
 */
export interface OTSession extends BaseAlliedHealthSession {
  order: Pick<OTOrder, 'id' | 'order_number' | 'treatment_type' | 'patient'>;
  order_id: number;
  session_sequence: number;
  // Activities performed
  adl_activities: string;
  cognitive_activities: string;
  sensory_activities: string;
  motor_activities: string;
  // Assessment scores
  current_adl_score: FIMLevel | null;
  current_iadl_score: FIMLevel | null;
  current_cognitive_score: FIMLevel | null;
  // Progress notes
  patient_participation: string;
  barriers_encountered: string;
  adaptations_made: string;
  home_program: string;
  caregiver_training: string;
  equipment_recommendations: string;
  follow_up_notes: string;
  next_session_date: string | null;
}

/**
 * OT session list item
 */
export interface OTSessionListItem {
  id: number;
  session_number: string;
  order_number: string;
  patient_name: string;
  patient_mrn: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: OTSession['status'];
  therapist_name: string | null;
  session_sequence: number;
  outcome: SessionOutcome | null;
}

/**
 * Create OT session payload
 */
export interface OTSessionCreateData {
  order_id: number;
  scheduled_date: string;
  scheduled_time?: string;
  therapist_id?: number;
}

/**
 * Complete OT session payload
 */
export interface OTSessionCompleteData {
  duration_minutes: number;
  adl_activities?: string;
  cognitive_activities?: string;
  sensory_activities?: string;
  motor_activities?: string;
  current_adl_score?: FIMLevel;
  current_iadl_score?: FIMLevel;
  current_cognitive_score?: FIMLevel;
  patient_participation?: string;
  barriers_encountered?: string;
  adaptations_made?: string;
  home_program?: string;
  caregiver_training?: string;
  equipment_recommendations?: string;
  outcome: SessionOutcome;
  notes?: string;
  follow_up_notes?: string;
  next_session_date?: string;
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
