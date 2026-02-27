/**
 * Occupational Therapy Zod Schemas
 * Sprint Allied Health - OT validation
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

export const OTAssessmentTypeSchema = z.enum([
  'INITIAL',
  'FOLLOW_UP',
  'DISCHARGE',
  'RE_EVALUATION',
]).optional();

export const OTFunctionalStatusSchema = z.enum([
  'INDEPENDENT',
  'MODIFIED_INDEPENDENT',
  'SUPERVISION',
  'MINIMAL_ASSISTANCE',
  'MODERATE_ASSISTANCE',
  'MAXIMAL_ASSISTANCE',
  'TOTAL_ASSISTANCE',
]).optional();

export const OTPatientEngagementSchema = z.enum([
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'POOR',
  'UNCOOPERATIVE',
]).optional();

// =============================================================================
// TREATMENT TYPE (matches OTTreatmentTypeSerializer)
// =============================================================================

export const OTTreatmentTypeSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: OTCategorySchema,
  category_display: z.string().optional(),
  typical_duration_minutes: z.number(),
  recommended_sessions: z.number(),
  recommended_frequency: z.string(),
  cost_per_session: z.string(),
  sha_claimable: z.boolean(),
  sha_intervention_code: z.string(),
  requires_equipment: z.boolean(),
  equipment_needed: z.string(),
  contraindications: z.string(),
  precautions: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const OTTreatmentTypeListItemSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  category: OTCategorySchema,
  category_display: z.string().optional(),
  cost_per_session: z.string(),
  sha_claimable: z.boolean(),
  is_active: z.boolean(),
});

export const PaginatedOTTreatmentTypeSchema = createPaginatedSchema(OTTreatmentTypeSchema);

// =============================================================================
// ORDER (matches OccupationalTherapyOrderSerializer — flat IDs)
// =============================================================================

export const OTOrderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  // Patient (flat ID + name fields)
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  // Treatment type (flat ID + name)
  treatment_type: z.number(),
  treatment_type_name: z.string(),
  // Staff
  ordered_by: z.number(),
  ordered_by_name: z.string(),
  assigned_therapist: z.number().nullable(),
  assigned_therapist_name: z.string().nullable(),
  // Assessment
  assessment_type: z.string().optional(),
  assessment_type_display: z.string().optional(),
  // Referral
  referral_reason: z.string().optional(),
  referral_reason_display: z.string().optional(),
  clinical_indication: z.string().optional(),
  relevant_history: z.string().optional(),
  diagnosis: z.string().optional(),
  precautions: z.string().optional(),
  contraindications: z.string().optional(),
  // Goals
  treatment_goals: z.string().optional(),
  short_term_goals: z.string().optional(),
  long_term_goals: z.string().optional(),
  functional_limitations: z.string().optional(),
  // Sessions
  total_sessions: z.number(),
  sessions_completed: z.number(),
  sessions_remaining: z.number().optional(),
  progress_percentage: z.number(),
  frequency: z.string().optional(),
  // Priority & Status
  priority: AlliedHealthPrioritySchema,
  priority_display: z.string().optional(),
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  // Dates
  start_date: z.string().nullable().optional(),
  expected_end_date: z.string().nullable().optional(),
  // Clinic & billing
  clinic_visit: z.number().nullable().optional(),
  total_cost: z.string().nullable().optional(),
  is_paid: z.boolean().optional(),
  invoice: z.number().nullable().optional(),
  // Nested sessions
  sessions: z.array(z.any()).optional(),
  // Timestamps
  ordered_at: z.string(),
  completed_at: z.string().nullable().optional(),
});

// =============================================================================
// ORDER LIST (matches OccupationalTherapyOrderListSerializer)
// =============================================================================

export const OTOrderListItemSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  treatment_type: z.number(),
  treatment_type_name: z.string(),
  assessment_type: z.string().optional(),
  assessment_type_display: z.string().optional(),
  assigned_therapist: z.number().nullable(),
  assigned_therapist_name: z.string().nullable(),
  status: AlliedHealthOrderStatusSchema,
  status_display: z.string().optional(),
  priority: AlliedHealthPrioritySchema,
  priority_display: z.string().optional(),
  total_sessions: z.number(),
  sessions_completed: z.number(),
  progress_percentage: z.number(),
  ordered_at: z.string(),
});

export const PaginatedOTOrderListSchema = createPaginatedSchema(OTOrderListItemSchema);

// =============================================================================
// SESSION (matches OTSessionSerializer — flat IDs)
// =============================================================================

export const OTSessionSchema = z.object({
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
  // Pre-session
  pre_functional_status: z.string().nullable().optional(),
  pre_functional_status_display: z.string().nullable().optional(),
  pre_assessment_notes: z.string().optional(),
  patient_reported_changes: z.string().optional(),
  patient_goals_for_session: z.string().optional(),
  // Activities performed
  activities_performed: z.string().optional(),
  adl_activities: z.string().optional(),
  cognitive_exercises: z.string().optional(),
  sensory_activities: z.string().optional(),
  fine_motor_exercises: z.string().optional(),
  gross_motor_activities: z.string().optional(),
  adaptive_equipment_training: z.string().optional(),
  splint_orthotics: z.string().optional(),
  // Patient response
  patient_response: z.string().optional(),
  patient_engagement: z.string().nullable().optional(),
  patient_engagement_display: z.string().nullable().optional(),
  // Post-session
  post_functional_status: z.string().nullable().optional(),
  post_functional_status_display: z.string().nullable().optional(),
  outcome: SessionOutcomeSchema.nullable(),
  outcome_display: z.string().optional(),
  // Progress
  progress_notes: z.string().optional(),
  goals_addressed: z.string().optional(),
  goals_progress: z.string().optional(),
  // Home program
  home_activities: z.string().optional(),
  home_activity_instructions: z.string().optional(),
  caregiver_education: z.string().optional(),
  environmental_recommendations: z.string().optional(),
  // Follow-up
  precautions_advised: z.string().optional(),
  follow_up_recommendations: z.string().optional(),
  next_session_goals: z.string().optional(),
  equipment_recommendations: z.string().optional(),
  // Clinic & billing
  clinic_visit: z.number().nullable().optional(),
  is_billed: z.boolean().optional(),
  // Computed
  functional_improvement: z.number().nullable().optional(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable().optional(),
});

export const PaginatedOTSessionSchema = createPaginatedSchema(OTSessionSchema);

export const OTSessionListItemSchema = z.object({
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

export const PaginatedOTSessionListSchema = createPaginatedSchema(OTSessionListItemSchema);

// =============================================================================
// CREATE/UPDATE SCHEMAS (sent TO backend)
// =============================================================================

export const OTOrderCreateSchema = z.object({
  patient: z.number(),
  encounter: z.number().optional(),
  treatment_type: z.number(),
  priority: AlliedHealthPrioritySchema.optional(),
  assessment_type: z.string().optional(),
  clinical_indication: z.string().min(1, 'Clinical indication is required'),
  referral_reason: z.string().optional(),
  relevant_history: z.string().optional(),
  diagnosis: z.string().optional(),
  total_sessions: z.number().min(1).optional(),
  frequency: z.string().optional(),
  treatment_goals: z.string().optional(),
  short_term_goals: z.string().optional(),
  long_term_goals: z.string().optional(),
  functional_limitations: z.string().optional(),
  precautions: z.string().optional(),
  contraindications: z.string().optional(),
});

export const OTSessionCompleteSchema = z.object({
  actual_date: z.string().optional(),
  duration_minutes: z.number().min(1, 'Duration is required'),
  pre_functional_status: z.string().optional(),
  pre_assessment_notes: z.string().optional(),
  patient_reported_changes: z.string().optional(),
  patient_goals_for_session: z.string().optional(),
  activities_performed: z.string().optional(),
  adl_activities: z.string().optional(),
  cognitive_exercises: z.string().optional(),
  sensory_activities: z.string().optional(),
  fine_motor_exercises: z.string().optional(),
  gross_motor_activities: z.string().optional(),
  adaptive_equipment_training: z.string().optional(),
  splint_orthotics: z.string().optional(),
  patient_response: z.string().optional(),
  patient_engagement: z.string().optional(),
  post_functional_status: z.string().optional(),
  outcome: SessionOutcomeSchema,
  progress_notes: z.string().optional(),
  goals_addressed: z.string().optional(),
  goals_progress: z.string().optional(),
  home_activities: z.string().optional(),
  home_activity_instructions: z.string().optional(),
  caregiver_education: z.string().optional(),
  environmental_recommendations: z.string().optional(),
  precautions_advised: z.string().optional(),
  follow_up_recommendations: z.string().optional(),
  next_session_goals: z.string().optional(),
  equipment_recommendations: z.string().optional(),
});
