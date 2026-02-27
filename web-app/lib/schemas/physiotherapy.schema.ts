/**
 * Physiotherapy Zod Schemas
 * Sprint Allied Health - Physiotherapy validation
 *
 * IMPORTANT: These schemas match the backend serializers exactly.
 * The backend returns flat IDs + `_name` fields, NOT nested objects.
 * See: backend/tests/test_contracts.py for the authoritative field list.
 */

import { z } from 'zod';
import {
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
  'STROKE',
  'OTHER',
]);

// =============================================================================
// TREATMENT TYPE (matches PhysiotherapyTreatmentTypeSerializer)
// =============================================================================

export const PhysiotherapyTreatmentTypeSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: PhysiotherapyCategorySchema,
  category_display: z.string().optional(),
  typical_duration_minutes: z.number(),
  recommended_sessions: z.number(),
  recommended_frequency: z.string(),
  requires_equipment: z.boolean(),
  equipment_needed: z.string(),
  contraindications: z.string(),
  precautions: z.string(),
  sha_intervention_code: z.string(),
  sha_claimable: z.boolean(),
  cost_per_session: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedPhysiotherapyTreatmentTypeSchema = createPaginatedSchema(
  PhysiotherapyTreatmentTypeSchema
);

// =============================================================================
// ORDER (matches PhysiotherapyOrderSerializer — flat IDs, not nested)
// =============================================================================

export const PhysiotherapyOrderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  // Patient (flat ID + name fields)
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  // Treatment type (flat ID + name/code)
  treatment_type: z.number(),
  treatment_type_name: z.string(),
  treatment_type_code: z.string().optional(),
  // Staff (flat IDs + names)
  ordered_by: z.number(),
  ordered_by_name: z.string(),
  assigned_therapist: z.number().nullable(),
  assigned_therapist_name: z.string().nullable(),
  // Referral details
  referral_reason: z.string().optional(),
  referral_reason_display: z.string().optional(),
  clinical_indication: z.string().optional(),
  relevant_history: z.string().optional(),
  diagnosis: z.string().optional(),
  precautions: z.string().optional(),
  contraindications: z.string().optional(),
  // Sessions
  total_sessions: z.number(),
  sessions_completed: z.number(),
  sessions_remaining: z.number().optional(),
  frequency: z.string().optional(),
  treatment_goals: z.string().optional(),
  // Priority & Status
  priority: AlliedHealthPrioritySchema,
  priority_display: z.string().optional(),
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  status_changed_at: z.string().nullable().optional(),
  // Dates
  start_date: z.string().nullable().optional(),
  expected_end_date: z.string().nullable().optional(),
  // Clinic & billing
  clinic_visit: z.number().nullable().optional(),
  total_cost: z.string().nullable().optional(),
  is_paid: z.boolean().optional(),
  invoice: z.number().nullable().optional(),
  // Progress
  progress_percentage: z.number(),
  // Nested sessions (when included)
  sessions: z.array(z.any()).optional(),
  // Timestamps
  ordered_at: z.string(),
  completed_at: z.string().nullable().optional(),
});

// =============================================================================
// ORDER LIST (matches PhysiotherapyOrderListSerializer)
// =============================================================================

export const PhysiotherapyOrderListItemSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  treatment_type_name: z.string(),
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  priority: AlliedHealthPrioritySchema,
  priority_display: z.string().optional(),
  total_sessions: z.number(),
  sessions_completed: z.number(),
  progress_percentage: z.number(),
  assigned_therapist_name: z.string().nullable(),
  ordered_at: z.string(),
});

export const PaginatedPhysiotherapyOrderListSchema = createPaginatedSchema(
  PhysiotherapyOrderListItemSchema
);

// =============================================================================
// SESSION (matches PhysiotherapySessionSerializer — flat IDs)
// =============================================================================

export const PhysiotherapySessionSchema = z.object({
  id: z.number(),
  order: z.number(),
  therapist: z.number().nullable(),
  therapist_name: z.string().nullable(),
  session_number: z.string(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullable(),
  actual_date: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  status: AlliedHealthSessionStatusSchema,
  status_display: z.string().optional(),
  // Pre-session assessment
  pre_pain_score: z.number().nullable(),
  pre_assessment_notes: z.string().optional(),
  patient_reported_changes: z.string().optional(),
  // Treatment
  interventions: z.string().optional(),
  exercises_performed: z.string().optional(),
  modalities_used: z.string().optional(),
  patient_response: z.string().optional(),
  // Post-session assessment
  post_pain_score: z.number().nullable(),
  outcome: SessionOutcomeSchema.nullable(),
  outcome_display: z.string().optional(),
  progress_notes: z.string().optional(),
  // Home exercises
  home_exercises: z.string().optional(),
  home_exercise_instructions: z.string().optional(),
  // Follow-up
  precautions_advised: z.string().optional(),
  follow_up_recommendations: z.string().optional(),
  next_session_goals: z.string().optional(),
  // Clinic & billing
  clinic_visit: z.number().nullable().optional(),
  is_billed: z.boolean().optional(),
  // Computed
  pain_improvement: z.number().nullable().optional(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable().optional(),
});

// =============================================================================
// SESSION LIST (matches PhysiotherapySessionListSerializer)
// =============================================================================

export const PhysiotherapySessionListItemSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  order: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullable(),
  status: AlliedHealthSessionStatusSchema,
  status_display: z.string().optional(),
  therapist_name: z.string().nullable(),
  outcome: SessionOutcomeSchema.nullable(),
});

export const PaginatedPhysiotherapySessionListSchema = createPaginatedSchema(
  PhysiotherapySessionListItemSchema
);

// =============================================================================
// CREATE/UPDATE SCHEMAS (sent TO backend)
// =============================================================================

export const PhysiotherapyOrderCreateSchema = z.object({
  patient: z.number(),
  encounter: z.number().optional(),
  treatment_type: z.number(),
  priority: AlliedHealthPrioritySchema.optional(),
  clinical_indication: z.string().min(1, 'Clinical indication is required'),
  referral_reason: z.string().optional(),
  relevant_history: z.string().optional(),
  diagnosis: z.string().optional(),
  total_sessions: z.number().min(1).optional(),
  frequency: z.string().optional(),
  treatment_goals: z.string().optional(),
  precautions: z.string().optional(),
  contraindications: z.string().optional(),
});

export const PhysiotherapySessionCompleteSchema = z.object({
  actual_date: z.string().optional(),
  duration_minutes: z.number().min(1, 'Duration is required'),
  pre_pain_score: z.number().min(0).max(10).optional(),
  pre_assessment_notes: z.string().optional(),
  patient_reported_changes: z.string().optional(),
  interventions: z.string().optional(),
  exercises_performed: z.string().optional(),
  modalities_used: z.string().optional(),
  patient_response: z.string().optional(),
  post_pain_score: z.number().min(0).max(10).optional(),
  outcome: SessionOutcomeSchema,
  progress_notes: z.string().optional(),
  home_exercises: z.string().optional(),
  home_exercise_instructions: z.string().optional(),
  precautions_advised: z.string().optional(),
  follow_up_recommendations: z.string().optional(),
  next_session_goals: z.string().optional(),
});
