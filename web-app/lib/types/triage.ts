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
// MOBILITY STATUS
// =============================================================================

export type MobilityStatus = 'AMBULATORY' | 'WHEELCHAIR' | 'STRETCHER' | 'IMMOBILE';

export const MOBILITY_CONFIG: Record<MobilityStatus, { label: string; description: string }> = {
  AMBULATORY: { label: 'Ambulatory', description: 'Can walk independently' },
  WHEELCHAIR: { label: 'Wheelchair', description: 'Requires wheelchair' },
  STRETCHER: { label: 'Stretcher', description: 'Requires stretcher' },
  IMMOBILE: { label: 'Immobile/Carried', description: 'Cannot move, must be carried' },
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

export type AssignedArea =
  | 'ER_RESUS'
  | 'ER_ACUTE'
  | 'ER_FAST_TRACK'
  | 'OBSERVATION'
  | 'OPD'
  | 'TRAUMA'
  | 'PEDIATRIC_ER'
  | 'MATERNITY'
  | 'SPECIALTY';

export const ASSIGNED_AREA_CONFIG: Record<AssignedArea, { label: string }> = {
  ER_RESUS: { label: 'ER - Resuscitation' },
  ER_ACUTE: { label: 'ER - Acute Care' },
  ER_FAST_TRACK: { label: 'ER - Fast Track' },
  OBSERVATION: { label: 'Observation Unit' },
  OPD: { label: 'OPD' },
  TRAUMA: { label: 'Trauma Bay' },
  PEDIATRIC_ER: { label: 'Pediatric ER' },
  MATERNITY: { label: 'Maternity/Labor' },
  SPECIALTY: { label: 'Specialty Clinic' },
};

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
  | 'RESPIRATORY_RATE';

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

export interface TriageAlert {
  id: string;
  severity: AlertSeverity;
  vital_type: VitalType;
  message: string;
  value: number;
  threshold: number;
  clinical_note?: string;
  actions?: string[];
}

// =============================================================================
// TRIAGE ASSESSMENT
// =============================================================================

export interface TriageAssessment {
  id: number;
  encounter: number;
  encounter_mrn?: string;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: string;

  // Arrival information
  arrival_mode: ArrivalMode;
  arrival_time: string;

  // Clinical assessment
  chief_complaint_category: ChiefComplaintCategory;
  chief_complaint: string;
  pain_score: number | null;
  mental_status: AVPUStatus;
  mobility: MobilityStatus;
  allergies_noted: string;

  // Triage decision
  triage_category: TriageCategory;
  auto_calculated_category: TriageCategory;
  category_override_reason: string | null;
  assigned_area: AssignedArea;
  assigned_clinician: number | null;
  assigned_clinician_name?: string;

  // Timestamps
  triage_start_time: string;
  triage_end_time: string | null;
  seen_by_clinician_time: string | null;

  // Generated data
  alerts: TriageAlert[];

  // Audit
  triaged_by: number;
  triaged_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface TriageAssessmentCreateData {
  encounter: number;
  arrival_mode: ArrivalMode;
  arrival_time: string;
  chief_complaint_category: ChiefComplaintCategory;
  chief_complaint: string;
  pain_score?: number | null;
  mental_status: AVPUStatus;
  mobility: MobilityStatus;
  allergies_noted?: string;
  triage_category: TriageCategory;
  category_override_reason?: string;
  assigned_area: AssignedArea;
  assigned_clinician?: number | null;
}

// =============================================================================
// TRIAGE QUEUE
// =============================================================================

export interface TriageQueueEntry {
  id: number;
  triage_assessment: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number;
  patient_gender: string;
  triage_category: TriageCategory;
  chief_complaint: string;
  assigned_area: AssignedArea;
  assigned_area_label: string;
  arrival_time: string;
  wait_time_minutes: number;
  is_wait_exceeded: boolean;
  status: QueueStatus;
  called_at: string | null;
  called_by: number | null;
  called_by_name: string | null;
  position: number;
  alerts: TriageAlert[];
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
  patient_gender: string;
  triage_category: TriageCategory;
  chief_complaint_category: ChiefComplaintCategory;
  chief_complaint: string;
  assigned_area: AssignedArea;
  assigned_area_display: string;
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
// TRIAGE REPORTS
// =============================================================================

export interface WaitTimeStats {
  category: TriageCategory;
  target_minutes: number;
  avg_wait_minutes: number;
  median_wait_minutes: number;
  exceeded_count: number;
  exceeded_percentage: number;
  total_count: number;
}

export interface VolumeByCategory {
  category: TriageCategory;
  count: number;
  percentage: number;
}

export interface VolumeByArea {
  area: AssignedArea;
  area_label: string;
  count: number;
}

export interface LWBSStats {
  total_lwbs: number;
  lwbs_rate: number;
  avg_wait_before_lwbs_minutes: number;
  by_category: Array<{
    category: TriageCategory;
    count: number;
    rate: number;
  }>;
}

export interface TriageReportSummary {
  date_range: { start: string; end: string };
  total_assessments: number;
  avg_wait_time_minutes: number;
  median_wait_time_minutes: number;
  target_met_percentage: number;
  wait_times_by_category: WaitTimeStats[];
  volume_by_category: VolumeByCategory[];
  volume_by_area: VolumeByArea[];
  lwbs_stats: LWBSStats;
}

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export interface PaginatedTriageAssessments {
  count: number;
  next: string | null;
  previous: string | null;
  results: TriageAssessment[];
}

export interface PaginatedTriageQueue {
  count: number;
  next: string | null;
  previous: string | null;
  results: TriageQueueEntry[];
}
