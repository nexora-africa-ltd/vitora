/**
 * Zod schemas for Clinic API response validation
 *
 * These schemas validate API responses at runtime to catch data shape mismatches
 * before they cause runtime errors in components (e.g., "staff.map is not a function").
 */
import { z } from 'zod';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create an enum schema that accepts empty string from backend and transforms to null.
 * Backend may return "" for optional enum fields.
 */
function enumOrEmpty<const T extends readonly [string, ...string[]]>(values: T) {
  return z.union([
    z.enum(values),
    z.literal('').transform(() => null),
  ]);
}

// =============================================================================
// ENUMS (matching TypeScript types)
// =============================================================================

export const ClinicTypeSchema = z.enum([
  'GENERAL_OPD', 'FILTER_CLINIC', 'ANC', 'PNC', 'FP', 'CWC', 'IMMUNIZATION',
  'NUTRITION', 'DENTAL', 'EYE', 'ENT', 'SURGICAL', 'ORTHO', 'PHYSIO', 'DERM',
  'CCC', 'TB', 'DIABETIC', 'HYPERTENSION', 'MENTAL_HEALTH', 'ONCOLOGY',
  'DIALYSIS', 'PROCEDURE', 'DRESSING', 'INJECTION', 'OTHER',
]);

export const ClinicStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED']);

export const ClinicVisitStatusSchema = z.enum([
  'REGISTERED', 'WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'REFERRED', 'NO_SHOW', 'CANCELLED',
]);

export const ClinicVisitPrioritySchema = z.enum([
  'EMERGENCY', 'URGENT', 'PRIORITY', 'STANDARD', 'NON_URGENT',
]);

export const ClinicVisitTypeSchema = z.enum([
  'NEW', 'RETURN', 'FOLLOW_UP', 'REFERRAL', 'SCHEDULED', 'EMERGENCY',
]);

export const ClinicVisitSourceSchema = z.enum([
  'TRIAGE', 'DIRECT', 'REFERRAL', 'APPOINTMENT', 'INPATIENT',
]);

export const ClinicSessionStatusSchema = z.enum(['SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED']);

export const EnrollmentStatusSchema = z.enum([
  'ACTIVE', 'INACTIVE', 'TRANSFERRED', 'LOST_TO_FOLLOW_UP', 'DECEASED', 'COMPLETED', 'TRANSFERRED_OUT', 'SUSPENDED',
]);

export const ClinicStaffRoleSchema = z.enum(['LEAD', 'DOCTOR', 'NURSE', 'COUNSELOR', 'NUTRITIONIST', 'CLERK', 'OTHER']);

// Chronic care enums - use enumOrEmpty to handle backend returning ""
export const BloodGroupSchema = enumOrEmpty(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
export const RhesusFactorSchema = enumOrEmpty(['POSITIVE', 'NEGATIVE']);
export const HivStatusSchema = enumOrEmpty(['POSITIVE', 'NEGATIVE', 'UNKNOWN']);
export const PartnerHivStatusSchema = enumOrEmpty(['POSITIVE', 'NEGATIVE', 'UNKNOWN', 'NOT_TESTED']);
export const DiabetesTypeSchema = enumOrEmpty(['TYPE_1', 'TYPE_2', 'GESTATIONAL', 'OTHER']);
export const ArtRegimenLineSchema = enumOrEmpty(['FIRST_LINE', 'SECOND_LINE', 'THIRD_LINE']);
export const WhoClinicalStageSchema = z.enum(['1', '2', '3', '4']);

// =============================================================================
// CLINIC SCHEMAS
// =============================================================================

export const ClinicListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  clinic_type: ClinicTypeSchema,
  clinic_type_display: z.string(),
  code: z.string(),
  status: ClinicStatusSchema,
  location: z.string(),
  is_sensitive: z.boolean().optional(),
  is_open_today: z.boolean(),
});

export const ClinicSchema = z.object({
  id: z.number(),
  name: z.string(),
  clinic_type: ClinicTypeSchema,
  clinic_type_display: z.string(),
  code: z.string(),
  description: z.string(),
  location: z.string(),
  floor: z.string(),
  capacity: z.number(),
  status: ClinicStatusSchema,
  status_display: z.string(),
  requires_appointment: z.boolean(),
  requires_referral: z.boolean(),
  accepts_walk_ins: z.boolean(),
  triage_required: z.boolean(),
  eligibility_rules: z.record(z.unknown()).nullable(),
  default_service_fee: z.string().nullable(),
  sha_service_code: z.string(),
  dhis2_org_unit_id: z.string(),
  moh_code: z.string(),
  default_clinical_template: z.number().nullable(),
  is_sensitive: z.boolean(),
  required_permission: z.string(),
  is_open_today: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// SESSION SCHEMAS
// =============================================================================

export const ClinicSessionSchema = z.object({
  id: z.number(),
  clinic: z.number(),
  clinic_name: z.string(),
  session_date: z.string(),
  status: ClinicSessionStatusSchema,
  status_display: z.string(),
  opened_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  opened_by: z.number().nullable(),
  opened_by_name: z.string().nullable().optional(), // May not be returned by API
  closed_by: z.number().nullable(),
  closed_by_name: z.string().nullable().optional(), // May not be returned by API
  patients_registered: z.number(),
  patients_seen: z.number(),
  patients_waiting: z.number(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// VISIT/QUEUE SCHEMAS
// =============================================================================

export const ClinicVisitPatientSchema = z.object({
  id: z.number(),
  mrn: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
  date_of_birth: z.string(),
  age: z.number().nullable(),
  gender: z.string(),
  phone_number: z.string(),
});

export const ClinicVisitSchema = z.object({
  id: z.number(),
  session: z.number(),
  patient: ClinicVisitPatientSchema,
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  clinic_name: z.string().optional().nullable(),
  queue_number: z.number(),
  status: ClinicVisitStatusSchema,
  status_display: z.string(),
  priority: ClinicVisitPrioritySchema,
  priority_display: z.string(),
  visit_type: ClinicVisitTypeSchema,
  visit_type_display: z.string(),
  source: ClinicVisitSourceSchema,
  source_display: z.string(),
  chief_complaint: z.string(),
  notes: z.string(),
  consultation_fee_charged: z.boolean().optional(),
  billing_line_item: z.number().optional().nullable(),
  registered_at: z.string(),
  called_at: z.string().nullable(),
  consultation_started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  wait_time_minutes: z.number(),
  encounter: z.number().nullable(),
  triage_assessment: z.number().nullable(),
  assigned_clinician: z.number().nullable(),
  assigned_clinician_name: z.string().nullable(),
  referred_from: z.number().nullable(),
  referred_to_clinic: z.number().nullable(),
  referral_reason: z.string(),
  registered_by: z.number(),
  registered_by_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ClinicQueueStatsSchema = z.object({
  // Core stats (always returned)
  waiting: z.number(),
  called: z.number(),
  in_consultation: z.number(),
  completed: z.number(),
  referred: z.number(),
  no_show: z.number(),
  total: z.number(),
  // API returns average_wait_time, not avg_wait_time_minutes
  average_wait_time: z.number().optional(),
  // These may not be returned by all stats endpoints
  total_registered: z.number().optional(),
  cancelled: z.number().optional(),
  avg_wait_time_minutes: z.number().optional(),
  by_priority: z.object({
    EMERGENCY: z.number(),
    URGENT: z.number(),
    PRIORITY: z.number(),
    STANDARD: z.number(),
    NON_URGENT: z.number(),
  }).optional(),
});

// =============================================================================
// STAFF SCHEMAS
// =============================================================================

export const ClinicStaffSchema = z.object({
  id: z.number(),
  clinic: z.number(),
  clinic_name: z.string(),
  user: z.number(),
  user_name: z.string(),
  user_email: z.string(),
  role: ClinicStaffRoleSchema,
  role_display: z.string(),
  is_primary: z.boolean(),
  is_active: z.boolean(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// SCHEDULE SCHEMAS
// =============================================================================

export const ClinicScheduleSchema = z.object({
  id: z.number(),
  clinic: z.number(),
  clinic_name: z.string(),
  day_of_week: z.number(),
  day_of_week_display: z.string(),
  day_display: z.string().optional(),
  start_time: z.string(),
  end_time: z.string(),
  max_patients: z.number(),
  is_active: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// ENROLLMENT SCHEMAS
// =============================================================================

/**
 * ClinicEnrollmentSchema - Validates clinic enrollment responses from the backend.
 *
 * Includes all chronic care program fields:
 * - CCC (HIV/AIDS): ART regimen, viral load, CD4 count
 * - ANC (Antenatal): Gravida, para, LMP, EDD, pregnancy risk
 * - Diabetic: HbA1c, FBS, insulin, complications
 *
 * Note: Some fields have aliases for backward compatibility:
 * - program_data (frontend) ↔ enrollment_data (backend)
 * - next_appointment_date (frontend) ↔ next_appointment (backend)
 * - visit_count (frontend) ↔ total_visits (backend)
 */
export const ClinicEnrollmentSchema = z.object({
  // Primary identifiers
  id: z.number(),
  clinic: z.number(),
  clinic_name: z.string(),
  clinic_type: ClinicTypeSchema.nullable().optional(),
  patient: z.number(),
  patient_mrn: z.string(),
  patient_name: z.string(),
  enrollment_number: z.string(),
  enrollment_date: z.string(),

  // Status
  status: EnrollmentStatusSchema,
  status_display: z.string(),

  // Program data - backend uses enrollment_data, frontend alias program_data
  enrollment_data: z.record(z.unknown()).nullable().optional(),
  program_data: z.record(z.unknown()).optional(), // Backward compatibility alias

  // Appointments - backend uses next_appointment, frontend alias next_appointment_date
  next_appointment: z.string().nullable().optional(),
  next_appointment_date: z.string().nullable().optional(), // Backward compatibility alias
  appointment_interval_days: z.number().nullable().optional(),
  last_visit_date: z.string().nullable(),

  // Visit tracking - backend uses total_visits, frontend alias visit_count
  total_visits: z.number().nullable().optional(),
  visit_count: z.number().optional(), // Backward compatibility alias

  // Enrollment metadata
  enrolled_by: z.number(),
  enrolled_by_name: z.string(),
  notes: z.string().optional(),

  // Outcome
  outcome_date: z.string().nullable().optional(),
  outcome_reason: z.string().nullable().optional(),
  transfer_facility: z.string().nullable().optional(),

  // Computed status fields
  is_overdue: z.boolean().nullable().optional(),
  is_defaulter: z.boolean().nullable().optional(),
  days_since_last_visit: z.union([z.number(), z.string()]).nullable().optional(),
  days_overdue: z.union([z.number(), z.string()]).nullable().optional(),
  enrollment_type: z.string().nullable().optional(),
  clinic_specific_summary: z.string().nullable().optional(),

  // ===========================================
  // CCC (HIV/AIDS) FIELDS
  // ===========================================
  art_start_date: z.string().nullable().optional(),
  current_art_regimen: z.string().nullable().optional(),
  art_regimen_line: ArtRegimenLineSchema.nullable().optional(),
  who_clinical_stage: z.union([z.number(), z.string()]).nullable().optional(),
  baseline_cd4_count: z.number().nullable().optional(),
  latest_cd4_count: z.number().nullable().optional(),
  latest_cd4_date: z.string().nullable().optional(),
  latest_viral_load: z.number().nullable().optional(),
  latest_viral_load_date: z.string().nullable().optional(),
  viral_load_suppressed: z.boolean().nullable().optional(),

  // CCC computed fields
  days_on_art: z.union([z.number(), z.string()]).nullable().optional(),
  viral_load_due: z.union([z.boolean(), z.string()]).nullable().optional(),
  cd4_due: z.union([z.boolean(), z.string()]).nullable().optional(),
  is_virally_suppressed: z.boolean().nullable().optional(),

  // ===========================================
  // ANC (ANTENATAL) FIELDS
  // ===========================================
  gravida: z.number().nullable().optional(),
  para: z.number().nullable().optional(),
  lmp: z.string().nullable().optional(),
  edd: z.string().nullable().optional(),
  height_cm: z.number().nullable().optional(),
  blood_group: BloodGroupSchema.nullable().optional(),
  rhesus_factor: RhesusFactorSchema.nullable().optional(),
  hiv_status: HivStatusSchema.nullable().optional(),
  partner_hiv_status: PartnerHivStatusSchema.nullable().optional(),
  previous_cesarean: z.boolean().nullable().optional(),
  high_risk_pregnancy: z.boolean().nullable().optional(),
  high_risk_factors: z.string().nullable().optional(),

  // ANC computed fields
  gestation_weeks: z.number().nullable().optional(),
  gestation_display: z.string().nullable().optional(),
  trimester: z.union([z.number(), z.string()]).nullable().optional(),
  days_to_edd: z.number().nullable().optional(),

  // ===========================================
  // DIABETIC CLINIC FIELDS
  // ===========================================
  diabetes_type: DiabetesTypeSchema.nullable().optional(),
  diabetes_diagnosis_date: z.string().nullable().optional(),
  latest_hba1c: z.number().nullable().optional(),
  latest_hba1c_date: z.string().nullable().optional(),
  latest_fbs: z.number().nullable().optional(),
  latest_fbs_date: z.string().nullable().optional(),
  on_insulin: z.boolean().nullable().optional(),
  diabetes_complications: z.string().nullable().optional(),

  // Diabetic computed fields
  hba1c_controlled: z.boolean().nullable().optional(),
  hba1c_due: z.union([z.boolean(), z.string()]).nullable().optional(),

  // ===========================================
  // ALERT TRACKING
  // ===========================================
  last_reminder_sent: z.string().nullable().optional(),
  missed_appointment_alerts: z.number().nullable().optional(),

  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// DASHBOARD SCHEMAS
// =============================================================================

export const ClinicDashboardStatsSchema = z.object({
  clinic: ClinicListItemSchema,
  session: ClinicSessionSchema.nullable(),
  queue_stats: ClinicQueueStatsSchema,
  staff_on_duty: z.array(ClinicStaffSchema),
});

// =============================================================================
// PAGINATED RESPONSE SCHEMAS
// =============================================================================

export const paginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

// Pre-built paginated schemas for common use
export const PaginatedClinicListSchema = paginatedResponse(ClinicListItemSchema);
export const PaginatedClinicSessionSchema = paginatedResponse(ClinicSessionSchema);
export const PaginatedClinicVisitSchema = paginatedResponse(ClinicVisitSchema);
export const PaginatedClinicEnrollmentSchema = paginatedResponse(ClinicEnrollmentSchema);

// Array response schemas (for nested resources)
export const ClinicVisitArrayResponseSchema = z.object({
  results: z.array(ClinicVisitSchema),
});

export const ClinicStaffArrayResponseSchema = z.object({
  results: z.array(ClinicStaffSchema),
});

export const ClinicScheduleArrayResponseSchema = z.object({
  results: z.array(ClinicScheduleSchema),
});

// =============================================================================
// DERIVED TYPE EXPORTS
// These types are derived from schemas and should be used instead of manual
// interface definitions to ensure runtime validation matches static types.
// =============================================================================

// Enum types
export type ClinicType = z.infer<typeof ClinicTypeSchema>;
export type ClinicStatus = z.infer<typeof ClinicStatusSchema>;
export type ClinicVisitStatus = z.infer<typeof ClinicVisitStatusSchema>;
export type ClinicVisitPriority = z.infer<typeof ClinicVisitPrioritySchema>;
export type ClinicVisitType = z.infer<typeof ClinicVisitTypeSchema>;
export type ClinicVisitSource = z.infer<typeof ClinicVisitSourceSchema>;
export type ClinicSessionStatus = z.infer<typeof ClinicSessionStatusSchema>;
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusSchema>;
export type ClinicStaffRole = z.infer<typeof ClinicStaffRoleSchema>;

// Chronic care enum types (empty string transforms to null)
export type BloodGroup = z.infer<typeof BloodGroupSchema>;
export type RhesusFactorType = z.infer<typeof RhesusFactorSchema>;
export type HivStatus = z.infer<typeof HivStatusSchema>;
export type PartnerHivStatus = z.infer<typeof PartnerHivStatusSchema>;
export type DiabetesType = z.infer<typeof DiabetesTypeSchema>;
export type ArtRegimenLine = z.infer<typeof ArtRegimenLineSchema>;
export type WhoClinicalStage = z.infer<typeof WhoClinicalStageSchema>;

// Entity types
export type ClinicListItem = z.infer<typeof ClinicListItemSchema>;
export type Clinic = z.infer<typeof ClinicSchema>;
export type ClinicStaff = z.infer<typeof ClinicStaffSchema>;
export type ClinicSchedule = z.infer<typeof ClinicScheduleSchema>;
export type ClinicSession = z.infer<typeof ClinicSessionSchema>;
export type ClinicVisit = z.infer<typeof ClinicVisitSchema>;
export type ClinicEnrollment = z.infer<typeof ClinicEnrollmentSchema>;

// Paginated types
export type PaginatedClinicList = z.infer<typeof PaginatedClinicListSchema>;
export type PaginatedClinicSession = z.infer<typeof PaginatedClinicSessionSchema>;
export type PaginatedClinicVisit = z.infer<typeof PaginatedClinicVisitSchema>;
export type PaginatedClinicEnrollment = z.infer<typeof PaginatedClinicEnrollmentSchema>;
