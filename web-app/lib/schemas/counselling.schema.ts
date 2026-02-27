/**
 * Counselling Zod Schemas
 * Sprint Allied Health - Counselling validation
 *
 * IMPORTANT: These schemas match the backend serializers exactly.
 * The backend returns flat IDs + `_name` fields, NOT nested objects.
 * See: backend/tests/test_contracts.py for the authoritative field list.
 */

import { z } from 'zod';
import {
  AlliedHealthOrderStatusSchema,
  AlliedHealthSessionStatusSchema,
  SessionOutcomeSchema,
  createPaginatedSchema,
} from './allied-health.schema';

// =============================================================================
// ENUMS
// =============================================================================

export const CounsellingCategorySchema = z.enum([
  'HIV',
  'MENTAL_HEALTH',
  'GRIEF',
  'FAMILY_PLANNING',
  'SUBSTANCE_ABUSE',
  'TRAUMA',
  'RELATIONSHIP',
  'CAREER',
  'CRISIS',
  'YOUTH',
  'COUPLES',
  'FAMILY',
  'PRE_MARITAL',
  'ANTENATAL',
  'OTHER',
]);

export const CounsellingUrgencySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const CounsellingRiskLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).optional();

// =============================================================================
// COUNSELLING TYPE (matches CounsellingTypeSerializer)
// =============================================================================

export const CounsellingTypeSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: CounsellingCategorySchema,
  category_display: z.string().optional(),
  typical_duration_minutes: z.number(),
  recommended_sessions: z.number(),
  recommended_frequency: z.string(),
  cost_per_session: z.string(),
  sha_claimable: z.boolean(),
  sha_intervention_code: z.string(),
  requires_privacy: z.boolean(),
  requires_referral: z.boolean(),
  min_age: z.number().nullable().optional(),
  max_age: z.number().nullable().optional(),
  gender_specific: z.string().nullable().optional(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CounsellingTypeListItemSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  category: CounsellingCategorySchema,
  category_display: z.string().optional(),
  cost_per_session: z.string(),
  sha_claimable: z.boolean(),
  is_active: z.boolean(),
});

export const PaginatedCounsellingTypeSchema = createPaginatedSchema(CounsellingTypeSchema);

// =============================================================================
// REFERRAL (matches CounsellingReferralSerializer — flat IDs)
// =============================================================================

export const CounsellingReferralSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  // Patient (flat IDs + names)
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  // Counselling type (flat ID + name)
  counselling_type: z.number(),
  counselling_type_name: z.string(),
  // Staff (flat IDs + names)
  referred_by: z.number(),
  referred_by_name: z.string(),
  assigned_counsellor: z.number().nullable(),
  assigned_counsellor_name: z.string().nullable(),
  // Referral details
  reason: z.string(),
  reason_display: z.string().optional(),
  urgency: z.string(),
  urgency_display: z.string().optional(),
  clinical_summary: z.string().optional(),
  presenting_issues: z.string().optional(),
  goals: z.string().optional(),
  risk_assessment: z.string().optional(),
  // Status
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  is_sensitive: z.boolean(),
  is_mental_health_related: z.boolean(),
  is_hiv_related: z.boolean(),
  requires_immediate_attention: z.boolean(),
  // Sessions
  total_sessions: z.number(),
  sessions_completed: z.number(),
  completion_percentage: z.number(),
  // Billing
  is_paid: z.boolean().optional(),
  invoice: z.number().nullable().optional(),
  clinic_visit: z.number().nullable().optional(),
  // Completion
  completion_notes: z.string().optional(),
  cancellation_reason: z.string().optional(),
  // Nested sessions
  sessions: z.array(z.any()).optional(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  accepted_at: z.string().nullable(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  completed_by: z.number().nullable().optional(),
});

// =============================================================================
// REFERRAL LIST (matches CounsellingReferralListSerializer)
// =============================================================================

export const CounsellingReferralListItemSchema = z.object({
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
  assigned_counsellor: z.number().nullable(),
  assigned_counsellor_name: z.string().nullable(),
  total_sessions: z.number(),
  sessions_completed: z.number(),
  completion_percentage: z.number(),
  is_sensitive: z.boolean(),
  created_at: z.string(),
});

export const PaginatedCounsellingReferralListSchema = createPaginatedSchema(
  CounsellingReferralListItemSchema
);

// =============================================================================
// SESSION (matches CounsellingSessionSerializer — flat IDs)
// =============================================================================

export const CounsellingSessionSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  referral: z.number(),
  counsellor: z.number().nullable(),
  counsellor_name: z.string().nullable(),
  session_sequence: z.number(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullable(),
  actual_date: z.string().nullable().optional(),
  actual_start_time: z.string().nullable().optional(),
  actual_end_time: z.string().nullable().optional(),
  duration_minutes: z.number().nullable(),
  status: AlliedHealthSessionStatusSchema,
  status_display: z.string().optional(),
  // Pre-session
  pre_session_mood: z.number().nullable().optional(),
  pre_session_notes: z.string().optional(),
  // Session content
  session_type: z.string().optional(),
  topics_discussed: z.string().optional(),
  techniques_used: z.string().optional(),
  client_responses: z.string().optional(),
  progress_notes: z.string().optional(),
  // Post-session
  post_session_mood: z.number().nullable().optional(),
  outcome: SessionOutcomeSchema.nullable(),
  outcome_display: z.string().optional(),
  // Risk
  risk_assessment: z.string().optional(),
  risk_level: z.string().nullable().optional(),
  risk_level_display: z.string().nullable().optional(),
  safety_plan: z.string().optional(),
  // Follow-up
  follow_up_required: z.boolean().optional(),
  follow_up_display: z.string().optional(),
  follow_up_date: z.string().nullable().optional(),
  homework: z.string().optional(),
  goals_for_next_session: z.string().optional(),
  // Confidentiality
  confidentiality_level: z.string().optional(),
  is_sensitive: z.boolean(),
  // Clinic & billing
  clinic_visit: z.number().nullable().optional(),
  is_billed: z.boolean().optional(),
  // Computed
  mood_improvement: z.number().nullable().optional(),
  is_overdue: z.boolean().optional(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable().optional(),
});

// =============================================================================
// SESSION LIST (matches CounsellingSessionListSerializer)
// =============================================================================

export const CounsellingSessionListItemSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  referral: z.number(),
  counsellor_name: z.string().nullable(),
  patient_name: z.string(),
  session_sequence: z.number(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullable(),
  status: AlliedHealthSessionStatusSchema,
  status_display: z.string().optional(),
  is_sensitive: z.boolean(),
});

export const PaginatedCounsellingSessionListSchema = createPaginatedSchema(
  CounsellingSessionListItemSchema
);

// =============================================================================
// CREATE/UPDATE SCHEMAS (sent TO backend)
// =============================================================================

export const CounsellingReferralCreateSchema = z.object({
  patient: z.number(),
  encounter: z.number().optional(),
  counselling_type: z.number(),
  urgency: CounsellingUrgencySchema.optional(),
  reason: z.string().min(1, 'Reason is required'),
  clinical_summary: z.string().optional(),
  presenting_issues: z.string().optional(),
  goals: z.string().optional(),
  risk_assessment: z.string().optional(),
  total_sessions: z.number().min(1).optional(),
});

export const CounsellingSessionCompleteSchema = z.object({
  actual_date: z.string().optional(),
  duration_minutes: z.number().min(1, 'Duration is required'),
  pre_session_mood: z.number().min(1).max(10).optional(),
  pre_session_notes: z.string().optional(),
  session_type: z.string().optional(),
  topics_discussed: z.string().optional(),
  techniques_used: z.string().optional(),
  client_responses: z.string().optional(),
  progress_notes: z.string().optional(),
  post_session_mood: z.number().min(1).max(10).optional(),
  outcome: SessionOutcomeSchema,
  risk_assessment: z.string().optional(),
  risk_level: z.string().optional(),
  safety_plan: z.string().optional(),
  follow_up_required: z.boolean().optional(),
  follow_up_date: z.string().optional(),
  homework: z.string().optional(),
  goals_for_next_session: z.string().optional(),
});
