/**
 * Social Work Module Types
 * Sprint Allied Health - Social Work
 *
 * IMPORTANT: These types match the backend serializers exactly.
 * The backend returns flat IDs + `_name` fields, NOT nested objects.
 */

import {
  AlliedHealthOrderListParams,
} from './allied-health';

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Social Work Referral status — matches backend SocialWorkReferral.REFERRAL_STATUS.
 * Uses ACCEPTED (not APPROVED) and includes DRAFT + REFERRED_OUT.
 */
export type SWReferralStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFERRED_OUT';

export type SWReferralReason =
  | 'GBV'
  | 'CHILD_PROTECTION'
  | 'CHILD_ABUSE'
  | 'ELDER_ABUSE'
  | 'HOUSING'
  | 'FINANCIAL'
  | 'SUBSTANCE_ABUSE'
  | 'MENTAL_HEALTH'
  | 'FAMILY_SUPPORT'
  | 'CHRONIC_ILLNESS'
  | 'DISABILITY'
  | 'END_OF_LIFE'
  | 'REFUGEE'
  | 'TRAFFICKING'
  | 'HOMELESSNESS'
  | 'FOOD_INSECURITY'
  | 'LEGAL'
  | 'EMPLOYMENT'
  | 'EDUCATION'
  | 'OTHER';

export type SWCaseStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'PENDING_EXTERNAL'
  | 'CLOSED_RESOLVED'
  | 'CLOSED_UNRESOLVED'
  | 'CLOSED_TRANSFERRED';

export type InterventionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ContactMethod = 'PHONE' | 'IN_PERSON' | 'HOME_VISIT' | 'VIDEO_CALL' | 'EMAIL' | 'OTHER';

export type CaseUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// =============================================================================
// DISPLAY CONFIGURATIONS
// =============================================================================

export const SENSITIVE_REASONS: SWReferralReason[] = [
  'GBV',
  'CHILD_PROTECTION',
  'CHILD_ABUSE',
  'ELDER_ABUSE',
  'TRAFFICKING',
];

export const REFERRAL_REASON_LABELS: Record<SWReferralReason, string> = {
  GBV: 'Gender-Based Violence',
  CHILD_PROTECTION: 'Child Protection',
  CHILD_ABUSE: 'Child Abuse',
  ELDER_ABUSE: 'Elder Abuse',
  HOUSING: 'Housing Support',
  FINANCIAL: 'Financial Assistance',
  SUBSTANCE_ABUSE: 'Substance Abuse',
  MENTAL_HEALTH: 'Mental Health Support',
  FAMILY_SUPPORT: 'Family Support',
  CHRONIC_ILLNESS: 'Chronic Illness Support',
  DISABILITY: 'Disability Support',
  END_OF_LIFE: 'End of Life Care',
  REFUGEE: 'Refugee Support',
  TRAFFICKING: 'Human Trafficking',
  HOMELESSNESS: 'Homelessness',
  FOOD_INSECURITY: 'Food Insecurity',
  LEGAL: 'Legal Assistance',
  EMPLOYMENT: 'Employment Support',
  EDUCATION: 'Education Support',
  OTHER: 'Other',
};

export const CASE_STATUS_CONFIG: Record<
  SWCaseStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  OPEN: { label: 'Open', variant: 'default', className: 'bg-blue-500' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default', className: 'bg-green-500' },
  ON_HOLD: { label: 'On Hold', variant: 'secondary', className: 'bg-yellow-500 text-yellow-950' },
  PENDING_EXTERNAL: { label: 'Pending External', variant: 'secondary' },
  CLOSED_RESOLVED: { label: 'Closed (Resolved)', variant: 'outline' },
  CLOSED_UNRESOLVED: { label: 'Closed (Unresolved)', variant: 'outline', className: 'text-muted-foreground' },
  CLOSED_TRANSFERRED: { label: 'Closed (Transferred)', variant: 'outline' },
};

export const URGENCY_CONFIG: Record<
  CaseUrgency,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  LOW: { label: 'Low', variant: 'outline' },
  MEDIUM: { label: 'Medium', variant: 'secondary' },
  HIGH: { label: 'High', variant: 'default', className: 'bg-orange-500' },
  CRITICAL: { label: 'Critical', variant: 'destructive' },
};

// =============================================================================
// REFERRAL (flat IDs — matches SocialWorkReferralSerializer)
// =============================================================================

export interface SWReferral {
  id: number;
  referral_number: string;
  // Patient (flat IDs + names)
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  // Staff (flat IDs + names)
  referred_by: number;
  referred_by_name: string;
  assigned_worker: number | null;
  assigned_worker_name: string | null;
  // Referral details
  reason: string;
  reason_display?: string;
  urgency: string;
  urgency_display?: string;
  clinical_summary?: string;
  presenting_issues?: string;
  specific_requests?: string;
  risk_factors?: string;
  // Status & sensitivity
  status: SWReferralStatus;
  status_display?: string;
  is_sensitive: boolean;
  confidentiality_notes?: string;
  // External
  external_agency?: string;
  external_contact?: string;
  // Clinic
  clinic_visit?: number | null;
  // Flags
  is_gbv_case: boolean;
  requires_immediate_attention: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  completed_at?: string | null;
}

export interface SWReferralListItem {
  id: number;
  referral_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  reason: string;
  reason_display?: string;
  urgency: string;
  urgency_display?: string;
  status: SWReferralStatus;
  status_display?: string;
  assigned_worker: number | null;
  assigned_worker_name: string | null;
  is_sensitive: boolean;
  created_at: string;
  requires_immediate_attention: boolean;
}

export interface SWReferralCreateData {
  patient: number;
  encounter?: number;
  reason: string;
  urgency?: CaseUrgency;
  clinical_summary?: string;
  presenting_issues?: string;
  specific_requests?: string;
  risk_factors?: string;
  confidentiality_notes?: string;
  external_agency?: string;
  external_contact?: string;
}

// =============================================================================
// CASE (flat IDs — matches SocialWorkCaseSerializer)
// =============================================================================

export interface SWCase {
  id: number;
  case_number: string;
  // Patient & referral (flat IDs)
  patient: number;
  patient_name: string;
  patient_mrn: string;
  referral: number;
  // Staff (flat IDs + names)
  assigned_worker: number;
  assigned_worker_name: string;
  secondary_worker?: number | null;
  supervisor?: number | null;
  supervisor_name?: string | null;
  // Case details
  case_type?: string;
  case_type_display?: string;
  title?: string;
  presenting_problem?: string;
  assessment?: string;
  psychosocial_history?: string;
  family_composition?: string;
  support_systems?: string;
  strengths?: string;
  barriers?: string;
  safety_assessment?: string;
  // Risk
  risk_level?: string;
  risk_level_display?: string;
  priority?: string;
  priority_display?: string;
  // Goals
  goals?: string;
  intervention_plan?: string;
  // Outcome
  outcome?: string;
  outcome_rating?: string | null;
  // Status & sensitivity
  status: SWCaseStatus;
  status_display?: string;
  is_sensitive: boolean;
  confidentiality_level?: string;
  // Dates
  next_review_date?: string | null;
  follow_up_frequency?: string;
  opened_at: string;
  updated_at: string;
  closed_at?: string | null;
  // Computed
  is_open: boolean;
  days_open: number;
  is_overdue_for_review: boolean;
  // Counts
  notes_count: number;
  interventions_count: number;
}

export interface SWCaseListItem {
  id: number;
  case_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  case_type?: string;
  case_type_display?: string;
  title?: string;
  risk_level?: string;
  risk_level_display?: string;
  status: SWCaseStatus;
  status_display?: string;
  assigned_worker: number;
  assigned_worker_name: string;
  is_sensitive: boolean;
  next_review_date?: string | null;
  opened_at: string;
  is_overdue_for_review: boolean;
}

export interface SWCaseCreateData {
  referral: number;
  case_type?: string;
  title?: string;
  presenting_problem?: string;
  assessment?: string;
  goals?: string;
  intervention_plan?: string;
  next_review_date?: string;
}

export interface SWCaseUpdateData {
  status?: SWCaseStatus;
  case_type?: string;
  title?: string;
  presenting_problem?: string;
  assessment?: string;
  goals?: string;
  intervention_plan?: string;
  next_review_date?: string;
  risk_level?: string;
  priority?: string;
  outcome?: string;
  outcome_rating?: string;
}

// =============================================================================
// CASE NOTE (flat IDs — matches CaseNoteSerializer)
// =============================================================================

export interface CaseNote {
  id: number;
  case: number;
  author: number;
  author_name: string;
  note_type?: string;
  note_type_display?: string;
  contact_date: string;
  contact_method?: string;
  contact_method_display?: string;
  duration_minutes?: number | null;
  subject?: string;
  content: string;
  participant_names?: string;
  follow_up_required: boolean;
  follow_up_actions?: string;
  follow_up_date?: string | null;
  is_confidential: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaseNoteCreateData {
  case: number;
  note_type?: string;
  contact_date: string;
  contact_method?: string;
  duration_minutes?: number;
  subject?: string;
  content: string;
  participant_names?: string;
  follow_up_required?: boolean;
  follow_up_actions?: string;
  follow_up_date?: string;
  is_confidential?: boolean;
}

// =============================================================================
// INTERVENTION (flat IDs — matches SocialWorkInterventionSerializer)
// =============================================================================

export interface SWIntervention {
  id: number;
  case: number;
  provided_by: number;
  provided_by_name: string;
  intervention_type?: string;
  intervention_type_display?: string;
  description: string;
  objectives?: string;
  activities?: string;
  status: InterventionStatus;
  status_display?: string;
  planned_date?: string | null;
  start_date?: string | null;
  completion_date?: string | null;
  outcome?: string;
  outcome_rating?: string | null;
  outcome_rating_display?: string | null;
  client_feedback?: string;
  external_agency?: string;
  external_contact?: string;
  cost?: string | null;
  cost_source?: string;
  created_at: string;
  updated_at: string;
}

export interface SWInterventionCreateData {
  case: number;
  intervention_type?: string;
  description: string;
  objectives?: string;
  activities?: string;
  planned_date?: string;
  external_agency?: string;
  external_contact?: string;
  cost?: string;
  cost_source?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface SWReferralListParams extends Omit<AlliedHealthOrderListParams, 'status'> {
  status?: SWReferralStatus;
  reason?: SWReferralReason;
  urgency?: CaseUrgency;
  is_sensitive?: boolean;
}

export interface SWCaseListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: SWCaseStatus;
  case_type?: string;
  risk_level?: string;
  assigned_worker_id?: number;
  is_sensitive?: boolean;
}
