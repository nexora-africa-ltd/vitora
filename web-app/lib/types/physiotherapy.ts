/**
 * Physiotherapy Module Types
 * Sprint Allied Health - Physiotherapy
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
 * Physiotherapy treatment category
 */
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
  | 'VESTIBULAR'
  | 'OTHER';

/**
 * Physiotherapy treatment type catalog entry
 */
export interface PhysiotherapyTreatmentType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: PhysiotherapyCategory;
  default_duration_minutes: number;
  recommended_sessions: number;
  recommended_frequency: string;
  requires_equipment: boolean;
  equipment_needed: string | null;
  contraindications: string;
  precautions: string;
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
 * Physiotherapy order (referral)
 */
export interface PhysiotherapyOrder extends BaseAlliedHealthOrder {
  treatment_type: PhysiotherapyTreatmentType;
  treatment_type_id: number;
  assigned_therapist: StaffReference | null;
  assigned_therapist_id: number | null;
  recommended_sessions: number;
  frequency: string;
  duration_per_session: number;
  equipment_needed: string | null;
  contraindications: string;
  precautions: string;
  goals: string;
  // Computed fields
  completed_sessions: number;
  total_sessions: number;
  progress_percentage: number;
}

/**
 * Physiotherapy order list item (lighter version)
 */
export interface PhysiotherapyOrderListItem {
  id: number;
  order_number: string;
  patient_name: string;
  patient_mrn: string;
  treatment_type_name: string;
  category: PhysiotherapyCategory;
  status: PhysiotherapyOrder['status'];
  priority: PhysiotherapyOrder['priority'];
  assigned_therapist_name: string | null;
  completed_sessions: number;
  total_sessions: number;
  created_at: string;
}

/**
 * Create physiotherapy order payload
 */
export interface PhysiotherapyOrderCreateData {
  patient_id: number;
  encounter_id?: number;
  treatment_type_id: number;
  priority?: PhysiotherapyOrder['priority'];
  clinical_notes: string;
  recommended_sessions?: number;
  frequency?: string;
  duration_per_session?: number;
  equipment_needed?: string;
  contraindications?: string;
  precautions?: string;
  goals?: string;
}

/**
 * Update physiotherapy order payload
 */
export interface PhysiotherapyOrderUpdateData {
  priority?: PhysiotherapyOrder['priority'];
  clinical_notes?: string;
  recommended_sessions?: number;
  frequency?: string;
  duration_per_session?: number;
  equipment_needed?: string;
  contraindications?: string;
  precautions?: string;
  goals?: string;
}

// =============================================================================
// SESSION
// =============================================================================

/**
 * Physiotherapy session
 */
export interface PhysiotherapySession extends BaseAlliedHealthSession {
  order: Pick<PhysiotherapyOrder, 'id' | 'order_number' | 'treatment_type' | 'patient'>;
  order_id: number;
  session_sequence: number;
  treatment_provided: string;
  patient_response: string;
  pain_level_before: number | null;
  pain_level_after: number | null;
  rom_measurements: string;
  strength_assessment: string;
  functional_progress: string;
  home_exercise_given: boolean;
  home_exercise_notes: string;
  follow_up_notes: string;
  next_session_date: string | null;
}

/**
 * Physiotherapy session list item
 */
export interface PhysiotherapySessionListItem {
  id: number;
  session_number: string;
  order_number: string;
  patient_name: string;
  patient_mrn: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: PhysiotherapySession['status'];
  therapist_name: string | null;
  session_sequence: number;
  outcome: SessionOutcome | null;
}

/**
 * Create physiotherapy session payload
 */
export interface PhysiotherapySessionCreateData {
  order_id: number;
  scheduled_date: string;
  scheduled_time?: string;
  therapist_id?: number;
}

/**
 * Complete session payload
 */
export interface PhysiotherapySessionCompleteData {
  duration_minutes: number;
  treatment_provided: string;
  patient_response?: string;
  pain_level_before?: number;
  pain_level_after?: number;
  rom_measurements?: string;
  strength_assessment?: string;
  functional_progress?: string;
  home_exercise_given?: boolean;
  home_exercise_notes?: string;
  outcome: SessionOutcome;
  notes?: string;
  follow_up_notes?: string;
  next_session_date?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

/**
 * Physiotherapy order list params
 */
export interface PhysiotherapyOrderListParams extends AlliedHealthOrderListParams {
  treatment_type_id?: number;
  category?: PhysiotherapyCategory;
  assigned_therapist_id?: number;
}

/**
 * Physiotherapy session list params
 */
export interface PhysiotherapySessionListParams extends AlliedHealthSessionListParams {
  order_id?: number;
}

// =============================================================================
// TREATMENT TYPE LIST PARAMS
// =============================================================================

export interface PhysiotherapyTreatmentTypeListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: PhysiotherapyCategory;
  is_active?: boolean;
  sha_claimable?: boolean;
}
