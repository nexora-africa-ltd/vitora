/**
 * Counselling Zod Schemas
 * Sprint Allied Health - Counselling validation
 */

import { z } from 'zod';
import {
  BaseAlliedHealthSessionSchema,
  StaffReferenceSchema,
  PatientReferenceSchema,
  AlliedHealthOrderStatusSchema,
  AlliedHealthPrioritySchema,
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

export const SessionModalitySchema = z.enum(['IN_PERSON', 'VIDEO', 'PHONE', 'GROUP']);

export const RiskLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

// =============================================================================
// COUNSELLING TYPE
// =============================================================================

export const CounsellingTypeSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: CounsellingCategorySchema,
  default_duration_minutes: z.number(),
  recommended_sessions: z.number(),
  recommended_frequency: z.string(),
  requires_followup: z.boolean(),
  sha_code: z.string().nullable(),
  sha_claimable: z.boolean(),
  unit_price: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedCounsellingTypeSchema = createPaginatedSchema(CounsellingTypeSchema);

// =============================================================================
// REFERRAL
// =============================================================================

export const CounsellingReferralSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  patient: PatientReferenceSchema,
  patient_id: z.number(),
  encounter_id: z.number().nullable(),
  clinic_visit_id: z.number().nullable(),
  referred_by: StaffReferenceSchema,
  referred_by_id: z.number(),
  assigned_counsellor: StaffReferenceSchema.nullable(),
  assigned_counsellor_id: z.number().nullable(),
  counselling_type: CounsellingTypeSchema,
  counselling_type_id: z.number(),
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  presenting_concern: z.string(),
  background_history: z.string(),
  risk_assessment: z.string(),
  risk_level: RiskLevelSchema,
  goals: z.string(),
  recommended_sessions: z.number(),
  frequency: z.string(),
  preferred_modality: SessionModalitySchema,
  is_sensitive: z.boolean(),
  completed_sessions: z.number(),
  total_sessions: z.number(),
  sha_code: z.string().nullable(),
  sha_claimable: z.boolean(),
  referral_date: z.string(),
  accepted_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CounsellingReferralListItemSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  counselling_type_name: z.string(),
  category: CounsellingCategorySchema,
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  risk_level: RiskLevelSchema,
  assigned_counsellor_name: z.string().nullable(),
  completed_sessions: z.number(),
  total_sessions: z.number(),
  is_sensitive: z.boolean(),
  referral_date: z.string(),
  created_at: z.string(),
});

export const PaginatedCounsellingReferralListSchema = createPaginatedSchema(
  CounsellingReferralListItemSchema
);

// =============================================================================
// SESSION
// =============================================================================

export const CounsellingSessionSchema = BaseAlliedHealthSessionSchema.extend({
  referral: z.object({
    id: z.number(),
    referral_number: z.string(),
    counselling_type: CounsellingTypeSchema,
    patient: PatientReferenceSchema,
  }),
  referral_id: z.number(),
  session_sequence: z.number(),
  modality: SessionModalitySchema,
  session_focus: z.string(),
  client_presentation: z.string(),
  interventions_used: z.string(),
  client_response: z.string(),
  progress_notes: z.string(),
  current_risk_level: RiskLevelSchema,
  safety_plan_reviewed: z.boolean(),
  safety_plan_notes: z.string(),
  homework_assigned: z.string(),
  homework_review: z.string(),
  follow_up_required: z.boolean(),
  next_session_date: z.string().nullable(),
  next_session_focus: z.string(),
  additional_referrals: z.string(),
});

export const CounsellingSessionListItemSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  referral_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  counselling_type_name: z.string(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullable(),
  status: AlliedHealthSessionStatusSchema,
  modality: SessionModalitySchema,
  counsellor_name: z.string().nullable(),
  session_sequence: z.number(),
  outcome: SessionOutcomeSchema.nullable(),
});

export const PaginatedCounsellingSessionListSchema = createPaginatedSchema(
  CounsellingSessionListItemSchema
);

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

export const CounsellingReferralCreateSchema = z.object({
  patient_id: z.number(),
  encounter_id: z.number().optional(),
  counselling_type_id: z.number(),
  priority: AlliedHealthPrioritySchema.optional(),
  presenting_concern: z.string().min(1, 'Presenting concern is required'),
  background_history: z.string().optional(),
  risk_assessment: z.string().optional(),
  risk_level: RiskLevelSchema.optional(),
  goals: z.string().optional(),
  recommended_sessions: z.number().min(1).optional(),
  frequency: z.string().optional(),
  preferred_modality: SessionModalitySchema.optional(),
});

export const CounsellingReferralUpdateSchema = z.object({
  priority: AlliedHealthPrioritySchema.optional(),
  presenting_concern: z.string().optional(),
  background_history: z.string().optional(),
  risk_assessment: z.string().optional(),
  risk_level: RiskLevelSchema.optional(),
  goals: z.string().optional(),
  recommended_sessions: z.number().min(1).optional(),
  frequency: z.string().optional(),
  preferred_modality: SessionModalitySchema.optional(),
});

export const CounsellingSessionCreateSchema = z.object({
  referral_id: z.number(),
  scheduled_date: z.string(),
  scheduled_time: z.string().optional(),
  therapist_id: z.number().optional(),
  modality: SessionModalitySchema.optional(),
});

export const CounsellingSessionCompleteSchema = z.object({
  duration_minutes: z.number().min(1, 'Duration is required'),
  modality: SessionModalitySchema,
  session_focus: z.string().min(1, 'Session focus is required'),
  client_presentation: z.string().optional(),
  interventions_used: z.string().optional(),
  client_response: z.string().optional(),
  progress_notes: z.string().optional(),
  current_risk_level: RiskLevelSchema,
  safety_plan_reviewed: z.boolean().optional(),
  safety_plan_notes: z.string().optional(),
  homework_assigned: z.string().optional(),
  outcome: SessionOutcomeSchema,
  notes: z.string().optional(),
  follow_up_required: z.boolean().optional(),
  next_session_date: z.string().optional(),
  next_session_focus: z.string().optional(),
  additional_referrals: z.string().optional(),
});
