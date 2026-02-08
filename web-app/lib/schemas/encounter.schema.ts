/**
 * Zod schemas for Encounters API response validation
 *
 * Implements validation for all Encounter-related API responses.
 * See lib/types/encounter.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';
import { TriageCategorySchema } from './triage.schema';
import { GenderSchema, EncounterStatusSchema } from './patient.schema';

// =============================================================================
// ENUMS
// =============================================================================

export const EncounterTypeSchema = z.enum([
  'OPD',
  'IPD',
  'EMERGENCY',
  'ANC',
  'PAEDIATRIC',
  'DIALYSIS',
  'ONCOLOGY',
  'SCHEDULED_OPD',
  'FOLLOW_UP',
  'CONSULTANT_REVIEW',
  'CHRONIC_STABLE',
  'SPECIALIST_CLINIC',
  'PROCEDURE',
  'DAY_CASE',
  'WARD_ROUND',
  'DISCHARGE_REVIEW',
]);

// Re-export from patient.schema for convenience
export { GenderSchema, EncounterStatusSchema };

export const DiagnosisTypeSchema = z.enum(['PRIMARY', 'SECONDARY', 'DIFFERENTIAL', 'WORKING']);

export const DiagnosisCertaintySchema = z.enum(['confirmed', 'provisional', 'ruled_out', 'suspected']);

export const TreatmentPlanStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'DISCONTINUED']);

export const TriageStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BYPASSED', 'NOT_APPLICABLE']);

export const TriageRequirementSchema = z.enum(['MANDATORY', 'OPTIONAL', 'NOT_REQUIRED']);

export const ConsultationStatusSchema = z.enum(['WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED']);

export const VitalsSourceSchema = z.enum(['TRIAGE', 'CONSULTATION', 'NURSING']);

export const VisitReasonSchema = z.enum([
  'NEW_COMPLAINT',
  'FOLLOW_UP',
  'CHRONIC_CARE',
  'PROCEDURE_REVIEW',
  'REFILL_ONLY',
  'LAB_REVIEW',
  'REFERRAL_VISIT',
  'OTHER',
]);

export const TriageBypassReasonSchema = z.enum([
  'STABLE_FOLLOW_UP',
  'CONSULTANT_DECISION',
  'CHRONIC_CARE_REVIEW',
  'STAFF_SHORTAGE',
  'PATIENT_PREFERENCE',
  'OTHER',
]);

// Re-export from triage.schema to avoid duplicates
export { TriageCategorySchema };

// =============================================================================
// ICD-10 CODE SCHEMA
// =============================================================================

export const ICD10CodeSchema = z.object({
  id: z.number(),
  code: z.string(),
  description: z.string(),
  category: z.string().optional().nullable(),
  chapter: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export type ICD10CodeSchemaType = z.infer<typeof ICD10CodeSchema>;

// =============================================================================
// DIAGNOSIS SCHEMA
// =============================================================================

export const DiagnosisSchema = z.object({
  id: z.number(),
  encounter: z.number(),
  icd10_code: z.number().nullable(),
  icd10_code_display: z.string().optional().nullable(),
  icd10_display: z.string().optional().nullable(),
  icd10_description: z.string().optional().nullable(),
  icd11_code: z.string().optional().nullable(),
  icd11_display: z.string().optional().nullable(),
  diagnosis_type: DiagnosisTypeSchema,
  free_text_diagnosis: z.string().optional().nullable(),
  notes: z.string(),
  is_confirmed: z.boolean(),
  certainty: DiagnosisCertaintySchema,
  diagnosed_by: z.number().optional().nullable(),
  diagnosed_by_name: z.string().optional().nullable(),
  diagnosed_at: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DiagnosisSchemaType = z.infer<typeof DiagnosisSchema>;

// =============================================================================
// MEDICATION SCHEMA
// =============================================================================

export const MedicationSchema = z.object({
  id: z.number(),
  treatment_plan: z.number(),
  name: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  duration: z.string(),
  route: z.string(),
  quantity: z.string(),
  instructions: z.string(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type MedicationSchemaType = z.infer<typeof MedicationSchema>;

// =============================================================================
// TREATMENT PLAN SCHEMA
// =============================================================================

export const TreatmentPlanSchema = z.object({
  id: z.number(),
  encounter: z.number(),
  template: z.number().optional().nullable(),
  template_name: z.string().optional().nullable(),
  clinical_notes: z.string(),
  medications_json: z.any(),
  procedures_json: z.any(),
  follow_up_instructions: z.string(),
  follow_up_date: z.string().nullable(),
  diet_recommendations: z.string(),
  activity_restrictions: z.string(),
  referral_needed: z.boolean(),
  referral_specialty: z.string(),
  referral_notes: z.string(),
  status: TreatmentPlanStatusSchema,
  has_follow_up: z.boolean().optional(),
  has_referral: z.boolean().optional(),
  medications: z.array(MedicationSchema),
  created_by: z.number().optional().nullable(),
  created_by_name: z.string().optional().nullable(),
  approved_by: z.number().optional().nullable(),
  approved_by_name: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TreatmentPlanSchemaType = z.infer<typeof TreatmentPlanSchema>;

// =============================================================================
// ENCOUNTER SCHEMA
// =============================================================================

export const EncounterSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  patient_gender: GenderSchema.optional().nullable(),
  patient_date_of_birth: z.string().optional().nullable(),

  // Encounter details
  encounter_type: EncounterTypeSchema,
  encounter_date: z.string(),
  chief_complaint: z.string(),
  status: EncounterStatusSchema,

  // Encounter Linking (Sprint 2 - Phase 2B)
  linked_encounter: z.number().optional().nullable(),

  // Visit Reason (Sprint 2 - Phase 2D)
  visit_reason: VisitReasonSchema.optional(),

  // Vitals
  temperature: z.number().nullable(),
  pulse: z.number().nullable(),
  blood_pressure: z.string().nullable(),
  respiratory_rate: z.number().nullable(),
  spo2: z.number().nullable(),
  weight: z.number().nullable(),
  height: z.number().nullable(),

  // Computed vitals
  bmi: z.number().optional().nullable(),
  bmi_classification: z.string().optional().nullable(),
  systolic_bp: z.number().optional().nullable(),
  diastolic_bp: z.number().optional().nullable(),
  has_critical_vitals: z.boolean().optional(),
  alerts: z.string().optional().nullable(),
  vitals_summary: z.string().optional().nullable(),

  // Vitals source tracking
  vitals_source: VitalsSourceSchema.optional().nullable(),
  vitals_recorded_by: z.number().optional().nullable(),
  vitals_recorded_at: z.string().optional().nullable(),

  // Clinical template
  clinical_template: z.number().optional().nullable(),
  clinical_template_data: z.record(z.record(z.unknown())).optional().nullable(),

  // Medical history
  allergies: z.string(),
  chronic_conditions: z.string(),
  current_medications: z.string(),
  past_surgeries: z.string(),
  family_history: z.string(),
  social_history: z.string(),

  // Clinical notes
  notes: z.string(),
  history_of_present_illness: z.string().optional().nullable(),
  physical_examination: z.string().optional().nullable(),
  assessment: z.string().optional().nullable(),
  // Note: SOAP 'P' (Plan) is TreatmentPlan-only (see TreatmentPlan.clinical_notes)

  // Status workflow
  finalized_by: z.number().optional().nullable(),
  finalized_by_username: z.string().optional().nullable(),
  finalized_at: z.string().optional().nullable(),
  cancellation_reason: z.string().optional().nullable(),

  // Triage fields
  triage_status: TriageStatusSchema.optional(),
  triage_requirement: TriageRequirementSchema.optional().nullable(),
  triage_bypass_reason: TriageBypassReasonSchema.optional().nullable(),
  triage_bypassed_by: z.number().optional().nullable(),
  triage_bypassed_by_username: z.string().optional().nullable(),
  triage_bypassed_at: z.string().optional().nullable(),

  // Consultation workflow
  consultation_status: ConsultationStatusSchema.optional().nullable(),
  called_at: z.string().optional().nullable(),
  consultation_started_at: z.string().optional().nullable(),
  can_enter_consultation: z.boolean().optional(),
  wait_time_minutes: z.number().optional().nullable(),

  // Clinic context
  clinic_visit_id: z.number().optional().nullable(),
  clinic_name: z.string().optional().nullable(),
  clinic_type: z.string().optional().nullable(),

  // Clinician Assignment
  assigned_clinician: z.number().optional().nullable(),
  assigned_clinician_username: z.string().optional().nullable(),
  assigned_clinician_name: z.string().optional().nullable(),
  claimed_at: z.string().optional().nullable(),

  // Chief complaint edit tracking
  chief_complaint_original: z.string().optional().nullable(),
  chief_complaint_edited: z.boolean().optional(),
  chief_complaint_edit_reason: z.string().optional().nullable(),
  chief_complaint_edit_reason_other: z.string().optional().nullable(),
  chief_complaint_edited_by: z.number().optional().nullable(),
  chief_complaint_edited_by_username: z.string().optional().nullable(),
  chief_complaint_edited_at: z.string().optional().nullable(),

  // Metadata
  created_by: z.number().optional().nullable(),
  created_by_name: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type EncounterSchemaType = z.infer<typeof EncounterSchema>;

// Alias for list items (same schema but can be extended if needed)
export const EncounterListItemSchema = EncounterSchema;

// =============================================================================
// CLAIM/RELEASE RESPONSE SCHEMAS
// =============================================================================

export const EncounterClaimResponseSchema = z.object({
  status: z.literal('claimed'),
  encounter_id: z.number(),
  claimed_by: z.string(),
  claimed_at: z.string(),
});

export type EncounterClaimResponseSchemaType = z.infer<typeof EncounterClaimResponseSchema>;

export const EncounterReleaseResponseSchema = z.object({
  status: z.literal('released'),
  encounter_id: z.number(),
});

export type EncounterReleaseResponseSchemaType = z.infer<typeof EncounterReleaseResponseSchema>;

// =============================================================================
// MY CLAIMED ENCOUNTERS RESPONSE SCHEMA
// =============================================================================

export const MyClaimedEncountersResponseSchema = z.object({
  results: z.array(EncounterSchema),
  count: z.number(),
});

export type MyClaimedEncountersResponseSchemaType = z.infer<typeof MyClaimedEncountersResponseSchema>;

// Alias for all claimed encounters (same structure)
export const AllClaimedEncountersResponseSchema = MyClaimedEncountersResponseSchema;

// =============================================================================
// CONSULTATION QUEUE SCHEMAS
// =============================================================================

export const ConsultationQueueItemSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  patient_age: z.number(),
  patient_gender: GenderSchema,
  encounter_type: z.string(),
  encounter_type_display: z.string(),
  chief_complaint: z.string(),
  triage_status: TriageStatusSchema,
  triage_category: TriageCategorySchema.nullable(),
  triage_bypass_reason: TriageBypassReasonSchema.nullable(),
  consultation_status: ConsultationStatusSchema,
  arrival_time: z.string(),
  triage_completed_at: z.string().nullable(),
  wait_time_minutes: z.number(),
  called_at: z.string().nullable(),
  assigned_clinician: z.number().optional().nullable(),
  assigned_clinician_username: z.string().optional().nullable(),
  assigned_clinician_name: z.string().optional().nullable(),
  claimed_at: z.string().optional().nullable(),
});

export type ConsultationQueueItemSchemaType = z.infer<typeof ConsultationQueueItemSchema>;

export const ConsultationQueueStatsSchema = z.object({
  total: z.number(),
  waiting: z.number(),
  called: z.number(),
  by_category: z.object({
    RED: z.number(),
    ORANGE: z.number(),
    YELLOW: z.number(),
    GREEN: z.number(),
    BLUE: z.number(),
    bypassed: z.number(),
    direct: z.number(),
  }),
});

export type ConsultationQueueStatsSchemaType = z.infer<typeof ConsultationQueueStatsSchema>;

// =============================================================================
// PRE-TRIAGE QUEUE SCHEMA
// =============================================================================

export const PreTriageQueueItemSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  patient_age: z.number().nullable(),
  patient_gender: z.string(),
  encounter_type: z.string(),
  encounter_type_display: z.string().optional().nullable(),
  chief_complaint: z.string(),
  triage_requirement: TriageRequirementSchema,
  triage_status: TriageStatusSchema,
  created_at: z.string(),
  wait_time_minutes: z.number(),
});

export type PreTriageQueueItemSchemaType = z.infer<typeof PreTriageQueueItemSchema>;

// =============================================================================
// TEMPLATE SCHEMAS
// =============================================================================

export const TemplatePopulateResponseSchema = z.object({
  populated_data: z.record(z.unknown()),
  template_id: z.number(),
  template_name: z.string(),
});

export type TemplatePopulateResponseSchemaType = z.infer<typeof TemplatePopulateResponseSchema>;

export const TemplateSyncResponseSchema = EncounterSchema.extend({
  changed_fields: z.array(z.string()),
});

export type TemplateSyncResponseSchemaType = z.infer<typeof TemplateSyncResponseSchema>;

export const TemplateSnapshotSchema = z.object({
  id: z.number(),
  template_id: z.number().nullable(),
  template_name: z.string(),
  template_version: z.string(),
  data: z.record(z.unknown()),
  created_by: z.string().nullable(),
  created_at: z.string(),
});

export type TemplateSnapshotSchemaType = z.infer<typeof TemplateSnapshotSchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedEncounterSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(EncounterSchema),
});

export const PaginatedICD10CodeSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ICD10CodeSchema),
});

export const PaginatedPreTriageQueueSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PreTriageQueueItemSchema),
});

export const PaginatedConsultationQueueSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ConsultationQueueItemSchema),
});

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const DiagnosisArraySchema = z.array(DiagnosisSchema);
export const TemplateSnapshotArraySchema = z.array(TemplateSnapshotSchema);

export const DiagnosisArrayResponseSchema = z.object({
  results: z.array(DiagnosisSchema),
});
