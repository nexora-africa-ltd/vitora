/**
 * Triage Module Type Definitions
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * Implements Kenya Emergency Triage Assessment (KETA) 5-level scale
 */

// =============================================================================
// KETA TRIAGE CATEGORIES
// =============================================================================

/**
 * KETA (Kenya Emergency Triage Assessment) 5-level triage categories
 */
export type TriageCategory = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';

/**
 * Configuration for each triage category
 */
export interface TriageCategoryConfig {
  category: TriageCategory;
  label: string;
  description: string;
  targetWaitMinutes: number;
  bgColor: string;
  darkBgColor: string;
  textColor: string;
  borderColor: string;
  icon: string;
}

/**
 * KETA category configurations with target wait times per MoH Kenya standards
 */
export const TRIAGE_CATEGORY_CONFIG: Record<TriageCategory, TriageCategoryConfig> = {
  RED: {
    category: 'RED',
    label: 'Emergency - Immediate',
    description: 'Life-threatening emergencies requiring immediate intervention',
    targetWaitMinutes: 0,
    bgColor: '#DC2626', // red-600
    darkBgColor: '#EF4444', // red-500 (brighter for dark mode)
    textColor: '#FFFFFF',
    borderColor: '#B91C1C', // red-700
    icon: 'alert-circle',
  },
  ORANGE: {
    category: 'ORANGE',
    label: 'Very Urgent - <10 min',
    description: 'Very urgent conditions requiring attention within 10 minutes',
    targetWaitMinutes: 10,
    bgColor: '#F97316', // orange-500
    darkBgColor: '#FB923C', // orange-400
    textColor: '#FFFFFF',
    borderColor: '#EA580C', // orange-600
    icon: 'alert-triangle',
  },
  YELLOW: {
    category: 'YELLOW',
    label: 'Urgent - <60 min',
    description: 'Urgent conditions requiring attention within 1 hour',
    targetWaitMinutes: 60,
    bgColor: '#EAB308', // yellow-500
    darkBgColor: '#FACC15', // yellow-400
    textColor: '#000000', // Black text for contrast
    borderColor: '#CA8A04', // yellow-600
    icon: 'clock',
  },
  GREEN: {
    category: 'GREEN',
    label: 'Standard - <240 min',
    description: 'Standard/non-urgent cases, can wait up to 4 hours',
    targetWaitMinutes: 240,
    bgColor: '#22C55E', // green-500
    darkBgColor: '#4ADE80', // green-400
    textColor: '#FFFFFF',
    borderColor: '#16A34A', // green-600
    icon: 'check-circle',
  },
  BLUE: {
    category: 'BLUE',
    label: 'Non-Urgent/Referral',
    description: 'Non-urgent cases or referrals, can wait up to 8 hours',
    targetWaitMinutes: 480,
    bgColor: '#3B82F6', // blue-500
    darkBgColor: '#60A5FA', // blue-400
    textColor: '#FFFFFF',
    borderColor: '#2563EB', // blue-600
    icon: 'info',
  },
};

/**
 * Priority order for sorting (lower = higher priority)
 */
export const TRIAGE_CATEGORY_PRIORITY: Record<TriageCategory, number> = {
  RED: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
  BLUE: 5,
};

// =============================================================================
// AVPU MENTAL STATUS SCALE
// =============================================================================

export type AVPUStatus = 'A' | 'V' | 'P' | 'U';

export interface AVPUConfig {
  code: AVPUStatus;
  label: string;
  description: string;
}

export const AVPU_CONFIG: Record<AVPUStatus, AVPUConfig> = {
  A: { code: 'A', label: 'Alert', description: 'Patient is alert and responsive' },
  V: { code: 'V', label: 'Voice', description: 'Responds to voice commands' },
  P: { code: 'P', label: 'Pain', description: 'Responds only to painful stimuli' },
  U: { code: 'U', label: 'Unresponsive', description: 'Patient is unresponsive' },
};

// =============================================================================
// PATIENT JOURNEY STAGES
// =============================================================================

export type PatientStage =
  | 'REGISTERED'
  | 'AWAITING_TRIAGE'
  | 'IN_TRIAGE'
  | 'AWAITING_CONSULTATION'
  | 'IN_CONSULTATION'
  | 'COMPLETED';

export interface PatientStageConfig {
  stage: PatientStage;
  label: string;
  description: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  color: string;
}

export const PATIENT_STAGE_CONFIG: Record<PatientStage, PatientStageConfig> = {
  REGISTERED: {
    stage: 'REGISTERED',
    label: 'Registered',
    description: 'Patient has been registered in the system',
    badgeVariant: 'outline',
    color: 'gray',
  },
  AWAITING_TRIAGE: {
    stage: 'AWAITING_TRIAGE',
    label: 'Awaiting Triage',
    description: 'Patient is waiting to be triaged',
    badgeVariant: 'secondary',
    color: 'amber',
  },
  IN_TRIAGE: {
    stage: 'IN_TRIAGE',
    label: 'In Triage',
    description: 'Patient is currently being triaged',
    badgeVariant: 'default',
    color: 'blue',
  },
  AWAITING_CONSULTATION: {
    stage: 'AWAITING_CONSULTATION',
    label: 'Awaiting Consultation',
    description: 'Patient has been triaged and is waiting for consultation',
    badgeVariant: 'secondary',
    color: 'purple',
  },
  IN_CONSULTATION: {
    stage: 'IN_CONSULTATION',
    label: 'In Consultation',
    description: 'Patient is currently with a clinician',
    badgeVariant: 'default',
    color: 'green',
  },
  COMPLETED: {
    stage: 'COMPLETED',
    label: 'Completed',
    description: 'Patient visit has been completed',
    badgeVariant: 'outline',
    color: 'gray',
  },
};

// =============================================================================
// MOBILITY STATUS
// =============================================================================

export type MobilityStatus = 'AMBULATORY' | 'WHEELCHAIR' | 'STRETCHER' | 'IMMOBILE';

export interface MobilityConfig {
  label: string;
  description: string;
  severity: 'normal' | 'moderate' | 'high' | 'critical';
  colors: {
    bg: string;
    border: string;
    text: string;
    icon: string;
  };
}

export const MOBILITY_CONFIG: Record<MobilityStatus, MobilityConfig> = {
  AMBULATORY: {
    label: 'Ambulatory',
    description: 'Can walk independently',
    severity: 'normal',
    colors: {
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-700 dark:text-green-300',
      icon: 'text-green-600 dark:text-green-400',
    },
  },
  WHEELCHAIR: {
    label: 'Wheelchair',
    description: 'Requires wheelchair',
    severity: 'moderate',
    colors: {
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-700 dark:text-yellow-300',
      icon: 'text-yellow-600 dark:text-yellow-400',
    },
  },
  STRETCHER: {
    label: 'Stretcher',
    description: 'Requires stretcher',
    severity: 'high',
    colors: {
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-200 dark:border-orange-800',
      text: 'text-orange-700 dark:text-orange-300',
      icon: 'text-orange-600 dark:text-orange-400',
    },
  },
  IMMOBILE: {
    label: 'Immobile/Carried',
    description: 'Cannot move, must be carried',
    severity: 'critical',
    colors: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-700 dark:text-red-300',
      icon: 'text-red-600 dark:text-red-400',
    },
  },
};

// =============================================================================
// ARRIVAL MODE
// =============================================================================

export type ArrivalMode = 'WALK_IN' | 'AMBULANCE' | 'POLICE' | 'REFERRAL' | 'OTHER';

export const ARRIVAL_MODE_CONFIG: Record<ArrivalMode, { label: string }> = {
  WALK_IN: { label: 'Walk-in' },
  AMBULANCE: { label: 'Ambulance' },
  POLICE: { label: 'Police' },
  REFERRAL: { label: 'Referral from another facility' },
  OTHER: { label: 'Other' },
};

// =============================================================================
// CHIEF COMPLAINT CATEGORIES
// =============================================================================

export type ChiefComplaintCategory =
  | 'CHEST_PAIN'
  | 'DIFFICULTY_BREATHING'
  | 'TRAUMA'
  | 'FEVER'
  | 'ABDOMINAL_PAIN'
  | 'HEADACHE'
  | 'ALTERED_CONSCIOUSNESS'
  | 'BLEEDING'
  | 'POISONING'
  | 'OBSTETRIC'
  | 'PEDIATRIC'
  | 'OTHER';

export const CHIEF_COMPLAINT_CONFIG: Record<ChiefComplaintCategory, { label: string }> = {
  CHEST_PAIN: { label: 'Chest Pain' },
  DIFFICULTY_BREATHING: { label: 'Difficulty Breathing' },
  TRAUMA: { label: 'Trauma/Injury' },
  FEVER: { label: 'Fever' },
  ABDOMINAL_PAIN: { label: 'Abdominal Pain' },
  HEADACHE: { label: 'Headache' },
  ALTERED_CONSCIOUSNESS: { label: 'Altered Consciousness' },
  BLEEDING: { label: 'Bleeding' },
  POISONING: { label: 'Poisoning/Overdose' },
  OBSTETRIC: { label: 'Obstetric Emergency' },
  PEDIATRIC: { label: 'Pediatric Emergency' },
  OTHER: { label: 'Other' },
};

// =============================================================================
// ASSIGNED CARE AREAS
// =============================================================================

/**
 * Emergency care areas (ER zones) - use for emergencies.
 * For clinic routing, use assigned_clinic instead.
 */
export type AssignedArea =
  | 'ER_RESUS'
  | 'ER_ACUTE'
  | 'ER_FAST_TRACK'
  | 'OBSERVATION'
  | 'OPD'
  | 'TRAUMA'
  | 'PEDIATRIC_ER'
  | 'MATERNITY'
  | 'SPECIALTY'
  | ''; // Empty string when clinic is assigned

/**
 * Emergency area labels (for ER zone routing).
 * Note: OPD and SPECIALTY are deprecated in favor of clinic routing.
 */
export const ASSIGNED_AREA_CONFIG: Record<Exclude<AssignedArea, ''>, { label: string; isEmergency?: boolean }> = {
  ER_RESUS: { label: 'ER - Resuscitation', isEmergency: true },
  ER_ACUTE: { label: 'ER - Acute Care', isEmergency: true },
  ER_FAST_TRACK: { label: 'ER - Fast Track', isEmergency: true },
  OBSERVATION: { label: 'Observation Unit', isEmergency: true },
  OPD: { label: 'OPD (use clinic routing instead)' },
  TRAUMA: { label: 'Trauma Bay', isEmergency: true },
  PEDIATRIC_ER: { label: 'Pediatric ER', isEmergency: true },
  MATERNITY: { label: 'Maternity/Labor', isEmergency: true },
  SPECIALTY: { label: 'Specialty (use clinic routing instead)' },
};

/**
 * Emergency-only areas for quick selection in triage form.
 */
export const EMERGENCY_AREA_OPTIONS = [
  { value: 'ER_RESUS', label: 'ER - Resuscitation (RED)', category: 'RED' },
  { value: 'ER_ACUTE', label: 'ER - Acute Care (ORANGE)', category: 'ORANGE' },
  { value: 'TRAUMA', label: 'Trauma Bay (RED)', category: 'RED' },
  { value: 'ER_FAST_TRACK', label: 'ER - Fast Track (GREEN/BLUE)', category: 'GREEN' },
  { value: 'OBSERVATION', label: 'Observation Unit', category: 'YELLOW' },
  { value: 'PEDIATRIC_ER', label: 'Pediatric ER', category: 'ORANGE' },
  { value: 'MATERNITY', label: 'Maternity/Labor', category: 'ORANGE' },
] as const;

// =============================================================================
// QUEUE STATUS
// =============================================================================

export type QueueStatus =
  | 'WAITING'
  | 'CALLED'
  | 'WITH_CLINICIAN'
  | 'COMPLETED'
  | 'LEFT_WITHOUT_BEING_SEEN';

export const QUEUE_STATUS_CONFIG: Record<
  QueueStatus,
  { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'muted' }
> = {
  WAITING: { label: 'Waiting', variant: 'default' },
  CALLED: { label: 'Called', variant: 'info' },
  WITH_CLINICIAN: { label: 'With Doctor', variant: 'success' },
  COMPLETED: { label: 'Completed', variant: 'muted' },
  LEFT_WITHOUT_BEING_SEEN: { label: 'LWBS', variant: 'warning' },
};

// =============================================================================
// VITAL THRESHOLD TYPES
// =============================================================================

export type VitalType =
  | 'SPO2'
  | 'SYSTOLIC_BP'
  | 'DIASTOLIC_BP'
  | 'HEART_RATE'
  | 'TEMPERATURE'
  | 'RESPIRATORY_RATE'
  | 'MENTAL_STATUS'
  | 'PAIN_SCORE'
  | 'GENERAL';

export interface TriageVitalThreshold {
  id: number;
  vital_type: VitalType;
  critical_low: number | null;
  warning_low: number | null;
  warning_high: number | null;
  critical_high: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ALERT TYPES
// =============================================================================

export type AlertSeverity = 'CRITICAL' | 'WARNING';

/** Where the alert originated from. */
export type AlertSource = 'vitals' | 'cds' | 'ai';

export interface TriageAlert {
  id: string;
  severity: AlertSeverity;
  vital_type: VitalType;
  message: string;
  value: number | null;
  threshold: number | null;
  clinical_note?: string | null;
  actions?: string[] | null;
  /** Origin of the alert – defaults to 'vitals' when absent. */
  source?: AlertSource;
}

// =============================================================================
// TRIAGE ASSESSMENT
// =============================================================================

export interface TriageAssessment {
  id: number;
  encounter: number;
  encounter_mrn?: string | null;
  patient_name?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;

  // Arrival information
  arrival_mode: ArrivalMode;
  referring_facility_name?: string | null;
  arrival_time: string;

  // Clinical assessment
  chief_complaint_category: ChiefComplaintCategory;
  chief_complaint: string;
  pain_score: number | null;
  mental_status: AVPUStatus;
  mobility: MobilityStatus;
  allergies_noted: string;

  // Vital signs (captured at triage)
  spo2?: number | null;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;

  // Triage decision
  triage_category: TriageCategory;
  auto_calculated_category: TriageCategory;
  category_override_reason: string | null;

  // Routing - either assigned_area (ER zones) OR assigned_clinic (clinics)
  assigned_area: AssignedArea;
  assigned_clinic?: number | null;
  assigned_clinic_name?: string | null;
  routing_destination?: string | null; // Human-readable destination
  assigned_clinician: number | null;
  assigned_clinician_name?: string | null;

  // Timestamps
  triage_start_time: string;
  triage_end_time: string | null;
  seen_by_clinician_time: string | null;

  // Generated data
  alerts: TriageAlert[];

  // Audit
  triaged_by: number;
  triaged_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TriageAssessmentCreateData {
  encounter: number;
  arrival_mode: ArrivalMode;
  referring_facility_name?: string;
  arrival_time: string;
  chief_complaint_category: ChiefComplaintCategory;
  chief_complaint: string;
  pain_score?: number | null;
  // Vital signs
  spo2?: number | null;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;
  weight?: number | null;
  height?: number | null;
  // Assessment
  mental_status: AVPUStatus;
  mobility: MobilityStatus;
  allergies_noted?: string;
  triage_category: TriageCategory;
  auto_calculated_category?: TriageCategory;
  category_override_reason?: string;

  // Routing - provide EITHER assigned_area (ER) OR assigned_clinic (clinic), not both
  assigned_area?: AssignedArea;
  assigned_clinic?: number | null;
  assigned_clinician?: number | null;
}

// =============================================================================
// TRIAGE QUEUE
// =============================================================================

export interface TriageQueueEntry {
  id: number;
  triage_assessment: number;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number;
  patient_gender: string;
  triage_category: TriageCategory;
  chief_complaint_category: ChiefComplaintCategory;
  chief_complaint: string;
  assigned_area: AssignedArea;
  assigned_area_label: string;
  assigned_area_display: string;
  assigned_clinic?: number | null;
  assigned_clinic_name?: string | null;
  routing_destination?: string | null;
  arrival_time: string;
  triage_time: string;
  wait_time_minutes: number;
  is_wait_exceeded: boolean;
  status: QueueStatus;
  called_at: string | null;
  called_by: number | null;
  called_by_name: string | null;
  position: number;
  alerts: TriageAlert[];
  alerts_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Queue item for dashboard display (enriched view)
 */
export interface TriageQueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number;

  // Vital signs (captured at triage; optional)
  spo2?: number | null;
  heart_rate?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  temperature?: number | null;
  respiratory_rate?: number | null;
  patient_gender: string;
  triage_category: TriageCategory;
  chief_complaint_category: ChiefComplaintCategory;
  chief_complaint: string;
  assigned_area: AssignedArea;
  assigned_area_display: string;
  assigned_clinic: number | null;
  assigned_clinic_name: string | null;
  routing_destination: string;
  status: QueueStatus;
  arrival_time: string;
  triage_time: string;
  wait_time_minutes: number;
  alerts_count: number;
  called_by?: string;
  called_at?: string;
}

export interface TriageQueueListParams {
  status?: QueueStatus;
  assigned_area?: AssignedArea;
  triage_category?: TriageCategory;
  search?: string;
}

// =============================================================================
// TRIAGE REPORTS (derived from Zod schemas)
// =============================================================================

export type {
  WaitTimeStats,
  VolumeByCategory,
  VolumeByArea,
  LWBSStats,
  TriageReportSummary,
  WaitTimeStatsResponse,
  VolumeReportResponse,
  PaginatedTriageAssessment,
  PaginatedTriageQueue,
  PaginatedWaitingQueue,
} from '@/lib/schemas/triage.schema';

// Legacy alias for backwards compatibility
export type PaginatedTriageAssessments = import('@/lib/schemas/triage.schema').PaginatedTriageAssessment;

// =============================================================================
// ER BED BOARD (Phase 3)
// =============================================================================

/** ER bed status */
export type ERBedStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'OUT_OF_SERVICE';

/** ER zone code (subset of AssignedArea for ER zones only) */
export type ERZone =
  | 'ER_RESUS'
  | 'ER_ACUTE'
  | 'ER_FAST_TRACK'
  | 'OBSERVATION'
  | 'TRAUMA'
  | 'PEDIATRIC_ER'
  | 'MATERNITY';

/** Full ER bed detail */
export interface ERBed {
  id: number;
  zone: ERZone;
  zone_display: string;
  bed_number: string;
  status: ERBedStatus;
  status_display: string;
  current_patient: number | null;
  patient_name: string;
  patient_mrn: string;
  current_triage_assessment: number | null;
  triage_category: TriageCategory | '';
  occupied_duration_minutes: number | null;
  is_available: boolean;
  notes: string;
  status_changed_at: string;
  status_changed_by: number | null;
  created_at: string;
}

/** Compact ER bed for list/grid display */
export interface ERBedListItem {
  id: number;
  zone: ERZone;
  bed_number: string;
  status: ERBedStatus;
  current_patient: number | null;
  patient_name: string;
  patient_mrn: string;
  triage_category: TriageCategory | '';
  occupied_duration_minutes: number | null;
  is_available: boolean;
}

/** Zone group in bed board response */
export interface ERBedZoneGroup {
  zone: ERZone;
  zone_display: string;
  beds: ERBed[];
}

/** Zone summary for bed board */
export interface ERBedZoneSummary {
  zone: ERZone;
  zone_display: string;
  total_beds: number;
  available: number;
  occupied: number;
  cleaning: number;
  out_of_service: number;
  occupancy_rate: number;
}

/** Status display configuration for bed board */
export const ER_BED_STATUS_CONFIG: Record<ERBedStatus, {
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  AVAILABLE: {
    label: 'Available',
    color: '#22c55e',
    bgClass: 'bg-green-100 dark:bg-green-950/50',
    textClass: 'text-green-700 dark:text-green-300',
    borderClass: 'border-green-300 dark:border-green-700',
  },
  OCCUPIED: {
    label: 'Occupied',
    color: '#ef4444',
    bgClass: 'bg-destructive/10',
    textClass: 'text-destructive',
    borderClass: 'border-destructive/50',
  },
  CLEANING: {
    label: 'Cleaning',
    color: '#f59e0b',
    bgClass: 'bg-yellow-100 dark:bg-yellow-950/50',
    textClass: 'text-yellow-700 dark:text-yellow-300',
    borderClass: 'border-yellow-300 dark:border-yellow-700',
  },
  OUT_OF_SERVICE: {
    label: 'Out of Service',
    color: '#6b7280',
    bgClass: 'bg-muted',
    textClass: 'text-muted-foreground',
    borderClass: 'border-muted',
  },
};

// =============================================================================
// PHASE 4: AUTO-ESCALATION & ALERTS
// =============================================================================

/**
 * Wait time breach severity levels, mapped from KETA categories
 */
export type BreachSeverity = 'CRITICAL' | 'URGENT' | 'WARNING' | 'INFO';

/**
 * Wait time breach status
 */
export type BreachStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED';

/**
 * Escalation type choices
 */
export type EscalationType = 'CHARGE_NURSE' | 'ADDITIONAL_STAFF' | 'SUPERVISOR';

/**
 * Escalation status
 */
export type EscalationStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

/**
 * Wait time breach alert record.
 * Created by Celery task when a patient's wait time exceeds KETA target.
 */
export interface WaitTimeBreach {
  id: number;
  queue_entry: number;
  triage_assessment: number;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  triage_category: TriageCategory;
  severity: BreachSeverity;
  target_wait_minutes: number;
  actual_wait_minutes: number;
  assigned_area: string;
  status: BreachStatus;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Wait time breach summary (from /api/triage/breaches/summary/)
 */
export interface BreachSummary {
  total_active: number;
  by_severity: Partial<Record<BreachSeverity, number>>;
  by_category: Partial<Record<TriageCategory, number>>;
}

/**
 * Escalation record.
 * Created when staff escalates a patient's care.
 */
export interface Escalation {
  id: number;
  queue_entry: number;
  triage_assessment: number;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  escalation_type: EscalationType;
  escalation_type_display: string;
  reason: string;
  status: EscalationStatus;
  status_display: string;
  wait_time_at_escalation: number | null;
  triage_category: string;
  assigned_area: string;
  escalated_by: number | null;
  escalated_by_name: string;
  resolved_by: number | null;
  resolved_at: string | null;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Data required to create an escalation
 */
export interface EscalationCreateData {
  escalation_type: EscalationType;
  reason: string;
}

/**
 * Escalation type configuration for UI display
 */
export const ESCALATION_TYPE_CONFIG: Record<EscalationType, {
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}> = {
  CHARGE_NURSE: {
    label: 'Escalate to Charge Nurse',
    shortLabel: 'Charge Nurse',
    description: 'Request charge nurse for priority re-assessment',
    icon: 'user-check',
  },
  ADDITIONAL_STAFF: {
    label: 'Request Additional Staff',
    shortLabel: 'More Staff',
    description: 'Request additional staff to reduce queue load',
    icon: 'users',
  },
  SUPERVISOR: {
    label: 'Escalate to Supervisor',
    shortLabel: 'Supervisor',
    description: 'Escalate to on-duty supervisor for urgent intervention',
    icon: 'shield',
  },
};

/**
 * Breach severity configuration for UI display
 */
export const BREACH_SEVERITY_CONFIG: Record<BreachSeverity, {
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  CRITICAL: {
    label: 'Critical',
    color: '#ef4444',
    bgClass: 'bg-destructive/10',
    textClass: 'text-destructive',
    borderClass: 'border-destructive/50',
  },
  URGENT: {
    label: 'Urgent',
    color: '#f97316',
    bgClass: 'bg-orange-100 dark:bg-orange-950/50',
    textClass: 'text-orange-700 dark:text-orange-300',
    borderClass: 'border-orange-300 dark:border-orange-700',
  },
  WARNING: {
    label: 'Warning',
    color: '#eab308',
    bgClass: 'bg-yellow-100 dark:bg-yellow-950/50',
    textClass: 'text-yellow-700 dark:text-yellow-300',
    borderClass: 'border-yellow-300 dark:border-yellow-700',
  },
  INFO: {
    label: 'Info',
    color: '#6b7280',
    bgClass: 'bg-muted',
    textClass: 'text-muted-foreground',
    borderClass: 'border-muted',
  },
};
