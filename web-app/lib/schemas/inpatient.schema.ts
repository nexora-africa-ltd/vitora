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

export const BedStatusSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED']);

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

export const TransferReasonSchema = z.enum([
  'STEP_UP',
  'STEP_DOWN',
  'SPECIALTY',
  'BED_MANAGEMENT',
  'PATIENT_REQUEST',
  'OTHER',
]);

export const ConditionStatusSchema = z.enum(['STABLE', 'IMPROVING', 'DETERIORATING', 'CRITICAL']);

export const RiskLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH']);

export const ShiftTypeSchema = z.enum(['DAY', 'NIGHT']);

export const ShiftEndingTypeSchema = z.enum(['DAY', 'EVENING', 'NIGHT']);

export const GenderRestrictionSchema = z.enum(['ANY', 'MALE_ONLY', 'FEMALE_ONLY']);

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
  opd_encounter: z.number().nullable().optional(),
  ipd_encounter: z.number().optional(),
  source_encounter: z.number().nullable().optional(),
  recommendation: z.number().nullable().optional(),
  admission_date: z.string(),
  admitting_diagnosis: z.string().optional(),
  admitting_diagnosis_text: z.string().optional(),
  admitting_officer: z.number().optional(),
  admitting_officer_username: z.string().optional(),
  admitted_by_username: z.string().optional(),
  attending_doctor: z.number().nullable().optional(),
  attending_doctor_username: z.string().optional(),
  ward: z.number(),
  ward_name: z.string().optional(),
  bed: z.number(),
  bed_number: z.string().optional(),
  admission_status: AdmissionStatusSchema,
  admission_status_display: z.string().optional(),
  payer_type: AdmissionPayerTypeSchema,
  payer_type_display: z.string().optional(),
  insurance_details: z.record(z.unknown()).optional(),
  constraint_override: z.boolean().optional(),
  constraint_override_reason: z.string().nullable().optional(),
  constraint_violations: z.array(z.string()).optional(),
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
});

export type DischargeMedicationSchemaType = z.infer<typeof DischargeMedicationSchema>;

export const DischargeSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
  discharge_type: DischargeTypeSchema,
  discharge_type_display: z.string().optional(),
  discharge_date: z.string(),
  discharged_by: z.number(),
  discharged_by_username: z.string().optional(),
  admission_diagnosis: z.string(),
  final_diagnosis: z.string(),
  final_diagnosis_text: z.string(),
  procedures_performed: z.string().optional(),
  treatment_summary: z.string(),
  discharge_medications: z.array(DischargeMedicationSchema),
  follow_up_date: z.string().nullable().optional(),
  follow_up_instructions: z.string().optional(),
  referral_facility: z.string().optional(),
  referral_reason: z.string().optional(),
  patient_instructions: z.string(),
  pharmacy_cleared: z.boolean(),
  billing_cleared: z.boolean(),
  lab_results_acknowledged: z.boolean(),
  length_of_stay: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type DischargeSchemaType = z.infer<typeof DischargeSchema>;

// =============================================================================
// TRANSFER SCHEMAS
// =============================================================================

export const TransferSchema = z.object({
  id: z.number(),
  admission: z.number(),
  admission_number: z.string().optional(),
  patient_name: z.string().optional(),
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
  // SOAP notes - required per SHA/FHIR
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
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
  from_shift: ShiftTypeSchema,
  to_shift: ShiftTypeSchema,
  outgoing_nurse: z.number(),
  outgoing_nurse_username: z.string().optional(),
  nurse_username: z.string().optional(),
  incoming_nurse: z.number(),
  incoming_nurse_username: z.string().optional(),
  shift_ending: ShiftTypeSchema,
  pending_tasks: z.string(),
  content: z.string(),
  escalations: z.string().optional(),
  acknowledged_at: z.string().nullable().optional(),
  created_at: z.string(),
});

export type KardexHandoverNoteSchemaType = z.infer<typeof KardexHandoverNoteSchema>;

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
  // Nursing care plan
  nursing_problems: z.string().optional(),
  nursing_notes: z.string().optional(),
  interventions: z.string().optional(),
  monitoring_requirements: z.string().optional(),
  care_task_frequency: z.string().optional(),
  // Risk assessments
  fall_risk: RiskLevelSchema,
  fall_risk_display: z.string().optional(),
  pressure_sore_risk: RiskLevelSchema,
  pressure_sore_risk_display: z.string().optional(),
  // Isolation
  isolation_required: z.boolean(),
  isolation_type: z.string().optional(),
  // Related notes
  shift_notes: z.array(KardexShiftNoteSchema).optional(),
  handover_notes: z.array(KardexHandoverNoteSchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type NursingKardexSchemaType = z.infer<typeof NursingKardexSchema>;

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
