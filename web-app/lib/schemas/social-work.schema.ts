/**
 * Social Work Zod Schemas
 * Sprint Allied Health - Social Work validation
 *
 * IMPORTANT: These schemas match the backend serializers exactly.
 * The backend returns flat IDs + `_name` fields, NOT nested objects.
 * See: backend/tests/test_contracts.py for the authoritative field list.
 */

import { z } from 'zod';
import {
  AlliedHealthOrderStatusSchema,
  createPaginatedSchema,
} from './allied-health.schema';

// =============================================================================
// ENUMS
// =============================================================================

export const SWReferralReasonSchema = z.enum([
  'GBV',
  'CHILD_PROTECTION',
  'CHILD_ABUSE',
  'ELDER_ABUSE',
  'HOUSING',
  'FINANCIAL',
  'SUBSTANCE_ABUSE',
  'MENTAL_HEALTH',
  'FAMILY_SUPPORT',
  'CHRONIC_ILLNESS',
  'DISABILITY',
  'END_OF_LIFE',
  'REFUGEE',
  'TRAFFICKING',
  'HOMELESSNESS',
  'FOOD_INSECURITY',
  'LEGAL',
  'EMPLOYMENT',
  'EDUCATION',
  'OTHER',
]);

export const SWUrgencySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const SWCaseStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'PENDING_EXTERNAL',
  'CLOSED_RESOLVED',
  'CLOSED_UNRESOLVED',
  'CLOSED_TRANSFERRED',
]);

export const SWCaseTypeSchema = z.enum([
  'CHILD_WELFARE',
  'ADULT_PROTECTION',
  'MENTAL_HEALTH',
  'SUBSTANCE_ABUSE',
  'DOMESTIC_VIOLENCE',
  'HOUSING',
  'FINANCIAL',
  'FAMILY_SUPPORT',
  'CHRONIC_ILLNESS',
  'END_OF_LIFE',
  'REFUGEE',
  'OTHER',
]).optional();

export const SWRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional();

export const SWContactMethodSchema = z.enum([
  'PHONE',
  'IN_PERSON',
  'HOME_VISIT',
  'VIDEO_CALL',
  'EMAIL',
  'OTHER',
]).optional();

export const SWNoteTypeSchema = z.enum([
  'PROGRESS',
  'ASSESSMENT',
  'INTERVENTION',
  'FOLLOW_UP',
  'CASE_CONFERENCE',
  'SUPERVISION',
  'OTHER',
]).optional();

export const SWInterventionTypeSchema = z.enum([
  'COUNSELLING',
  'ADVOCACY',
  'REFERRAL',
  'CASE_MANAGEMENT',
  'CRISIS_INTERVENTION',
  'SUPPORT_GROUP',
  'FINANCIAL_ASSISTANCE',
  'HOUSING_SUPPORT',
  'LEGAL_AID',
  'EDUCATION',
  'SKILLS_TRAINING',
  'OTHER',
]).optional();

export const SWInterventionStatusSchema = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const SWOutcomeRatingSchema = z.enum([
  'EXCELLENT',
  'GOOD',
  'SATISFACTORY',
  'POOR',
  'NOT_APPLICABLE',
]).optional();

// =============================================================================
// REFERRAL (matches SocialWorkReferralSerializer — flat IDs)
// =============================================================================

export const SWReferralSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  // Patient (flat IDs + names)
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  // Staff (flat IDs + names)
  referred_by: z.number(),
  referred_by_name: z.string(),
  assigned_worker: z.number().nullable(),
  assigned_worker_name: z.string().nullable(),
  // Referral details
  reason: z.string(),
  reason_display: z.string().optional(),
  urgency: z.string(),
  urgency_display: z.string().optional(),
  clinical_summary: z.string().optional(),
  presenting_issues: z.string().optional(),
  specific_requests: z.string().optional(),
  risk_factors: z.string().optional(),
  // Status & sensitivity
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  is_sensitive: z.boolean(),
  confidentiality_notes: z.string().optional(),
  // External
  external_agency: z.string().optional(),
  external_contact: z.string().optional(),
  // Clinic
  clinic_visit: z.number().nullable().optional(),
  // Flags
  is_gbv_case: z.boolean(),
  requires_immediate_attention: z.boolean(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  accepted_at: z.string().nullable(),
  completed_at: z.string().nullable().optional(),
});

// =============================================================================
// REFERRAL LIST (matches SocialWorkReferralListSerializer)
// =============================================================================

export const SWReferralListItemSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  reason: z.string(),
  reason_display: z.string().optional(),
  urgency: z.string(),
  urgency_display: z.string().optional(),
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  assigned_worker: z.number().nullable(),
  assigned_worker_name: z.string().nullable(),
  is_sensitive: z.boolean(),
  created_at: z.string(),
  requires_immediate_attention: z.boolean(),
});

export const PaginatedSWReferralListSchema = createPaginatedSchema(SWReferralListItemSchema);

// =============================================================================
// CASE (matches SocialWorkCaseSerializer — flat IDs)
// =============================================================================

export const SWCaseSchema = z.object({
  id: z.number(),
  case_number: z.string(),
  // Patient & referral (flat IDs)
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  referral: z.number(),
  // Staff (flat IDs + names)
  assigned_worker: z.number(),
  assigned_worker_name: z.string(),
  secondary_worker: z.number().nullable().optional(),
  supervisor: z.number().nullable().optional(),
  supervisor_name: z.string().nullable().optional(),
  // Case details
  case_type: z.string().optional(),
  case_type_display: z.string().optional(),
  title: z.string().optional(),
  presenting_problem: z.string().optional(),
  assessment: z.string().optional(),
  psychosocial_history: z.string().optional(),
  family_composition: z.string().optional(),
  support_systems: z.string().optional(),
  strengths: z.string().optional(),
  barriers: z.string().optional(),
  safety_assessment: z.string().optional(),
  // Risk
  risk_level: z.string().optional(),
  risk_level_display: z.string().optional(),
  priority: z.string().optional(),
  priority_display: z.string().optional(),
  // Goals
  goals: z.string().optional(),
  intervention_plan: z.string().optional(),
  // Outcome
  outcome: z.string().optional(),
  outcome_rating: z.string().nullable().optional(),
  // Status & sensitivity
  status: SWCaseStatusSchema,
  status_display: z.string().optional(),
  is_sensitive: z.boolean(),
  confidentiality_level: z.string().optional(),
  // Dates
  next_review_date: z.string().nullable().optional(),
  follow_up_frequency: z.string().optional(),
  opened_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable().optional(),
  // Computed
  is_open: z.boolean(),
  days_open: z.number(),
  is_overdue_for_review: z.boolean(),
  // Counts
  notes_count: z.number(),
  interventions_count: z.number(),
});

// =============================================================================
// CASE LIST (matches SocialWorkCaseListSerializer)
// =============================================================================

export const SWCaseListItemSchema = z.object({
  id: z.number(),
  case_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  case_type: z.string().optional(),
  case_type_display: z.string().optional(),
  title: z.string().optional(),
  risk_level: z.string().optional(),
  risk_level_display: z.string().optional(),
  status: SWCaseStatusSchema,
  status_display: z.string().optional(),
  assigned_worker: z.number(),
  assigned_worker_name: z.string(),
  is_sensitive: z.boolean(),
  next_review_date: z.string().nullable().optional(),
  opened_at: z.string(),
  is_overdue_for_review: z.boolean(),
});

export const PaginatedSWCaseListSchema = createPaginatedSchema(SWCaseListItemSchema);

// =============================================================================
// CASE NOTE (matches CaseNoteSerializer)
// =============================================================================

export const CaseNoteSchema = z.object({
  id: z.number(),
  case: z.number(),
  author: z.number(),
  author_name: z.string(),
  note_type: z.string().optional(),
  note_type_display: z.string().optional(),
  contact_date: z.string(),
  contact_method: z.string().optional(),
  contact_method_display: z.string().optional(),
  duration_minutes: z.number().nullable().optional(),
  subject: z.string().optional(),
  content: z.string(),
  participant_names: z.string().optional(),
  follow_up_required: z.boolean(),
  follow_up_actions: z.string().optional(),
  follow_up_date: z.string().nullable().optional(),
  is_confidential: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedCaseNoteSchema = createPaginatedSchema(CaseNoteSchema);

// =============================================================================
// INTERVENTION (matches SocialWorkInterventionSerializer)
// =============================================================================

export const SWInterventionSchema = z.object({
  id: z.number(),
  case: z.number(),
  provided_by: z.number(),
  provided_by_name: z.string(),
  intervention_type: z.string().optional(),
  intervention_type_display: z.string().optional(),
  description: z.string(),
  objectives: z.string().optional(),
  activities: z.string().optional(),
  status: SWInterventionStatusSchema,
  status_display: z.string().optional(),
  planned_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  completion_date: z.string().nullable().optional(),
  outcome: z.string().optional(),
  outcome_rating: z.string().nullable().optional(),
  outcome_rating_display: z.string().nullable().optional(),
  client_feedback: z.string().optional(),
  external_agency: z.string().optional(),
  external_contact: z.string().optional(),
  cost: z.string().nullable().optional(),
  cost_source: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedSWInterventionSchema = createPaginatedSchema(SWInterventionSchema);

// =============================================================================
// CREATE/UPDATE SCHEMAS (sent TO backend)
// =============================================================================

export const SWReferralCreateSchema = z.object({
  patient: z.number(),
  encounter: z.number().optional(),
  reason: z.string().min(1, 'Reason is required'),
  urgency: SWUrgencySchema.optional(),
  clinical_summary: z.string().optional(),
  presenting_issues: z.string().optional(),
  specific_requests: z.string().optional(),
  risk_factors: z.string().optional(),
  confidentiality_notes: z.string().optional(),
  external_agency: z.string().optional(),
  external_contact: z.string().optional(),
});

export const SWCaseCreateSchema = z.object({
  referral: z.number(),
  case_type: z.string().optional(),
  title: z.string().optional(),
  presenting_problem: z.string().optional(),
  assessment: z.string().optional(),
  goals: z.string().optional(),
  intervention_plan: z.string().optional(),
  next_review_date: z.string().optional(),
});

export const CaseNoteCreateSchema = z.object({
  case: z.number(),
  note_type: z.string().optional(),
  contact_date: z.string(),
  contact_method: z.string().optional(),
  duration_minutes: z.number().optional(),
  subject: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  participant_names: z.string().optional(),
  follow_up_required: z.boolean().optional(),
  follow_up_actions: z.string().optional(),
  follow_up_date: z.string().optional(),
  is_confidential: z.boolean().optional(),
});

export const SWInterventionCreateSchema = z.object({
  case: z.number(),
  intervention_type: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  objectives: z.string().optional(),
  activities: z.string().optional(),
  planned_date: z.string().optional(),
  external_agency: z.string().optional(),
  external_contact: z.string().optional(),
  cost: z.string().optional(),
  cost_source: z.string().optional(),
});
