/**
 * Social Work Module Types
 * Sprint Allied Health - Social Work
 */

import {
  AlliedHealthOrderStatus,
  AlliedHealthPriority,
  AlliedHealthOrderListParams,
  StaffReference,
  PatientReference,
} from './allied-health';

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Social work referral reason
 */
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

/**
 * Social work case status
 */
export type SWCaseStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'PENDING_EXTERNAL'
  | 'CLOSED_RESOLVED'
  | 'CLOSED_UNRESOLVED'
  | 'CLOSED_TRANSFERRED';

/**
 * Intervention status
 */
export type InterventionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * Contact method
 */
export type ContactMethod = 'PHONE' | 'IN_PERSON' | 'HOME_VISIT' | 'VIDEO_CALL' | 'EMAIL' | 'OTHER';

/**
 * Urgency level for cases
 */
export type CaseUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// =============================================================================
// DISPLAY CONFIGURATIONS
// =============================================================================

/**
 * Sensitive referral reasons that require special access
 */
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
// REFERRAL
// =============================================================================

/**
 * Social work referral
 */
export interface SWReferral {
  id: number;
  referral_number: string;
  patient: PatientReference;
  patient_id: number;
  encounter_id: number | null;
  clinic_visit_id: number | null;
  referred_by: StaffReference;
  referred_by_id: number;
  assigned_worker: StaffReference | null;
  assigned_worker_id: number | null;
  status: AlliedHealthOrderStatus;
  priority: AlliedHealthPriority;
  referral_reason: SWReferralReason;
  urgency: CaseUrgency;
  presenting_problem: string;
  background_info: string;
  immediate_needs: string;
  is_sensitive: boolean;
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
 * Social work referral list item
 */
export interface SWReferralListItem {
  id: number;
  referral_number: string;
  patient_name: string;
  patient_mrn: string;
  referral_reason: SWReferralReason;
  status: AlliedHealthOrderStatus;
  priority: AlliedHealthPriority;
  urgency: CaseUrgency;
  assigned_worker_name: string | null;
  is_sensitive: boolean;
  referral_date: string;
  created_at: string;
}

/**
 * Create SW referral payload
 */
export interface SWReferralCreateData {
  patient_id: number;
  encounter_id?: number;
  referral_reason: SWReferralReason;
  priority?: AlliedHealthPriority;
  urgency?: CaseUrgency;
  presenting_problem: string;
  background_info?: string;
  immediate_needs?: string;
}

// =============================================================================
// CASE
// =============================================================================

/**
 * Social work case
 */
export interface SWCase {
  id: number;
  case_number: string;
  referral: Pick<SWReferral, 'id' | 'referral_number' | 'referral_reason' | 'patient'>;
  referral_id: number;
  assigned_worker: StaffReference;
  assigned_worker_id: number;
  status: SWCaseStatus;
  urgency: CaseUrgency;
  case_summary: string;
  assessment: string;
  goals: string;
  intervention_plan: string;
  is_sensitive: boolean;
  // External referrals
  external_agencies: string;
  external_referral_status: string;
  // Outcome
  outcome_summary: string;
  closure_reason: string;
  // Timestamps
  opened_date: string;
  target_closure_date: string | null;
  actual_closure_date: string | null;
  last_contact_date: string | null;
  next_review_date: string | null;
  created_at: string;
  updated_at: string;
  // Counts
  notes_count: number;
  interventions_count: number;
}

/**
 * Social work case list item
 */
export interface SWCaseListItem {
  id: number;
  case_number: string;
  patient_name: string;
  patient_mrn: string;
  referral_reason: SWReferralReason;
  status: SWCaseStatus;
  urgency: CaseUrgency;
  assigned_worker_name: string;
  is_sensitive: boolean;
  opened_date: string;
  last_contact_date: string | null;
  notes_count: number;
}

/**
 * Create SW case payload (from referral)
 */
export interface SWCaseCreateData {
  referral_id: number;
  case_summary: string;
  assessment?: string;
  goals?: string;
  intervention_plan?: string;
  target_closure_date?: string;
  next_review_date?: string;
}

/**
 * Update SW case payload
 */
export interface SWCaseUpdateData {
  status?: SWCaseStatus;
  urgency?: CaseUrgency;
  case_summary?: string;
  assessment?: string;
  goals?: string;
  intervention_plan?: string;
  external_agencies?: string;
  external_referral_status?: string;
  outcome_summary?: string;
  closure_reason?: string;
  target_closure_date?: string;
  next_review_date?: string;
}

// =============================================================================
// CASE NOTE
// =============================================================================

/**
 * Case note entry
 */
export interface CaseNote {
  id: number;
  case: Pick<SWCase, 'id' | 'case_number'>;
  case_id: number;
  author: StaffReference;
  author_id: number;
  contact_date: string;
  contact_method: ContactMethod;
  contact_with: string;
  note_content: string;
  actions_taken: string;
  follow_up_required: boolean;
  follow_up_date: string | null;
  follow_up_notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create case note payload
 */
export interface CaseNoteCreateData {
  case_id: number;
  contact_date: string;
  contact_method: ContactMethod;
  contact_with: string;
  note_content: string;
  actions_taken?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  follow_up_notes?: string;
}

// =============================================================================
// INTERVENTION
// =============================================================================

/**
 * Social work intervention
 */
export interface SWIntervention {
  id: number;
  case: Pick<SWCase, 'id' | 'case_number'>;
  case_id: number;
  intervention_type: string;
  description: string;
  status: InterventionStatus;
  planned_date: string;
  actual_date: string | null;
  completed_by: StaffReference | null;
  completed_by_id: number | null;
  outcome: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create intervention payload
 */
export interface SWInterventionCreateData {
  case_id: number;
  intervention_type: string;
  description: string;
  planned_date: string;
  notes?: string;
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface SWReferralListParams extends AlliedHealthOrderListParams {
  referral_reason?: SWReferralReason;
  urgency?: CaseUrgency;
  assigned_worker_id?: number;
  is_sensitive?: boolean;
}

export interface SWCaseListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: SWCaseStatus;
  urgency?: CaseUrgency;
  assigned_worker_id?: number;
  referral_reason?: SWReferralReason;
  is_sensitive?: boolean;
  date_from?: string;
  date_to?: string;
  ordering?: string;
}

export interface CaseNoteListParams {
  page?: number;
  page_size?: number;
  case_id?: number;
  contact_method?: ContactMethod;
  date_from?: string;
  date_to?: string;
  ordering?: string;
}

export interface SWInterventionListParams {
  page?: number;
  page_size?: number;
  case_id?: number;
  status?: InterventionStatus;
  date_from?: string;
  date_to?: string;
  ordering?: string;
}
