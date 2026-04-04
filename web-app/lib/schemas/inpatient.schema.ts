/**
 * Zod schemas for Inpatient API response validation
 *
 * Implements validation for all Inpatient/IPD-related API responses including:
 * - Wards and Beds
 * - Admission Recommendations
 * - Admissions
 * - Discharges
 * - Transfers
 * - Ward Rounds
 * - Nursing Kardex
 * - Shift Handovers
 *
 * See lib/types/inpatient.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const InpatientWardTypeSchema = z.enum([
  'MEDICAL',
  'SURGICAL',
  'PEDIATRIC',
  'MATERNITY',
  'ICU',
  'ISOLATION',
]);

export const BedStatusSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE', 'RESERVED']);

export const AdmissionRecommendationStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED']);

export const AdmissionRecommendationUrgencySchema = z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']);

export const AdmissionStatusSchema = z.enum([
  'ACTIVE',
  'DISCHARGED',
  'TRANSFERRED_OUT',
  'DECEASED',
  'ABSCONDED',
]);

export const AdmissionPayerTypeSchema = z.enum(['CASH', 'SHA', 'CORPORATE']);

export const DischargeTypeSchema = z.enum([
  'NORMAL',
  'ROUTINE',
  'AGAINST_ADVICE',
  'TRANSFERRED',
  'DECEASED',
  'ABSCONDED',
]);

export const MaternityContinuityActionSchema = z.enum([
  'NONE',
  'CONTINUE_POSTPARTUM_OBSERVATION',
  'SCHEDULE_EARLY_PNC',
  'ROUTE_TO_PNC_QUEUE',
]);

export const MaternityContinuityStatusSchema = z.enum([
  'NOT_APPLICABLE',
  'SCHEDULED',
  'QUEUED',
]);

export const TransferReasonSchema = z.enum([
  'STEP_UP',
  'STEP_DOWN',
  'SPECIALTY',
  'BED_MANAGEMENT',
  'PATIENT_REQUEST',
  'OTHER',
]);

export const ConditionStatusSchema = z.enum(['STABLE', 'IMPROVING', 'DETERIORATING', 'CRITICAL']);

export const ReviewTypeSchema = z.enum([
  'WARD_ROUND',
  'URGENT_REVIEW',
  'CONSULTANT_REVIEW',
  'TRANSFER_REVIEW',
  'PRE_DISCHARGE',
]);

export const ReviewRequestTypeSchema = z.enum([
  'URGENT_REVIEW',
  'CONSULTANT_REVIEW',
  'TRANSFER_REVIEW',
  'PRE_DISCHARGE',
]);

export const ReviewUrgencySchema = z.enum(['ROUTINE', 'URGENT', 'STAT']);

export const ReviewRequestStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

export const RiskLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH']);

export const ShiftTypeSchema = z.enum(['DAY', 'NIGHT']);

export const ShiftEndingTypeSchema = z.enum(['DAY', 'EVENING', 'NIGHT']);

export const GenderRestrictionSchema = z.enum(['ANY', 'MALE_ONLY', 'FEMALE_ONLY']);

export const CarePlanEntryStatusSchema = z.enum(['ACTIVE', 'ONGOING', 'RESOLVED', 'DISCONTINUED']);

// =============================================================================
// WARD SCHEMAS
// =============================================================================

export const WardSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  ward_type: InpatientWardTypeSchema,
  ward_type_display: z.string().optional(),
  floor: z.string().optional(),
  capacity: z.number(),
  description: z.string().optional(),
  is_active: z.boolean(),
  daily_rate: z.string(),
  total_beds: z.number().optional(),
  occupied_beds: z.number().optional(),
  available_beds: z.number().optional(),
  occupancy_rate: z.number().optional(),
  gender_restriction: GenderRestrictionSchema.nullable().optional(),
  isolation_capable: z.boolean().optional(),
  max_age_years: z.number().nullable().optional(),
  min_age_years: z.number().nullable().optional(),
  oxygen_equipped: z.boolean().optional(),
  ventilator_capable: z.boolean().optional(),
  emergency_buffer_percent: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type WardSchemaType = z.infer<typeof WardSchema>;

// Alias for backwards compatibility
export const InpatientWardSchema = WardSchema;

// =============================================================================
// BED SCHEMAS
// =============================================================================

export const BedSchema = z.object({
  id: z.number(),
  ward: z.number(),
  ward_name: z.string().optional(),
  bed_number: z.string(),
  status: BedStatusSchema,
  status_display: z.string().optional(),
  notes: z.string().optional(),
  status_changed_by: z.number().optional().nullable(),
  status_changed_by_username: z.string().optional().nullable(),
  status_changed_at: z.string().optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type BedSchemaType = z.infer<typeof BedSchema>;

// =============================================================================
// ADMISSION RECOMMENDATION SCHEMAS
// =============================================================================

export const AdmissionRecommendationSchema = z.object({
  id: z.number(),
  encounter: z.number(),
  recommended_by: z.number(),
  recommended_by_username: z.string().optional(),
  patient_id: z.number().optional(),
  patient_name: z.string().optional(),
  patient_mrn: z.string().optional(),
  reason: z.string(),
  provisional_diagnosis: z.string(),
  provisional_diagnosis_text: z.string(),
  urgency: AdmissionRecommendationUrgencySchema,
  urgency_display: z.string().optional(),
  preferred_ward_type: InpatientWardTypeSchema,
  status: AdmissionRecommendationStatusSchema,
  status_display: z.string().optional(),
  expires_at: z.string(),
  is_expired: z.boolean().optional(),
  resolved_at: z.string().optional().nullable(),
  resolved_by: z.number().optional().nullable(),
  resolved_by_username: z.string().optional().nullable(),
  decline_reason: z.string().optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type AdmissionRecommendationSchemaType = z.infer<typeof AdmissionRecommendationSchema>;

// =============================================================================
// ADMISSION SCHEMAS
// =============================================================================

export const AdmissionSchema = z.object({
  id: z.number(),
  admission_number: z.string(),
  patient: z.number(),
  patient_name: z.string().optional(),
  patient_age: z.number().optional(),
  patient_gender: z.enum(['M', 'F', 'O']).nullable().optional(),
  mch_registration: z.number().nullable().optional(),
  mch_registration_number: z.string().optional(),
  opd_encounter: z.number().nullable().optional(),
  ipd_encounter: z.number().optional(),
  source_encounter: z.number().nullable().optional(),
  recommendation: z.number().nullable().optional(),
  admission_date: z.string(),
  admitting_diagnosis: z.coerce.string().optional(),
  admitting_diagnosis_text: z.coerce.string().optional(),
  admitting_officer: z.number().optional(),
  admitting_officer_username: z.string().optional(),
  admitted_by_username: z.string().optional(),
  attending_doctor: z.number().nullable().optional(),
  attending_doctor_username: z.string().nullable().optional(),
  ward: z.number(),
  ward_name: z.string().optional(),
  ward_type: InpatientWardTypeSchema.optional(),
  bed: z.number().nullable(),
  bed_number: z.string().nullable().optional(),
  admission_status: AdmissionStatusSchema,
  admission_status_display: z.string().optional(),
  payer_type: AdmissionPayerTypeSchema,
  payer_type_display: z.string().optional(),
  insurance_details: z.union([z.record(z.unknown()), z.null()]).optional(),
  constraint_override: z.boolean().optional(),
  constraint_override_reason: z.string().nullable().optional(),
  constraint_violations: z.array(z.string()).optional(),
  expected_discharge_date: z.string().nullable().optional(),
  clinical_context: z.object({
    comorbidities: z.array(z.string()),
    current_medications: z.array(z.string()),
    allergies_structured: z.array(z.string()),
    lab_results_summary: z.array(z.object({
      test_name: z.string(),
      value: z.number(),
      unit: z.string(),
    })),
  }).nullable().optional(),
  clinical_notes: z.string().optional(),
  diet: z.string().optional(),
  special_instructions: z.string().optional(),
  length_of_stay: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type AdmissionSchemaType = z.infer<typeof AdmissionSchema>;

// =============================================================================
// DISCHARGE SCHEMAS
// =============================================================================

export const DischargeMedicationSchema = z.object({
  drug_name: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  duration: z.string(),
  instructions: z.string().optional(),
  prescription_id: z.number().optional(),
  dispensing_type: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
});

export type DischargeMedicationSchemaType = z.infer<typeof DischargeMedicationSchema>;

export const DiagnosisRoleSchema = z.enum(['PRIMARY', 'SECONDARY', 'COMPLICATION']);

export const DischargeDiagnosisSchema = z.object({
  id: z.number().optional(),
  role: DiagnosisRoleSchema,
  role_display: z.string().optional(),
  code: z.string(),
  description: z.string(),
}).passthrough();

export const DischargeSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  mch_registration: z.number().nullable().optional(),
  mch_registration_number: z.string().optional(),
  discharge_type: DischargeTypeSchema,
  discharge_type_display: z.string().optional(),
  discharge_date: z.string(),
  discharged_by: z.number(),
  discharged_by_username: z.string().optional(),
  admission_diagnosis: z.string(),
  final_diagnosis: z.string(),
  final_diagnosis_text: z.string(),
  diagnoses: z.array(DischargeDiagnosisSchema).optional(),
  procedures_performed: z.string().optional(),
  treatment_summary: z.string(),
  discharge_medications: z.array(DischargeMedicationSchema),
  maternity_continuity_action: MaternityContinuityActionSchema,
  maternity_continuity_action_display: z.string().optional(),
  maternity_continuity_status: MaternityContinuityStatusSchema,
  maternity_continuity_status_display: z.string().optional(),
  pnc_clinic_visit: z.number().nullable().optional(),
  pnc_appointment: z.number().nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  follow_up_instructions: z.string().optional(),
  referral_facility: z.string().optional(),
  referral_reason: z.string().optional(),
  patient_instructions: z.string(),
  pharmacy_cleared: z.boolean(),
  billing_cleared: z.boolean(),
  lab_results_acknowledged: z.boolean(),
  length_of_stay: z.number().optional(),
  death_record_id: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type DischargeSchemaType = z.infer<typeof DischargeSchema>;

// =============================================================================
// CLEARANCE STATUS SCHEMAS (Automated Discharge Clearance)
// =============================================================================

export const DepartmentClearanceSchema = z.object({
  cleared: z.boolean(),
  reason: z.string(),
  outstanding_amount: z.number().optional(),
  invoice_count: z.number().optional(),
  pending_count: z.number().optional(),
  pending_tests: z.array(z.string()).optional(),
});

export const ClearanceStatusSchema = z.object({
  billing: DepartmentClearanceSchema,
  pharmacy: DepartmentClearanceSchema,
  laboratory: DepartmentClearanceSchema,
  nursing: DepartmentClearanceSchema,
  all_cleared: z.boolean(),
});

// =============================================================================
// TRANSFER SCHEMAS
// =============================================================================

export const TransferSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  mch_registration: z.number().nullable().optional(),
  mch_registration_number: z.string().optional(),
  source_ward: z.number(),
  source_ward_name: z.string().optional(),
  source_bed: z.number(),
  source_bed_number: z.string().optional(),
  destination_ward: z.number(),
  destination_ward_name: z.string().optional(),
  destination_bed: z.number(),
  destination_bed_number: z.string().optional(),
  reason: TransferReasonSchema,
  reason_display: z.string().optional(),
  reason_details: z.string().optional(),
  transferred_by: z.number(),
  transferred_by_username: z.string().optional(),
  transfer_date: z.string(),
  clinical_handover_notes: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type TransferSchemaType = z.infer<typeof TransferSchema>;

// =============================================================================
// WARD ROUND SCHEMAS
// =============================================================================

export const WardRoundVitalSignsSchema = z.object({
  temperature: z.number().optional(),
  pulse: z.number().optional(),
  blood_pressure: z.string().optional(),
  respiratory_rate: z.number().optional(),
  spo2: z.number().optional(),
});

export const WardRoundSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  round_date: z.string(),
  round_time: z.string(),
  conducted_by: z.number(),
  conducted_by_username: z.string().optional(),
  conducted_by_name: z.string().optional(),
  // Review type - differentiates scheduled rounds from urgent/consultant reviews
  review_type: ReviewTypeSchema.optional().default('WARD_ROUND'),
  review_type_display: z.string().optional(),
  review_request: z.number().nullable().optional(),
  // SOAP notes - required per SHA/FHIR
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
  maternity_continuity_action: MaternityContinuityActionSchema.optional(),
  maternity_continuity_action_display: z.string().optional(),
  maternity_continuity_notes: z.string().optional(),
  // Legacy alias
  clinical_notes: z.string().optional(),
  // Vital signs (can be nested or individual)
  vital_signs: WardRoundVitalSignsSchema.optional(),
  temperature: z.number().optional(),
  pulse: z.number().optional(),
  blood_pressure: z.string().optional(),
  respiratory_rate: z.number().optional(),
  spo2: z.number().optional(),
  // Additional fields
  diet_orders: z.string().optional(),
  activity_level: z.string().optional(),
  condition_status: ConditionStatusSchema,
  condition_status_display: z.string().optional(),
  requires_consultant_review: z.boolean(),
  consultant_specialty: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type WardRoundSchemaType = z.infer<typeof WardRoundSchema>;

// =============================================================================
// REVIEW REQUEST SCHEMAS
// =============================================================================

export const ReviewRequestSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  ward_name: z.string().optional(),
  bed_number: z.string().optional(),
  review_type: ReviewRequestTypeSchema,
  review_type_display: z.string().optional(),
  urgency: ReviewUrgencySchema,
  urgency_display: z.string().optional(),
  reason: z.string(),
  requested_by: z.number(),
  requested_by_username: z.string().optional(),
  requested_at: z.string(),
  consultant_specialty: z.string().optional(),
  assigned_to: z.number().nullable().optional(),
  assigned_to_username: z.string().nullable().optional(),
  status: ReviewRequestStatusSchema,
  status_display: z.string().optional(),
  acknowledged_at: z.string().nullable().optional(),
  acknowledged_by: z.number().nullable().optional(),
  acknowledged_by_username: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  clinical_context: z.string().optional(),
  cancellation_reason: z.string().optional(),
  is_overdue: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ReviewRequestSchemaType = z.infer<typeof ReviewRequestSchema>;

export const PaginatedReviewRequestSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ReviewRequestSchema),
});

// =============================================================================
// NURSING KARDEX SCHEMAS
// =============================================================================

export const KardexShiftNoteSchema = z.object({
  id: z.number(),
  kardex: z.number(),
  shift: ShiftTypeSchema,
  shift_display: z.string().optional(),
  nurse: z.number(),
  nurse_username: z.string().optional(),
  content: z.string(),
  notes: z.string().optional(),
  timestamp: z.string(),
  created_at: z.string().optional(),
});

export type KardexShiftNoteSchemaType = z.infer<typeof KardexShiftNoteSchema>;

export const KardexHandoverNoteSchema = z.object({
  id: z.number(),
  kardex: z.number(),
  outgoing_nurse: z.number(),
  outgoing_nurse_username: z.string().optional(),
  incoming_nurse: z.number(),
  incoming_nurse_username: z.string().optional(),
  shift_ending: ShiftTypeSchema,
  pending_tasks: z.string(),
  escalations: z.string().optional(),
  acknowledged_at: z.string().nullable().optional(),
  created_at: z.string(),
});

export type KardexHandoverNoteSchemaType = z.infer<typeof KardexHandoverNoteSchema>;

export const NursingCarePlanEntrySchema = z.object({
  id: z.number(),
  kardex: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number(),
  recorded_by_username: z.string().optional(),
  assessment: z.string(),
  nursing_diagnosis: z.string(),
  goal_and_outcome_criteria: z.string(),
  plan_of_action: z.string(),
  scientific_rationale: z.string(),
  implementation: z.string(),
  evaluation: z.string(),
  status: CarePlanEntryStatusSchema,
  status_display: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type NursingCarePlanEntrySchemaType = z.infer<typeof NursingCarePlanEntrySchema>;

export const NursingKardexSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  ward_name: z.string().optional(),
  bed_number: z.string().optional(),
  // Basic care information
  mobility_status: z.string().optional(),
  dietary_requirements: z.string().optional(),
  diet: z.string().optional(),
  allergies: z.string().optional(),
  iv_access: z.string().optional(),
  maternity_continuity_action: MaternityContinuityActionSchema.optional(),
  maternity_continuity_action_display: z.string().optional(),
  maternity_continuity_notes: z.string().optional(),
  // Risk assessments
  fall_risk: RiskLevelSchema,
  fall_risk_display: z.string().optional(),
  pressure_sore_risk: RiskLevelSchema,
  pressure_sore_risk_display: z.string().optional(),
  // Isolation
  isolation_required: z.boolean(),
  isolation_type: z.string().optional(),
  // Related notes and care plan entries
  shift_notes: z.array(KardexShiftNoteSchema).optional(),
  handover_notes: z.array(KardexHandoverNoteSchema).optional(),
  care_plan_entries: z.array(NursingCarePlanEntrySchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type NursingKardexSchemaType = z.infer<typeof NursingKardexSchema>;

export const InpatientConsumableUsageSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  drug: z.number(),
  drug_name: z.string().optional(),
  batch: z.number(),
  batch_number: z.string().optional(),
  quantity_used: z.number(),
  notes: z.string().optional(),
  used_by: z.number(),
  used_by_username: z.string().optional(),
  used_at: z.string(),
  is_reversed: z.boolean(),
  reversed_by: z.number().nullable().optional(),
  reversed_by_username: z.string().nullable().optional(),
  reversed_at: z.string().nullable().optional(),
  reverse_reason: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type InpatientConsumableUsageSchemaType = z.infer<typeof InpatientConsumableUsageSchema>;

export const InpatientConsumableUsageArraySchema = z.array(InpatientConsumableUsageSchema);

// Legacy aliases
export const NursingNoteSchema = KardexShiftNoteSchema;
export const NursingOrderSchema = NursingKardexSchema;

// =============================================================================
// SHIFT HANDOVER SCHEMAS
// =============================================================================

export const ShiftHandoverSchema = z.object({
  id: z.number(),
  ward: z.number(),
  ward_name: z.string().optional(),
  shift_date: z.string(),
  shift_ending: ShiftEndingTypeSchema,
  shift_ending_display: z.string().optional(),
  outgoing_nurse: z.number(),
  outgoing_nurse_username: z.string().optional(),
  incoming_nurse: z.number(),
  incoming_nurse_username: z.string().optional(),
  total_patients: z.number(),
  critical_patients: z.number(),
  new_admissions: z.number(),
  discharges_pending: z.number(),
  general_notes: z.string().optional(),
  acknowledged_at: z.string().nullable().optional(),
  is_acknowledged: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ShiftHandoverSchemaType = z.infer<typeof ShiftHandoverSchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedWardSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WardSchema),
});

export const PaginatedBedSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(BedSchema),
});

export const PaginatedAdmissionRecommendationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(AdmissionRecommendationSchema),
});

export const PaginatedAdmissionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(AdmissionSchema),
});

export const PaginatedDischargeSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DischargeSchema),
});

export const PaginatedTransferSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TransferSchema),
});

export const PaginatedWardRoundSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WardRoundSchema),
});

export const PaginatedNursingKardexSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(NursingKardexSchema),
});

export const PaginatedShiftHandoverSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ShiftHandoverSchema),
});

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const BedArraySchema = z.array(BedSchema);
export const KardexShiftNoteArraySchema = z.array(KardexShiftNoteSchema);
export const KardexHandoverNoteArraySchema = z.array(KardexHandoverNoteSchema);

// Legacy aliases for backwards compatibility
export const BedArrayResponseSchema = z.object({
  results: BedArraySchema,
});

export const NursingNoteArrayResponseSchema = z.object({
  results: KardexShiftNoteArraySchema,
});

// =============================================================================
// WARD WEBSOCKET / POLLING SCHEMAS
// =============================================================================

/**
 * Ward update event types from WebSocket/polling
 */
export const WardUpdateEventTypeSchema = z.enum([
  'ward_constraints_updated',
  'compatibility_violation',
  'bed_availability_changed',
]);

/**
 * Ward update event (from WebSocket or polling)
 */
export const WardUpdateEventSchema = z.object({
  type: WardUpdateEventTypeSchema,
  admission_id: z.number().optional(),
  patient_name: z.string().optional(),
  violations: z.array(z.string()).optional(),
  timestamp: z.string(),
});

export type WardUpdateEventSchemaType = z.infer<typeof WardUpdateEventSchema>;

/**
 * Current ward constraint state (from polling)
 */
export const WardCurrentStateSchema = z.object({
  ward_id: z.number(),
  ward_name: z.string(),
  gender_restriction: z.string().nullable(),
  min_age_years: z.number().nullable(),
  max_age_years: z.number().nullable(),
  isolation_capable: z.boolean(),
  oxygen_equipped: z.boolean(),
  ventilator_capable: z.boolean(),
  maternity_designated: z.boolean().optional().default(false),
  available_beds: z.number(),
});

export type WardCurrentStateSchemaType = z.infer<typeof WardCurrentStateSchema>;

/**
 * Ward updates polling response
 */
export const WardUpdatesResponseSchema = z.object({
  events: z.array(WardUpdateEventSchema),
  current_state: WardCurrentStateSchema,
});

export type WardUpdatesResponseSchemaType = z.infer<typeof WardUpdatesResponseSchema>;

// =============================================================================
// SUPERVISOR ALERTS SCHEMAS
// =============================================================================

/**
 * Supervisor alert for critical constraint violations
 */
export const SupervisorAlertSchema = z.object({
  admission_id: z.number(),
  admission_number: z.string(),
  patient_id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  ward_id: z.number(),
  ward_name: z.string(),
  bed_number: z.string(),
  admitted_by: z.string(),
  critical_violations: z.array(z.string()),
  override_reason: z.string().nullable(),
  timestamp: z.string(),
  // Acknowledgment fields (added in Phase 4)
  is_acknowledged: z.boolean().optional(),
  acknowledged_by: z.string().nullable().optional(),
  acknowledged_at: z.string().nullable().optional(),
});

export type SupervisorAlertSchemaType = z.infer<typeof SupervisorAlertSchema>;

/**
 * Supervisor alerts polling response
 */
export const SupervisorAlertsResponseSchema = z.object({
  alerts: z.array(SupervisorAlertSchema),
});

export type SupervisorAlertsResponseSchemaType = z.infer<typeof SupervisorAlertsResponseSchema>;

// =============================================================================
// SINGLE WARD COMPATIBILITY CHECK SCHEMAS
// =============================================================================

export const ConstraintViolationSeveritySchema = z.enum(['WARNING', 'CRITICAL']);

/**
 * Single compatibility violation from ward check
 */
export const CompatibilityViolationSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: ConstraintViolationSeveritySchema,
  override_allowed: z.boolean(),
});

export type CompatibilityViolationSchemaType = z.infer<typeof CompatibilityViolationSchema>;

/**
 * Result of single-ward compatibility check
 */
export const CompatibilityCheckResultSchema = z.object({
  compatible: z.boolean(),
  has_critical_violations: z.boolean(),
  violations: z.array(CompatibilityViolationSchema),
});

export type CompatibilityCheckResultSchemaType = z.infer<typeof CompatibilityCheckResultSchema>;

// =============================================================================
// BULK COMPATIBILITY CHECK SCHEMAS
// =============================================================================

/**
 * Ward info returned in compatibility check results
 */
export const CompatibleWardInfoSchema = z.object({
  ward_id: z.number(),
  ward_name: z.string(),
  ward_type: InpatientWardTypeSchema,
  available_beds: z.number(),
});

export type CompatibleWardInfoSchemaType = z.infer<typeof CompatibleWardInfoSchema>;

/**
 * Incompatible ward info with violations
 */
export const IncompatibleWardInfoSchema = CompatibleWardInfoSchema.extend({
  violations: z.array(z.string()),
  has_critical: z.boolean(),
});

export type IncompatibleWardInfoSchemaType = z.infer<typeof IncompatibleWardInfoSchema>;

/**
 * Result for a single patient in bulk compatibility check
 */
export const PatientCompatibilityResultSchema = z.object({
  patient_id: z.number(),
  patient_name: z.string().optional(),
  patient_mrn: z.string().optional(),
  error: z.string().optional(),
  compatible_wards: z.array(CompatibleWardInfoSchema),
  incompatible_wards: z.array(IncompatibleWardInfoSchema),
});

export type PatientCompatibilityResultSchemaType = z.infer<typeof PatientCompatibilityResultSchema>;

/**
 * Bulk compatibility check response
 */
export const BulkCompatibilityResultSchema = z.object({
  results: z.array(PatientCompatibilityResultSchema),
});

export type BulkCompatibilityResultSchemaType = z.infer<typeof BulkCompatibilityResultSchema>;

// =============================================================================
// OBSERVATION CHART SCHEMAS
// =============================================================================

export const TemperatureReadingSchema = z.object({
  id: z.number(),
  admission: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number(),
  recorded_by_username: z.string().optional(),
  temperature: z.string(),
  pulse: z.number().nullable().optional(),
  respiratory_rate: z.number().nullable().optional(),
  notes: z.string().optional(),
  is_febrile: z.boolean().optional(),
  is_hypothermic: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedTemperatureReadingSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TemperatureReadingSchema),
});

export const FluidBalanceEntryTypeSchema = z.enum([
  'INTRAVENOUS',
  'ALIMENTARY',
  'OTHER_INTAKE',
  'VOMIT',
  'STOOL',
  'NASOGASTRIC',
  'OTHER_OUTPUT',
  'URINE',
]);

export const FluidBalanceSheetSchema = z.object({
  id: z.number(),
  admission: z.number(),
  chart_date: z.string(),
  recorded_by: z.number(),
  recorded_by_username: z.string().optional(),
  patient_weight_kg: z.string().nullable().optional(),
  intravenous_infusion_notes: z.string().optional(),
  other_instructions: z.string().optional(),
  total_intravenous_intake_ml: z.number().optional(),
  total_alimentary_intake_ml: z.number().optional(),
  total_other_intake_ml: z.number().optional(),
  total_intake_ml: z.number().optional(),
  total_vomit_output_ml: z.number().optional(),
  total_stool_output_ml: z.number().optional(),
  total_nasogastric_output_ml: z.number().optional(),
  total_other_output_ml: z.number().optional(),
  total_urine_output_ml: z.number().optional(),
  total_output_ml: z.number().optional(),
  net_balance_ml: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedFluidBalanceSheetSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(FluidBalanceSheetSchema),
});

export const FluidBalanceEntrySchema = z.object({
  id: z.number(),
  fluid_balance_sheet: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number(),
  recorded_by_username: z.string().optional(),
  entry_type: FluidBalanceEntryTypeSchema,
  entry_type_display: z.string().optional(),
  item_type: z.string().optional(),
  bottle_number: z.string().optional(),
  amount_ml: z.number().nullable().optional(),
  specific_gravity: z.string().nullable().optional(),
  notes: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedFluidBalanceEntrySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(FluidBalanceEntrySchema),
});

export const TransfusionObservationIntervalSchema = z.enum([
  'BEFORE', '00_MIN', '15_MIN', '45_MIN',
  '1HR_15MIN', '1HR_45MIN', '2HR_15MIN', '2HR_45MIN',
  '3HR_15MIN', '3HR_45MIN', '4HR_15MIN', '4HR_AFTER',
]);

export const BloodProductSchema = z.enum([
  'WHOLE', 'PACKED_RED_CELLS', 'FFP', 'PLATELETS', 'CRYOPRECIPITATE', 'OTHER',
]);

export const TransfusionStatusSchema = z.enum([
  'IN_PROGRESS', 'COMPLETED', 'STOPPED', 'CANCELLED',
]);

export const TransfusionObservationEntrySchema = z.object({
  id: z.number(),
  transfusion: z.number(),
  observation_interval: TransfusionObservationIntervalSchema,
  observation_interval_display: z.string().optional(),
  exact_time: z.string(),
  recorded_by: z.number(),
  recorded_by_username: z.string().optional(),
  blood_pressure: z.string().optional(),
  temperature: z.string().nullable().optional(),
  pulse: z.number().nullable().optional(),
  respiratory_rate: z.number().nullable().optional(),
  remarks: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const BloodTransfusionSchema = z.object({
  id: z.number(),
  admission: z.number(),
  patient_name: z.string().optional(),
  blood_product: BloodProductSchema,
  blood_product_display: z.string().optional(),
  blood_product_other: z.string().optional(),
  blood_unit_number: z.string(),
  blood_group: z.string().optional(),
  amount_ml: z.number(),
  transfusion_date: z.string(),
  time_started: z.string().nullable().optional(),
  time_ended: z.string().nullable().optional(),
  started_by: z.number(),
  started_by_username: z.string().optional(),
  counter_checked_by: z.number().nullable().optional(),
  counter_checked_by_username: z.string().nullable().optional(),
  diagnosis: z.string().optional(),
  status: TransfusionStatusSchema,
  status_display: z.string().optional(),
  reaction_occurred: z.boolean(),
  reaction_type: z.string().optional(),
  reaction_action_taken: z.string().optional(),
  observations: z.array(TransfusionObservationEntrySchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedBloodTransfusionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(BloodTransfusionSchema),
});

export const BPPositionSchema = z.enum(['SITTING', 'STANDING', 'LYING', 'LEFT_LATERAL']);

export const BPMonitoringReadingSchema = z.object({
  id: z.number(),
  admission: z.number(),
  recorded_at: z.string(),
  recorded_by: z.number(),
  recorded_by_username: z.string().optional(),
  systolic: z.number(),
  diastolic: z.number(),
  pulse: z.number().nullable().optional(),
  position: BPPositionSchema,
  position_display: z.string().optional(),
  arm: z.string().optional(),
  notes: z.string().optional(),
  mean_arterial_pressure: z.number().optional(),
  bp_display: z.string().optional(),
  is_hypertensive: z.boolean().optional(),
  is_hypotensive: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedBPMonitoringReadingSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(BPMonitoringReadingSchema),
});

// =============================================================================
// RULE-BASED BED ASSIGNMENT SCHEMAS (Phase B)
// =============================================================================

export const BedCandidateEvaluationSchema = z.object({
  bed_id: z.number(),
  bed_number: z.string(),
  ward_id: z.number(),
  ward_name: z.string(),
  ward_code: z.string(),
  passed: z.boolean(),
  matched_constraints: z.array(z.string()),
  failed_constraints: z.array(z.string()),
  compatibility_violations: z.array(z.record(z.unknown())),
  rejection_reason: z.string(),
  score: z.number(),
  scoring_breakdown: z.record(z.unknown()),
});

export type BedCandidateEvaluationSchemaType = z.infer<typeof BedCandidateEvaluationSchema>;

export const RuleBasedBedAssignmentResponseSchema = z.object({
  success: z.boolean(),
  assigned_bed_id: z.number().nullable(),
  assigned_bed_number: z.string().nullable(),
  assigned_ward_name: z.string().nullable(),
  rule_applied: z.string().nullable(),
  decision_id: z.number().nullable(),
  decision_outcome: z.string(),
  decision_reason: z.string(),
  evaluation_time_ms: z.number(),
  candidates_evaluated: z.array(BedCandidateEvaluationSchema),
  scoring_details: z.record(z.unknown()),
  error: z.string().nullable(),
});

export type RuleBasedBedAssignmentResponseSchemaType = z.infer<typeof RuleBasedBedAssignmentResponseSchema>;

// =============================================================================
// SMART ALLOCATION SCHEMAS (Phase C)
// =============================================================================

export const PredictedDischargeSchema = z.object({
  admission_id: z.number(),
  admission_number: z.string(),
  patient_name: z.string(),
  ward_id: z.number(),
  ward_name: z.string(),
  bed_id: z.number(),
  bed_number: z.string(),
  admission_date: z.string(),
  expected_discharge_date: z.string().nullable(),
  estimated_discharge_date: z.string().nullable(),
  source: z.string(),
  hours_until_available: z.number().nullable(),
});

export type PredictedDischargeSchemaType = z.infer<typeof PredictedDischargeSchema>;

export const PredictedDischargesResponseSchema = z.object({
  ward_id: z.number(),
  ward_name: z.string(),
  hours_ahead: z.number(),
  count: z.number(),
  predictions: z.array(PredictedDischargeSchema),
});

export type PredictedDischargesResponseSchemaType = z.infer<typeof PredictedDischargesResponseSchema>;

export const BedUtilizationSchema = z.object({
  ward_id: z.number(),
  ward_name: z.string(),
  ward_code: z.string(),
  capacity: z.number(),
  occupied: z.number(),
  available: z.number(),
  cleaning: z.number(),
  reserved: z.number(),
  maintenance: z.number(),
  occupancy_rate: z.number(),
  emergency_buffer_percent: z.number(),
  emergency_buffer_beds: z.number(),
  effective_available: z.number(),
  avg_length_of_stay_days: z.number().nullable(),
  predicted_discharges_next_4h: z.number(),
  predicted_discharges_next_24h: z.number(),
  workload_score: z.number(),
});

export type BedUtilizationSchemaType = z.infer<typeof BedUtilizationSchema>;

export const SmartRecommendBedResponseSchema = z.object({
  success: z.boolean(),
  assigned_bed_id: z.number().nullable(),
  assigned_bed_number: z.string().nullable(),
  smart_scores: z.record(z.unknown()),
  emergency_buffer_enforced: z.boolean(),
  cohort_match_score: z.number(),
  infection_isolation_triggered: z.boolean(),
  workload_score: z.number(),
  predicted_discharges: z.array(PredictedDischargeSchema),
  evaluation_time_ms: z.number(),
  error: z.string().nullable(),
});

export type SmartRecommendBedResponseSchemaType = z.infer<typeof SmartRecommendBedResponseSchema>;

export const SetExpectedDischargeResponseSchema = z.object({
  admission_id: z.number(),
  admission_number: z.string(),
  expected_discharge_date: z.string(),
});

export type SetExpectedDischargeResponseSchemaType = z.infer<typeof SetExpectedDischargeResponseSchema>;

// --- Ward Recommendation ---

export const WardRecommendationRankedWardSchema = z.object({
  ward_id: z.number(),
  ward_name: z.string(),
  ward_code: z.string(),
  ward_type: z.string(),
  ward_type_display: z.string().optional().default(''),
  compatible: z.boolean().optional().default(true),
  score: z.number(),
  scores: z.record(z.number()).optional().default({}),
  total_beds: z.number().optional().default(0),
  available_beds: z.number(),
  effective_available: z.number().optional().default(0),
  occupancy_rate: z.number(),
  violations: z.array(z.string()).optional().default([]),
  rejection_reason: z.string().optional().default(''),
  reason: z.string(),
  recommended: z.boolean(),
});

export const WardRecommendationResponseSchema = z.object({
  success: z.boolean(),
  recommended_ward_id: z.number().nullable(),
  recommended_ward_name: z.string().nullable(),
  ranked_wards: z.array(WardRecommendationRankedWardSchema),
  incompatible_wards: z.array(z.object({
    ward_id: z.number(),
    ward_name: z.string(),
    ward_code: z.string(),
    ward_type: z.string(),
    ward_type_display: z.string().optional().default(''),
    compatible: z.boolean().optional().default(false),
    violations: z.array(z.string()),
    rejection_reason: z.string().optional().default(''),
  })),
  total_evaluated: z.number(),
  infection_isolation_triggered: z.boolean(),
  evaluation_time_ms: z.number(),
  error: z.string().nullable(),
});
