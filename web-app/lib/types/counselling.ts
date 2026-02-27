/**
 * Counselling Module Types
 * Sprint Allied Health - Counselling
 *
 * IMPORTANT: These types match the backend serializers exactly.
 * The backend returns flat IDs + `_name` fields, NOT nested objects.
 */

import {
  AlliedHealthOrderStatus,
  AlliedHealthSessionStatus,
  AlliedHealthOrderListParams,
  AlliedHealthSessionListParams,
  SessionOutcome,
} from './allied-health';

// =============================================================================
// ENUMS
// =============================================================================

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

export type SessionModality = 'IN_PERSON' | 'VIDEO' | 'PHONE' | 'GROUP';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

// =============================================================================
// DISPLAY CONFIGURATIONS
// =============================================================================

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
// COUNSELLING TYPE (matches CounsellingTypeSerializer)
// =============================================================================

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
// REFERRAL (flat IDs — matches CounsellingReferralSerializer)
// =============================================================================

export interface CounsellingReferral {
  id: number;
  referral_number: string;
  // Patient (flat IDs + names)
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  // Counselling type (flat ID + name)
  counselling_type: number;
  counselling_type_name: string;
  // Staff
  referred_by: number;
  referred_by_name: string;
  assigned_counsellor: number | null;
  assigned_counsellor_name: string | null;
  // Referral details
  reason: string;
  reason_display?: string;
  urgency: string;
  urgency_display?: string;
  clinical_summary?: string;
  presenting_issues?: string;
  goals?: string;
  risk_assessment?: string;
  // Status
  status: AlliedHealthOrderStatus;
  status_display?: string;
  is_sensitive: boolean;
  is_mental_health_related: boolean;
  is_hiv_related: boolean;
  requires_immediate_attention: boolean;
  // Sessions
  total_sessions: number;
  sessions_completed: number;
  completion_percentage: number;
  // Billing
  is_paid?: boolean;
  invoice?: number | null;
  clinic_visit?: number | null;
  // Completion
  completion_notes?: string;
  cancellation_reason?: string;
  // Nested sessions
  sessions?: unknown[];
  // Timestamps
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by?: number | null;
}

export interface CounsellingReferralListItem {
  id: number;
  referral_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  reason: string;
  reason_display?: string;
  urgency: string;
  urgency_display?: string;
  status: AlliedHealthOrderStatus;
  status_display?: string;
  assigned_counsellor: number | null;
  assigned_counsellor_name: string | null;
  total_sessions: number;
  sessions_completed: number;
  completion_percentage: number;
  is_sensitive: boolean;
  created_at: string;
}

export interface CounsellingReferralCreateData {
  patient: number;
  encounter?: number;
  counselling_type: number;
  urgency?: string;
  reason: string;
  clinical_summary?: string;
  presenting_issues?: string;
  goals?: string;
  risk_assessment?: string;
  total_sessions?: number;
}

export interface CounsellingReferralUpdateData {
  urgency?: string;
  reason?: string;
  clinical_summary?: string;
  presenting_issues?: string;
  goals?: string;
  risk_assessment?: string;
  total_sessions?: number;
}

// =============================================================================
// SESSION (flat IDs — matches CounsellingSessionSerializer)
// =============================================================================

export interface CounsellingSession {
  id: number;
  session_number: string;
  referral: number;
  counsellor: number | null;
  counsellor_name: string | null;
  session_sequence: number;
  scheduled_date: string;
  scheduled_time: string | null;
  actual_date?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  duration_minutes: number | null;
  status: AlliedHealthSessionStatus;
  status_display?: string;
  // Pre-session
  pre_session_mood?: number | null;
  pre_session_notes?: string;
  // Session content
  session_type?: string;
  topics_discussed?: string;
  techniques_used?: string;
  client_responses?: string;
  progress_notes?: string;
  // Post-session
  post_session_mood?: number | null;
  outcome: SessionOutcome | null;
  outcome_display?: string;
  // Risk
  risk_assessment?: string;
  risk_level?: string | null;
  risk_level_display?: string | null;
  safety_plan?: string;
  // Follow-up
  follow_up_required?: boolean;
  follow_up_display?: string;
  follow_up_date?: string | null;
  homework?: string;
  goals_for_next_session?: string;
  // Confidentiality
  confidentiality_level?: string;
  is_sensitive: boolean;
  // Clinic & billing
  clinic_visit?: number | null;
  is_billed?: boolean;
  // Computed
  mood_improvement?: number | null;
  is_overdue?: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface CounsellingSessionListItem {
  id: number;
  session_number: string;
  referral: number;
  counsellor_name: string | null;
  patient_name: string;
  session_sequence: number;
  scheduled_date: string;
  scheduled_time: string | null;
  status: AlliedHealthSessionStatus;
  status_display?: string;
  is_sensitive: boolean;
}

export interface CounsellingSessionCreateData {
  referral: number;
  scheduled_date: string;
  scheduled_time?: string;
  counsellor?: number;
}

export interface CounsellingSessionCompleteData {
  actual_date?: string;
  duration_minutes: number;
  pre_session_mood?: number;
  pre_session_notes?: string;
  session_type?: string;
  topics_discussed?: string;
  techniques_used?: string;
  client_responses?: string;
  progress_notes?: string;
  post_session_mood?: number;
  outcome: SessionOutcome;
  risk_assessment?: string;
  risk_level?: string;
  safety_plan?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  homework?: string;
  goals_for_next_session?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface CounsellingReferralListParams extends AlliedHealthOrderListParams {
  counselling_type_id?: number;
  urgency?: string;
  is_sensitive?: boolean;
}

export interface CounsellingSessionListParams extends AlliedHealthSessionListParams {
  referral_id?: number;
  counsellor_id?: number;
}

export interface CounsellingTypeListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: CounsellingCategory;
  is_active?: boolean;
  sha_claimable?: boolean;
}
