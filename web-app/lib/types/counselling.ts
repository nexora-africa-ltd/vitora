/**
 * Counselling Module Types
 * Sprint Allied Health - Counselling
 */

import {
  BaseAlliedHealthSession,
  AlliedHealthOrderStatus,
  AlliedHealthPriority,
  AlliedHealthSessionStatus,
  AlliedHealthOrderListParams,
  AlliedHealthSessionListParams,
  StaffReference,
  PatientReference,
  SessionOutcome,
} from './allied-health';

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Counselling type/category
 */
export type CounsellingCategory =
  | 'HIV'
  | 'MENTAL_HEALTH'
  | 'GRIEF'
  | 'FAMILY_PLANNING'
  | 'SUBSTANCE_ABUSE'
  | 'TRAUMA'
  | 'RELATIONSHIP'
  | 'CAREER'
  | 'CRISIS'
  | 'YOUTH'
  | 'COUPLES'
  | 'FAMILY'
  | 'PRE_MARITAL'
  | 'ANTENATAL'
  | 'OTHER';

/**
 * Session modality
 */
export type SessionModality = 'IN_PERSON' | 'VIDEO' | 'PHONE' | 'GROUP';

/**
 * Risk assessment level
 */
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

// =============================================================================
// DISPLAY CONFIGURATIONS
// =============================================================================

/**
 * Sensitive counselling categories that require special access
 */
export const SENSITIVE_CATEGORIES: CounsellingCategory[] = [
  'HIV',
  'MENTAL_HEALTH',
  'SUBSTANCE_ABUSE',
  'TRAUMA',
];

export const COUNSELLING_CATEGORY_LABELS: Record<CounsellingCategory, string> = {
  HIV: 'HIV Counselling',
  MENTAL_HEALTH: 'Mental Health',
  GRIEF: 'Grief & Bereavement',
  FAMILY_PLANNING: 'Family Planning',
  SUBSTANCE_ABUSE: 'Substance Abuse',
  TRAUMA: 'Trauma Counselling',
  RELATIONSHIP: 'Relationship Counselling',
  CAREER: 'Career Counselling',
  CRISIS: 'Crisis Intervention',
  YOUTH: 'Youth Counselling',
  COUPLES: 'Couples Therapy',
  FAMILY: 'Family Therapy',
  PRE_MARITAL: 'Pre-Marital Counselling',
  ANTENATAL: 'Antenatal Counselling',
  OTHER: 'Other',
};

export const MODALITY_LABELS: Record<SessionModality, string> = {
  IN_PERSON: 'In Person',
  VIDEO: 'Video Call',
  PHONE: 'Phone Call',
  GROUP: 'Group Session',
};

export const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  LOW: { label: 'Low Risk', variant: 'outline' },
  MODERATE: { label: 'Moderate Risk', variant: 'secondary' },
  HIGH: { label: 'High Risk', variant: 'default', className: 'bg-orange-500' },
  CRITICAL: { label: 'Critical Risk', variant: 'destructive' },
};

// =============================================================================
// COUNSELLING TYPE
// =============================================================================

/**
 * Counselling type catalog entry
 */
export interface CounsellingType {
  id: number;
  code: string;
  name: string;
  description: string;
  category: CounsellingCategory;
  category_display?: string;
  typical_duration_minutes: number;
  recommended_sessions: number;
  recommended_frequency: string;
  cost_per_session: string;
  sha_claimable: boolean;
  sha_intervention_code: string;
  requires_privacy: boolean;
  requires_referral: boolean;
  min_age?: number | null;
  max_age?: number | null;
  gender_specific?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// REFERRAL
// =============================================================================

/**
 * Counselling referral
 */
export interface CounsellingReferral {
  id: number;
  referral_number: string;
  patient: PatientReference;
  patient_id: number;
  encounter_id: number | null;
  clinic_visit_id: number | null;
  referred_by: StaffReference;
  referred_by_id: number;
  assigned_counsellor: StaffReference | null;
  assigned_counsellor_id: number | null;
  counselling_type: CounsellingType;
  counselling_type_id: number;
  status: AlliedHealthOrderStatus;
  priority: AlliedHealthPriority;
  presenting_concern: string;
  background_history: string;
  risk_assessment: string;
  risk_level: RiskLevel;
  goals: string;
  recommended_sessions: number;
  frequency: string;
  preferred_modality: SessionModality;
  is_sensitive: boolean;
  // Computed
  completed_sessions: number;
  total_sessions: number;
  // SHA
  sha_code: string | null;
  sha_claimable: boolean;
  // Timestamps
  referral_date: string;
  accepted_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Counselling referral list item
 */
export interface CounsellingReferralListItem {
  id: number;
  referral_number: string;
  patient_name: string;
  patient_mrn: string;
  counselling_type_name: string;
  category: CounsellingCategory;
  status: AlliedHealthOrderStatus;
  priority: AlliedHealthPriority;
  risk_level: RiskLevel;
  assigned_counsellor_name: string | null;
  completed_sessions: number;
  total_sessions: number;
  is_sensitive: boolean;
  referral_date: string;
  created_at: string;
}

/**
 * Create counselling referral payload
 */
export interface CounsellingReferralCreateData {
  patient_id: number;
  encounter_id?: number;
  counselling_type_id: number;
  priority?: AlliedHealthPriority;
  presenting_concern: string;
  background_history?: string;
  risk_assessment?: string;
  risk_level?: RiskLevel;
  goals?: string;
  recommended_sessions?: number;
  frequency?: string;
  preferred_modality?: SessionModality;
}

/**
 * Update counselling referral payload
 */
export interface CounsellingReferralUpdateData {
  priority?: AlliedHealthPriority;
  presenting_concern?: string;
  background_history?: string;
  risk_assessment?: string;
  risk_level?: RiskLevel;
  goals?: string;
  recommended_sessions?: number;
  frequency?: string;
  preferred_modality?: SessionModality;
}

// =============================================================================
// SESSION
// =============================================================================

/**
 * Counselling session
 */
export interface CounsellingSession extends BaseAlliedHealthSession {
  referral: Pick<CounsellingReferral, 'id' | 'referral_number' | 'counselling_type' | 'patient'>;
  referral_id: number;
  session_sequence: number;
  modality: SessionModality;
  // Session content
  session_focus: string;
  client_presentation: string;
  interventions_used: string;
  client_response: string;
  progress_notes: string;
  // Risk
  current_risk_level: RiskLevel;
  safety_plan_reviewed: boolean;
  safety_plan_notes: string;
  // Homework
  homework_assigned: string;
  homework_review: string;
  // Follow-up
  follow_up_required: boolean;
  next_session_date: string | null;
  next_session_focus: string;
  // Referrals
  additional_referrals: string;
}

/**
 * Counselling session list item
 */
export interface CounsellingSessionListItem {
  id: number;
  session_number: string;
  referral_number: string;
  patient_name: string;
  patient_mrn: string;
  counselling_type_name: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: AlliedHealthSessionStatus;
  modality: SessionModality;
  counsellor_name: string | null;
  session_sequence: number;
  outcome: SessionOutcome | null;
}

/**
 * Create counselling session payload
 */
export interface CounsellingSessionCreateData {
  referral_id: number;
  scheduled_date: string;
  scheduled_time?: string;
  therapist_id?: number;
  modality?: SessionModality;
}

/**
 * Complete counselling session payload
 */
export interface CounsellingSessionCompleteData {
  duration_minutes: number;
  modality: SessionModality;
  session_focus: string;
  client_presentation?: string;
  interventions_used?: string;
  client_response?: string;
  progress_notes?: string;
  current_risk_level: RiskLevel;
  safety_plan_reviewed?: boolean;
  safety_plan_notes?: string;
  homework_assigned?: string;
  outcome: SessionOutcome;
  notes?: string;
  follow_up_required?: boolean;
  next_session_date?: string;
  next_session_focus?: string;
  additional_referrals?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface CounsellingReferralListParams extends AlliedHealthOrderListParams {
  counselling_type_id?: number;
  category?: CounsellingCategory;
  risk_level?: RiskLevel;
  assigned_counsellor_id?: number;
  is_sensitive?: boolean;
}

export interface CounsellingSessionListParams extends AlliedHealthSessionListParams {
  referral_id?: number;
  modality?: SessionModality;
}

export interface CounsellingTypeListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: CounsellingCategory;
  is_active?: boolean;
  sha_claimable?: boolean;
}
