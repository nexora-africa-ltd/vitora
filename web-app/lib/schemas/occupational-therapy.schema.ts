/**
 * Occupational Therapy Zod Schemas
 * Sprint Allied Health - OT validation
 */

import { z } from 'zod';
import {
  BaseAlliedHealthOrderSchema,
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

export const OTCategorySchema = z.enum([
  'ADL_TRAINING',
  'COGNITIVE_REHAB',
  'HAND_THERAPY',
  'SENSORY_INTEGRATION',
  'PEDIATRIC_OT',
  'MENTAL_HEALTH_OT',
  'WORK_REHAB',
  'HOME_MODIFICATION',
  'ASSISTIVE_TECHNOLOGY',
  'SPLINTING',
  'NEURO_REHAB',
  'GERIATRIC_OT',
  'OTHER',
]);

export const FIMLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

// =============================================================================
// TREATMENT TYPE
// =============================================================================

export const OTTreatmentTypeSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: OTCategorySchema,
  default_duration_minutes: z.number(),
  recommended_sessions: z.number(),
  recommended_frequency: z.string(),
  assessment_tools: z.string(),
  sha_code: z.string().nullable(),
  sha_claimable: z.boolean(),
  unit_price: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedOTTreatmentTypeSchema = createPaginatedSchema(OTTreatmentTypeSchema);

// =============================================================================
// ORDER
// =============================================================================

export const OTOrderSchema = BaseAlliedHealthOrderSchema.extend({
  treatment_type: OTTreatmentTypeSchema,
  treatment_type_id: z.number(),
  assigned_therapist: StaffReferenceSchema.nullable(),
  assigned_therapist_id: z.number().nullable(),
  recommended_sessions: z.number(),
  frequency: z.string(),
  duration_per_session: z.number(),
  baseline_adl_score: FIMLevelSchema.nullable(),
  baseline_iadl_score: FIMLevelSchema.nullable(),
  baseline_cognitive_score: FIMLevelSchema.nullable(),
  short_term_goals: z.string(),
  long_term_goals: z.string(),
  discharge_criteria: z.string(),
  assistive_devices_needed: z.string(),
  home_modifications_needed: z.string(),
  completed_sessions: z.number(),
  total_sessions: z.number(),
  progress_percentage: z.number(),
});

export const OTOrderListItemSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  treatment_type_name: z.string(),
  category: OTCategorySchema,
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  assigned_therapist_name: z.string().nullable(),
  completed_sessions: z.number(),
  total_sessions: z.number(),
  created_at: z.string(),
});

export const PaginatedOTOrderListSchema = createPaginatedSchema(OTOrderListItemSchema);

// =============================================================================
// SESSION
// =============================================================================

export const OTSessionSchema = BaseAlliedHealthSessionSchema.extend({
  order: z.object({
    id: z.number(),
    order_number: z.string(),
    treatment_type: OTTreatmentTypeSchema,
    patient: PatientReferenceSchema,
  }),
  order_id: z.number(),
  session_sequence: z.number(),
  adl_activities: z.string(),
  cognitive_activities: z.string(),
  sensory_activities: z.string(),
  motor_activities: z.string(),
  current_adl_score: FIMLevelSchema.nullable(),
  current_iadl_score: FIMLevelSchema.nullable(),
  current_cognitive_score: FIMLevelSchema.nullable(),
  patient_participation: z.string(),
  barriers_encountered: z.string(),
  adaptations_made: z.string(),
  home_program: z.string(),
  caregiver_training: z.string(),
  equipment_recommendations: z.string(),
  follow_up_notes: z.string(),
  next_session_date: z.string().nullable(),
});

export const OTSessionListItemSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  order_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullable(),
  status: AlliedHealthSessionStatusSchema,
  therapist_name: z.string().nullable(),
  session_sequence: z.number(),
  outcome: SessionOutcomeSchema.nullable(),
});

export const PaginatedOTSessionListSchema = createPaginatedSchema(OTSessionListItemSchema);

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

export const OTOrderCreateSchema = z.object({
  patient_id: z.number(),
  encounter_id: z.number().optional(),
  treatment_type_id: z.number(),
  priority: AlliedHealthPrioritySchema.optional(),
  clinical_notes: z.string().min(1, 'Clinical notes are required'),
  recommended_sessions: z.number().min(1).optional(),
  frequency: z.string().optional(),
  duration_per_session: z.number().min(5).optional(),
  baseline_adl_score: FIMLevelSchema.optional(),
  baseline_iadl_score: FIMLevelSchema.optional(),
  baseline_cognitive_score: FIMLevelSchema.optional(),
  short_term_goals: z.string().optional(),
  long_term_goals: z.string().optional(),
  discharge_criteria: z.string().optional(),
  assistive_devices_needed: z.string().optional(),
  home_modifications_needed: z.string().optional(),
});

export const OTSessionCompleteSchema = z.object({
  duration_minutes: z.number().min(1, 'Duration is required'),
  adl_activities: z.string().optional(),
  cognitive_activities: z.string().optional(),
  sensory_activities: z.string().optional(),
  motor_activities: z.string().optional(),
  current_adl_score: FIMLevelSchema.optional(),
  current_iadl_score: FIMLevelSchema.optional(),
  current_cognitive_score: FIMLevelSchema.optional(),
  patient_participation: z.string().optional(),
  barriers_encountered: z.string().optional(),
  adaptations_made: z.string().optional(),
  home_program: z.string().optional(),
  caregiver_training: z.string().optional(),
  equipment_recommendations: z.string().optional(),
  outcome: SessionOutcomeSchema,
  notes: z.string().optional(),
  follow_up_notes: z.string().optional(),
  next_session_date: z.string().optional(),
});
