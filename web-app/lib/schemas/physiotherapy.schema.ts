/**
 * Physiotherapy Zod Schemas
 * Sprint Allied Health - Physiotherapy validation
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

export const PhysiotherapyCategorySchema = z.enum([
  'MUSCULOSKELETAL',
  'NEUROLOGICAL',
  'CARDIORESPIRATORY',
  'PEDIATRIC',
  'GERIATRIC',
  'SPORTS',
  'WOMENS_HEALTH',
  'POST_SURGICAL',
  'PAIN_MANAGEMENT',
  'ORTHOPEDIC',
  'VESTIBULAR',
  'OTHER',
]);

// =============================================================================
// TREATMENT TYPE
// =============================================================================

export const PhysiotherapyTreatmentTypeSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: PhysiotherapyCategorySchema,
  default_duration_minutes: z.number(),
  recommended_sessions: z.number(),
  recommended_frequency: z.string(),
  requires_equipment: z.boolean(),
  equipment_needed: z.string().nullable(),
  contraindications: z.string(),
  precautions: z.string(),
  sha_code: z.string().nullable(),
  sha_claimable: z.boolean(),
  unit_price: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedPhysiotherapyTreatmentTypeSchema = createPaginatedSchema(
  PhysiotherapyTreatmentTypeSchema
);

// =============================================================================
// ORDER
// =============================================================================

export const PhysiotherapyOrderSchema = BaseAlliedHealthOrderSchema.extend({
  treatment_type: PhysiotherapyTreatmentTypeSchema,
  treatment_type_id: z.number(),
  assigned_therapist: StaffReferenceSchema.nullable(),
  assigned_therapist_id: z.number().nullable(),
  recommended_sessions: z.number(),
  frequency: z.string(),
  duration_per_session: z.number(),
  equipment_needed: z.string().nullable(),
  contraindications: z.string(),
  precautions: z.string(),
  goals: z.string(),
  completed_sessions: z.number(),
  total_sessions: z.number(),
  progress_percentage: z.number(),
});

export const PhysiotherapyOrderListItemSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  treatment_type_name: z.string(),
  category: PhysiotherapyCategorySchema,
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  assigned_therapist_name: z.string().nullable(),
  completed_sessions: z.number(),
  total_sessions: z.number(),
  created_at: z.string(),
});

export const PaginatedPhysiotherapyOrderListSchema = createPaginatedSchema(
  PhysiotherapyOrderListItemSchema
);

// =============================================================================
// SESSION
// =============================================================================

export const PhysiotherapySessionSchema = BaseAlliedHealthSessionSchema.extend({
  order: z.object({
    id: z.number(),
    order_number: z.string(),
    treatment_type: PhysiotherapyTreatmentTypeSchema,
    patient: PatientReferenceSchema,
  }),
  order_id: z.number(),
  session_sequence: z.number(),
  treatment_provided: z.string(),
  patient_response: z.string(),
  pain_level_before: z.number().nullable(),
  pain_level_after: z.number().nullable(),
  rom_measurements: z.string(),
  strength_assessment: z.string(),
  functional_progress: z.string(),
  home_exercise_given: z.boolean(),
  home_exercise_notes: z.string(),
  follow_up_notes: z.string(),
  next_session_date: z.string().nullable(),
});

export const PhysiotherapySessionListItemSchema = z.object({
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

export const PaginatedPhysiotherapySessionListSchema = createPaginatedSchema(
  PhysiotherapySessionListItemSchema
);

// =============================================================================
// CREATE/UPDATE SCHEMAS
// =============================================================================

export const PhysiotherapyOrderCreateSchema = z.object({
  patient_id: z.number(),
  encounter_id: z.number().optional(),
  treatment_type_id: z.number(),
  priority: AlliedHealthPrioritySchema.optional(),
  clinical_notes: z.string().min(1, 'Clinical notes are required'),
  recommended_sessions: z.number().min(1).optional(),
  frequency: z.string().optional(),
  duration_per_session: z.number().min(5).optional(),
  equipment_needed: z.string().optional(),
  contraindications: z.string().optional(),
  precautions: z.string().optional(),
  goals: z.string().optional(),
});

export const PhysiotherapySessionCompleteSchema = z.object({
  duration_minutes: z.number().min(1, 'Duration is required'),
  treatment_provided: z.string().min(1, 'Treatment provided is required'),
  patient_response: z.string().optional(),
  pain_level_before: z.number().min(0).max(10).optional(),
  pain_level_after: z.number().min(0).max(10).optional(),
  rom_measurements: z.string().optional(),
  strength_assessment: z.string().optional(),
  functional_progress: z.string().optional(),
  home_exercise_given: z.boolean().optional(),
  home_exercise_notes: z.string().optional(),
  outcome: SessionOutcomeSchema,
  notes: z.string().optional(),
  follow_up_notes: z.string().optional(),
  next_session_date: z.string().optional(),
});
