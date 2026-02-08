/**
 * Zod schemas for Clinic API response validation
 *
 * These schemas validate API responses at runtime to catch data shape mismatches
 * before they cause runtime errors in components (e.g., "staff.map is not a function").
 */
import { z } from 'zod';

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

export const ClinicEnrollmentSchema = z.object({
  id: z.number(),
  clinic: z.number(),
  clinic_name: z.string(),
  patient: z.number(),
  patient_mrn: z.string(),
  patient_name: z.string(),
  enrollment_number: z.string(),
  enrollment_date: z.string(),
  status: EnrollmentStatusSchema,
  status_display: z.string(),
  program_data: z.record(z.unknown()),
  next_appointment_date: z.string().nullable(),
  last_visit_date: z.string().nullable(),
  visit_count: z.number(),
  notes: z.string(),
  enrolled_by: z.number(),
  enrolled_by_name: z.string(),
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
