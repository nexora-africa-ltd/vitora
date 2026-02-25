/**
 * Social Work Zod Schemas
 * Sprint Allied Health - Social Work validation
 */

import { z } from 'zod';
import {
  StaffReferenceSchema,
  PatientReferenceSchema,
  AlliedHealthOrderStatusSchema,
  AlliedHealthPrioritySchema,
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

export const SWCaseStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'PENDING_EXTERNAL',
  'CLOSED_RESOLVED',
  'CLOSED_UNRESOLVED',
  'CLOSED_TRANSFERRED',
]);

export const InterventionStatusSchema = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const ContactMethodSchema = z.enum([
  'PHONE',
  'IN_PERSON',
  'HOME_VISIT',
  'VIDEO_CALL',
  'EMAIL',
  'OTHER',
]);

export const CaseUrgencySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// =============================================================================
// REFERRAL
// =============================================================================

export const SWReferralSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  patient: PatientReferenceSchema,
  patient_id: z.number(),
  encounter_id: z.number().nullable(),
  clinic_visit_id: z.number().nullable(),
  referred_by: StaffReferenceSchema,
  referred_by_id: z.number(),
  assigned_worker: StaffReferenceSchema.nullable(),
  assigned_worker_id: z.number().nullable(),
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  referral_reason: SWReferralReasonSchema,
  urgency: CaseUrgencySchema,
  presenting_problem: z.string(),
  background_info: z.string(),
  immediate_needs: z.string(),
  is_sensitive: z.boolean(),
  sha_code: z.string().nullable(),
  sha_claimable: z.boolean(),
  referral_date: z.string(),
  accepted_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SWReferralListItemSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  referral_reason: SWReferralReasonSchema,
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  urgency: CaseUrgencySchema,
  assigned_worker_name: z.string().nullable(),
  is_sensitive: z.boolean(),
  referral_date: z.string(),
  created_at: z.string(),
});

export const PaginatedSWReferralListSchema = createPaginatedSchema(SWReferralListItemSchema);

// =============================================================================
// CASE
// =============================================================================

export const SWCaseSchema = z.object({
  id: z.number(),
  case_number: z.string(),
  referral: z.object({
    id: z.number(),
    referral_number: z.string(),
    referral_reason: SWReferralReasonSchema,
    patient: PatientReferenceSchema,
  }),
  referral_id: z.number(),
  assigned_worker: StaffReferenceSchema,
  assigned_worker_id: z.number(),
  status: SWCaseStatusSchema,
  urgency: CaseUrgencySchema,
  case_summary: z.string(),
  assessment: z.string(),
  goals: z.string(),
  intervention_plan: z.string(),
  is_sensitive: z.boolean(),
  external_agencies: z.string(),
  external_referral_status: z.string(),
  outcome_summary: z.string(),
  closure_reason: z.string(),
  opened_date: z.string(),
  target_closure_date: z.string().nullable(),
  actual_closure_date: z.string().nullable(),
  last_contact_date: z.string().nullable(),
  next_review_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  notes_count: z.number(),
  interventions_count: z.number(),
});

export const SWCaseListItemSchema = z.object({
  id: z.number(),
  case_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  referral_reason: SWReferralReasonSchema,
  status: SWCaseStatusSchema,
  urgency: CaseUrgencySchema,
  assigned_worker_name: z.string(),
  is_sensitive: z.boolean(),
  opened_date: z.string(),
  last_contact_date: z.string().nullable(),
  notes_count: z.number(),
});

export const PaginatedSWCaseListSchema = createPaginatedSchema(SWCaseListItemSchema);

// =============================================================================
// CASE NOTE
// =============================================================================

export const CaseNoteSchema = z.object({
  id: z.number(),
  case: z.object({
    id: z.number(),
    case_number: z.string(),
  }),
  case_id: z.number(),
  author: StaffReferenceSchema,
  author_id: z.number(),
  contact_date: z.string(),
  contact_method: ContactMethodSchema,
  contact_with: z.string(),
  note_content: z.string(),
  actions_taken: z.string(),
  follow_up_required: z.boolean(),
  follow_up_date: z.string().nullable(),
  follow_up_notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedCaseNoteListSchema = createPaginatedSchema(CaseNoteSchema);

// =============================================================================
// INTERVENTION
// =============================================================================

export const SWInterventionSchema = z.object({
  id: z.number(),
  case: z.object({
    id: z.number(),
    case_number: z.string(),
  }),
  case_id: z.number(),
  intervention_type: z.string(),
  description: z.string(),
  status: InterventionStatusSchema,
  planned_date: z.string(),
  actual_date: z.string().nullable(),
  completed_by: StaffReferenceSchema.nullable(),
  completed_by_id: z.number().nullable(),
  outcome: z.string(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedSWInterventionListSchema = createPaginatedSchema(SWInterventionSchema);

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

export const SWReferralCreateSchema = z.object({
  patient_id: z.number(),
  encounter_id: z.number().optional(),
  referral_reason: SWReferralReasonSchema,
  priority: AlliedHealthPrioritySchema.optional(),
  urgency: CaseUrgencySchema.optional(),
  presenting_problem: z.string().min(1, 'Presenting problem is required'),
  background_info: z.string().optional(),
  immediate_needs: z.string().optional(),
});

export const SWCaseCreateSchema = z.object({
  referral_id: z.number(),
  case_summary: z.string().min(1, 'Case summary is required'),
  assessment: z.string().optional(),
  goals: z.string().optional(),
  intervention_plan: z.string().optional(),
  target_closure_date: z.string().optional(),
  next_review_date: z.string().optional(),
});

export const SWCaseUpdateSchema = z.object({
  status: SWCaseStatusSchema.optional(),
  urgency: CaseUrgencySchema.optional(),
  case_summary: z.string().optional(),
  assessment: z.string().optional(),
  goals: z.string().optional(),
  intervention_plan: z.string().optional(),
  external_agencies: z.string().optional(),
  external_referral_status: z.string().optional(),
  outcome_summary: z.string().optional(),
  closure_reason: z.string().optional(),
  target_closure_date: z.string().optional(),
  next_review_date: z.string().optional(),
});

export const CaseNoteCreateSchema = z.object({
  case_id: z.number(),
  contact_date: z.string(),
  contact_method: ContactMethodSchema,
  contact_with: z.string().min(1, 'Contact person is required'),
  note_content: z.string().min(1, 'Note content is required'),
  actions_taken: z.string().optional(),
  follow_up_required: z.boolean().optional(),
  follow_up_date: z.string().optional(),
  follow_up_notes: z.string().optional(),
});

export const SWInterventionCreateSchema = z.object({
  case_id: z.number(),
  intervention_type: z.string().min(1, 'Intervention type is required'),
  description: z.string().min(1, 'Description is required'),
  planned_date: z.string(),
  notes: z.string().optional(),
});
