/**
 * Clinic Module Type Definitions
 *
 * Types for clinic operations, sessions, visits, enrollments, and staff.
 * Implements the Clinics Module as per implementation plan.
 */

// Import schema-derived types for local use
import type {
  BloodGroup as BloodGroupType,
  RhesusFactorType,
  HivStatus as HivStatusType,
  PartnerHivStatus as PartnerHivStatusType,
  DiabetesType as DiabetesTypeType,
  ArtRegimenLine as ArtRegimenLineType,
  WhoClinicalStage as WhoClinicalStageType,
} from '@/lib/schemas/clinic.schema';

// =============================================================================
// CLINIC TYPES
// =============================================================================

/**
 * Clinic type categories
 */
export type ClinicType =
  | 'GENERAL_OPD'
  | 'FILTER_CLINIC'
  | 'ANC'
  | 'PNC'
  | 'FP'
  | 'CWC'
  | 'IMMUNIZATION'
  | 'NUTRITION'
  | 'DENTAL'
  | 'EYE'
  | 'ENT'
  | 'SURGICAL'
  | 'ORTHO'
  | 'PHYSIO'
  | 'DERM'
  | 'CCC'
  | 'TB'
  | 'DIABETIC'
  | 'HYPERTENSION'
  | 'MENTAL_HEALTH'
  | 'ONCOLOGY'
  | 'DIALYSIS'
  | 'PROCEDURE'
  | 'DRESSING'
  | 'INJECTION'
  | 'OTHER';

/**
 * Clinic status
 */
export type ClinicStatus = 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED';

/**
 * Visit status (queue states)
 */
export type ClinicVisitStatus =
  | 'REGISTERED'
  | 'WAITING'
  | 'CALLED'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'REFERRED'
  | 'NO_SHOW'
  | 'CANCELLED';

/**
 * Visit priority levels
 */
export type ClinicVisitPriority =
  | 'EMERGENCY'
  | 'URGENT'
  | 'PRIORITY'
  | 'STANDARD'
  | 'NON_URGENT';

/**
 * Visit type
 */
export type ClinicVisitType =
  | 'NEW'
  | 'RETURN'
  | 'FOLLOW_UP'
  | 'REFERRAL'
  | 'SCHEDULED'
  | 'EMERGENCY';

/**
 * Visit source
 */
export type ClinicVisitSource =
  | 'TRIAGE'
  | 'DIRECT'
  | 'REFERRAL'
  | 'APPOINTMENT'
  | 'INPATIENT';

/**
 * Session status
 */
export type ClinicSessionStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'CANCELLED';

/**
 * Enrollment status (for chronic care)
 * Matches backend ClinicEnrollment.STATUS_CHOICES
 */
export type EnrollmentStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'COMPLETED'
  | 'TRANSFERRED'
  | 'TRANSFERRED_OUT'
  | 'LOST_TO_FOLLOW_UP'
  | 'DECEASED'
  | 'SUSPENDED';

// =============================================================================
// CHRONIC CARE TYPES (derived from Zod schemas)
// These types handle backend returning "" for optional enum fields
// =============================================================================

export type {
  BloodGroup,
  RhesusFactorType as RhesusFactor,
  HivStatus,
  PartnerHivStatus,
  DiabetesType,
  ArtRegimenLine,
  WhoClinicalStage,
} from '@/lib/schemas/clinic.schema';

/**
 * Staff role in clinic
 * Matches backend ClinicStaff.ROLE_CHOICES
 */
export type ClinicStaffRole = 'LEAD' | 'DOCTOR' | 'NURSE' | 'COUNSELOR' | 'NUTRITIONIST' | 'CLERK' | 'OTHER';

// =============================================================================
// PRIORITY CONFIGURATION
// =============================================================================

export interface ClinicPriorityConfig {
  priority: ClinicVisitPriority;
  label: string;
  description: string;
  bgColor: string;
  darkBgColor: string;
  textColor: string;
  borderColor: string;
  icon: string;
  sortOrder: number;
}

export const CLINIC_PRIORITY_CONFIG: Record<ClinicVisitPriority, ClinicPriorityConfig> = {
  EMERGENCY: {
    priority: 'EMERGENCY',
    label: 'Emergency (RED)',
    description: 'Life-threatening - immediate attention',
    bgColor: '#DC2626',
    darkBgColor: '#EF4444',
    textColor: '#FFFFFF',
    borderColor: '#B91C1C',
    icon: 'alert-circle',
    sortOrder: 1,
  },
  URGENT: {
    priority: 'URGENT',
    label: 'Urgent (ORANGE)',
    description: 'Very urgent - attention within 10 minutes',
    bgColor: '#F97316',
    darkBgColor: '#FB923C',
    textColor: '#FFFFFF',
    borderColor: '#EA580C',
    icon: 'alert-triangle',
    sortOrder: 2,
  },
  PRIORITY: {
    priority: 'PRIORITY',
    label: 'Priority (YELLOW)',
    description: 'Priority - attention within 1 hour',
    bgColor: '#EAB308',
    darkBgColor: '#FACC15',
    textColor: '#000000',
    borderColor: '#CA8A04',
    icon: 'clock',
    sortOrder: 3,
  },
  STANDARD: {
    priority: 'STANDARD',
    label: 'Standard (GREEN)',
    description: 'Standard - can wait up to 4 hours',
    bgColor: '#22C55E',
    darkBgColor: '#4ADE80',
    textColor: '#FFFFFF',
    borderColor: '#16A34A',
    icon: 'check-circle',
    sortOrder: 4,
  },
  NON_URGENT: {
    priority: 'NON_URGENT',
    label: 'Non-Urgent (BLUE)',
    description: 'Non-urgent - can wait up to 8 hours',
    bgColor: '#3B82F6',
    darkBgColor: '#60A5FA',
    textColor: '#FFFFFF',
    borderColor: '#2563EB',
    icon: 'info',
    sortOrder: 5,
  },
};

// =============================================================================
// CLINIC MODEL
// =============================================================================

export interface Clinic {
  id: number;
  name: string;
  clinic_type: ClinicType;
  clinic_type_display: string;
  code: string;
  description: string;
  location: string;
  floor: string;
  capacity: number;
  status: ClinicStatus;
  status_display: string;
  requires_appointment: boolean;
  requires_referral: boolean;
  accepts_walk_ins: boolean;
  triage_required: boolean;
  eligibility_rules: Record<string, unknown> | null;
  default_service_fee: string | null;
  sha_service_code: string;
  dhis2_org_unit_id: string;
  moh_code: string;
  default_clinical_template: number | null;
  is_sensitive: boolean;
  required_permission: string;
  is_open_today: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClinicListItem {
  id: number;
  name: string;
  clinic_type: ClinicType;
  clinic_type_display: string;
  code: string;
  status: ClinicStatus;
  location: string;
  is_sensitive?: boolean;
  is_open_today: boolean;
}

// =============================================================================
// CLINIC SESSION MODEL
// =============================================================================

export interface ClinicSession {
  id: number;
  clinic: number;
  clinic_name: string;
  session_date: string;
  status: ClinicSessionStatus;
  status_display: string;
  opened_at: string | null;
  closed_at: string | null;
  opened_by: number | null;
  opened_by_name?: string | null; // May not be returned by API
  closed_by: number | null;
  closed_by_name?: string | null; // May not be returned by API
  patients_registered: number;
  patients_seen: number;
  patients_waiting: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// CLINIC VISIT MODEL (Queue Entry)
// =============================================================================

export interface ClinicVisitPatient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  age: number | null;
  gender: string;
  phone_number: string;
}

export interface ClinicVisit {
  id: number;
  session: number;
  patient: ClinicVisitPatient;
  queue_number: number;
  status: ClinicVisitStatus;
  status_display: string;
  priority: ClinicVisitPriority;
  priority_display: string;
  visit_type: ClinicVisitType;
  visit_type_display: string;
  source: ClinicVisitSource;
  source_display: string;
  chief_complaint: string;
  notes: string;
  registered_at: string;
  called_at: string | null;
  consultation_started_at: string | null;
  completed_at: string | null;
  wait_time_minutes: number;
  encounter: number | null;
  triage_assessment: number | null;
  assigned_clinician: number | null;
  assigned_clinician_name: string | null;
  referred_from: number | null;
  referred_to_clinic: number | null;
  referral_reason: string;
  registered_by: number;
  registered_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicVisitCreateData {
  session?: number;
  patient_id: number;
  priority?: ClinicVisitPriority;
  visit_type?: ClinicVisitType;
  source?: ClinicVisitSource;
  chief_complaint?: string;
  notes?: string;
  assigned_clinician?: number;
  triage_assessment_id?: number;
}

export interface ClinicVisitReferData {
  target_clinic_id: number;
  reason: string;
  priority?: ClinicVisitPriority;
  notes?: string;
}

// =============================================================================
// CLINIC STAFF MODEL
// =============================================================================

export interface ClinicStaff {
  id: number;
  clinic: number;
  clinic_name: string;
  user: number;
  user_name: string;
  user_email: string;
  role: ClinicStaffRole;
  role_display: string;
  is_primary: boolean;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicStaffCreateData {
  user_id: number;
  role: ClinicStaffRole;
  is_primary?: boolean;
  start_date?: string;
  notes?: string;
}

// =============================================================================
// CLINIC SCHEDULE MODEL
// =============================================================================

export interface ClinicSchedule {
  id: number;
  clinic: number;
  clinic_name: string;
  day_of_week: number;
  day_of_week_display: string;
  start_time: string;
  end_time: string;
  max_patients: number;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicScheduleCreateData {
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_patients?: number;
  is_active?: boolean;
  notes?: string;
}

// =============================================================================
// CLINIC ENROLLMENT MODEL (Chronic Care)
// =============================================================================

/**
 * Clinic Enrollment interface - matches backend ClinicEnrollmentSerializer.
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
export interface ClinicEnrollment {
  // Primary identifiers
  id: number;
  clinic: number;
  clinic_name: string;
  clinic_type?: ClinicType | null;
  patient: number;
  patient_mrn: string;
  patient_name: string;
  enrollment_number: string;
  enrollment_date: string;

  // Status
  status: EnrollmentStatus;
  status_display: string;

  // Program data - backend uses enrollment_data, frontend alias program_data
  enrollment_data?: Record<string, unknown> | null;
  program_data?: Record<string, unknown>; // Backward compatibility alias

  // Appointments - backend uses next_appointment, frontend alias next_appointment_date
  next_appointment?: string | null;
  next_appointment_date?: string | null; // Backward compatibility alias
  appointment_interval_days?: number | null;
  last_visit_date: string | null;

  // Visit tracking - backend uses total_visits, frontend alias visit_count
  total_visits?: number | null;
  visit_count?: number; // Backward compatibility alias

  // Enrollment metadata
  enrolled_by: number;
  enrolled_by_name: string;
  notes?: string;

  // Outcome
  outcome_date?: string | null;
  outcome_reason?: string | null;
  transfer_facility?: string | null;

  // Computed status fields
  is_overdue?: boolean | null;
  is_defaulter?: boolean | null;
  days_since_last_visit?: number | string | null;
  days_overdue?: number | string | null;
  enrollment_type?: string | null;
  clinic_specific_summary?: string | null;

  // ===========================================
  // CCC (HIV/AIDS) FIELDS
  // ===========================================
  art_start_date?: string | null;
  current_art_regimen?: string | null;
  art_regimen_line?: ArtRegimenLineType | null;
  who_clinical_stage?: WhoClinicalStageType | number | string | null;
  baseline_cd4_count?: number | null;
  latest_cd4_count?: number | null;
  latest_cd4_date?: string | null;
  latest_viral_load?: number | null;
  latest_viral_load_date?: string | null;
  viral_load_suppressed?: boolean | null;

  // CCC computed fields
  days_on_art?: number | string | null;
  viral_load_due?: boolean | string | null;
  cd4_due?: boolean | string | null;
  is_virally_suppressed?: boolean | null;

  // ===========================================
  // ANC (ANTENATAL) FIELDS
  // ===========================================
  gravida?: number | null;
  para?: number | null;
  lmp?: string | null;
  edd?: string | null;
  height_cm?: number | null;
  blood_group?: BloodGroupType | null;
  rhesus_factor?: RhesusFactorType | null;
  hiv_status?: HivStatusType | null;
  partner_hiv_status?: PartnerHivStatusType | null;
  previous_cesarean?: boolean | null;
  high_risk_pregnancy?: boolean | null;
  high_risk_factors?: string | null;

  // ANC computed fields
  gestation_weeks?: number | null;
  gestation_display?: string | null;
  trimester?: number | string | null;
  days_to_edd?: number | null;

  // ===========================================
  // DIABETIC CLINIC FIELDS
  // ===========================================
  diabetes_type?: DiabetesTypeType | null;
  diabetes_diagnosis_date?: string | null;
  latest_hba1c?: number | null;
  latest_hba1c_date?: string | null;
  latest_fbs?: number | null;
  latest_fbs_date?: string | null;
  on_insulin?: boolean | null;
  diabetes_complications?: string | null;

  // Diabetic computed fields
  hba1c_controlled?: boolean | null;
  hba1c_due?: boolean | string | null;

  // ===========================================
  // ALERT TRACKING
  // ===========================================
  last_reminder_sent?: string | null;
  missed_appointment_alerts?: number | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ClinicEnrollmentCreateData {
  clinic_id: number;
  patient_id: number;
  enrollment_date?: string;
  program_data?: Record<string, unknown>;
  next_appointment_date?: string;
  notes?: string;
}

// =============================================================================
// QUEUE STATISTICS
// =============================================================================

export interface ClinicQueueStats {
  // Core stats (always returned)
  waiting: number;
  called: number;
  in_consultation: number;
  completed: number;
  referred: number;
  no_show: number;
  total: number;
  // API returns average_wait_time, not avg_wait_time_minutes
  average_wait_time?: number;
  // These may not be returned by all stats endpoints
  total_registered?: number;
  cancelled?: number;
  avg_wait_time_minutes?: number;
  by_priority?: Record<ClinicVisitPriority, number>;
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

export interface ClinicDashboardStats {
  clinic: ClinicListItem;
  session: ClinicSession | null;
  queue_stats: ClinicQueueStats;
  staff_on_duty: ClinicStaff[];
}

// =============================================================================
// FILTER PARAMS
// =============================================================================

export interface ClinicListParams {
  page?: number;
  page_size?: number;
  clinic_type?: ClinicType;
  status?: ClinicStatus;
  is_open_today?: boolean;
  search?: string;
}

export interface ClinicVisitListParams {
  page?: number;
  page_size?: number;
  session?: number;
  clinic?: number;
  patient?: number;
  status?: ClinicVisitStatus;
  priority?: ClinicVisitPriority;
  assigned_clinician?: number;
  date?: string;
  date_from?: string;
  date_to?: string;
}

export interface ClinicEnrollmentListParams {
  page?: number;
  page_size?: number;
  clinic?: number;
  patient?: number;
  status?: EnrollmentStatus;
  next_appointment_before?: string;
  is_overdue?: boolean;
  search?: string;
}
