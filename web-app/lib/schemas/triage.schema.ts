/**
 * Zod schemas for Triage API response validation
 *
 * Implements validation for all Triage-related API responses.
 * See lib/types/triage.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const TriageCategorySchema = z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']);

export const AVPUStatusSchema = z.enum(['A', 'V', 'P', 'U']);

export const PatientStageSchema = z.enum([
  'REGISTERED',
  'AWAITING_TRIAGE',
  'IN_TRIAGE',
  'AWAITING_CONSULTATION',
  'IN_CONSULTATION',
  'COMPLETED',
]);

export const MobilityStatusSchema = z.enum(['AMBULATORY', 'WHEELCHAIR', 'STRETCHER', 'IMMOBILE']);

export const ArrivalModeSchema = z.enum(['WALK_IN', 'AMBULANCE', 'POLICE', 'REFERRAL', 'OTHER']);

export const ChiefComplaintCategorySchema = z.enum([
  'CHEST_PAIN',
  'DIFFICULTY_BREATHING',
  'TRAUMA',
  'FEVER',
  'ABDOMINAL_PAIN',
  'HEADACHE',
  'ALTERED_CONSCIOUSNESS',
  'BLEEDING',
  'POISONING',
  'OBSTETRIC',
  'PEDIATRIC',
  'OTHER',
]);

export const AssignedAreaSchema = z.enum([
  'ER_RESUS',
  'ER_ACUTE',
  'ER_FAST_TRACK',
  'OBSERVATION',
  'OPD',
  'TRAUMA',
  'PEDIATRIC_ER',
  'MATERNITY',
  'SPECIALTY',
]);

export const QueueStatusSchema = z.enum([
  'WAITING',
  'CALLED',
  'WITH_CLINICIAN',
  'COMPLETED',
  'LEFT_WITHOUT_BEING_SEEN',
]);

export const VitalTypeSchema = z.enum([
  'SPO2',
  'SYSTOLIC_BP',
  'DIASTOLIC_BP',
  'HEART_RATE',
  'TEMPERATURE',
  'RESPIRATORY_RATE',
  'MENTAL_STATUS',
  'PAIN_SCORE',
  'GENERAL',
]);

export const AlertSeveritySchema = z.enum(['CRITICAL', 'WARNING']);

export const WaitingQueueStatusSchema = z.enum(['WAITING_TRIAGE', 'IN_TRIAGE', 'TRIAGED', 'CANCELLED']);

// =============================================================================
// TRIAGE ALERT SCHEMA
// =============================================================================

export const TriageAlertSchema = z.object({
  id: z.string(),
  severity: AlertSeveritySchema,
  vital_type: VitalTypeSchema,
  message: z.string(),
  value: z.number().nullable(),
  threshold: z.number().nullable(),
  clinical_note: z.string().optional().nullable(),
  actions: z.array(z.string()).optional().nullable(),
});

export type TriageAlertSchemaType = z.infer<typeof TriageAlertSchema>;

// =============================================================================
// TRIAGE VITAL THRESHOLD SCHEMA
// =============================================================================

export const TriageVitalThresholdSchema = z.object({
  id: z.number(),
  vital_type: VitalTypeSchema,
  critical_low: z.number().nullable(),
  warning_low: z.number().nullable(),
  warning_high: z.number().nullable(),
  critical_high: z.number().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TriageVitalThresholdSchemaType = z.infer<typeof TriageVitalThresholdSchema>;

// =============================================================================
// TRIAGE ASSESSMENT SCHEMA
// =============================================================================

export const TriageAssessmentSchema = z.object({
  id: z.number(),
  encounter: z.number(),
  encounter_mrn: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  patient_name: z.string().optional().nullable(),
  patient_age: z.number().optional().nullable(),
  patient_gender: z.string().optional().nullable(),

  // Arrival information
  arrival_mode: ArrivalModeSchema,
  arrival_time: z.string(),

  // Clinical assessment
  chief_complaint_category: ChiefComplaintCategorySchema,
  chief_complaint: z.string(),
  pain_score: z.number().nullable(),
  mental_status: AVPUStatusSchema,
  mobility: MobilityStatusSchema,
  allergies_noted: z.string(),
  spo2: z.number().optional().nullable(),
  heart_rate: z.number().optional().nullable(),
  systolic_bp: z.number().optional().nullable(),
  diastolic_bp: z.number().optional().nullable(),
  temperature: z.number().optional().nullable(),
  respiratory_rate: z.number().optional().nullable(),
  vitals: z.record(z.unknown()).optional(),

  // Triage decision
  triage_category: TriageCategorySchema,
  auto_calculated_category: TriageCategorySchema,
  category_override_reason: z.string().nullable(),
  assigned_area: AssignedAreaSchema,
  assigned_clinician: z.number().nullable(),
  assigned_clinician_name: z.string().optional().nullable(),

  // Timestamps
  triage_start_time: z.string(),
  triage_end_time: z.string().nullable(),
  seen_by_clinician_time: z.string().nullable(),
  wait_time_minutes: z.number().optional().nullable(),
  is_wait_time_exceeded: z.boolean().optional(),

  // Generated data
  alerts: z.array(TriageAlertSchema),

  // Audit
  triaged_by: z.number(),
  triaged_by_name: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TriageAssessmentSchemaType = z.infer<typeof TriageAssessmentSchema>;

// =============================================================================
// TRIAGE QUEUE ENTRY SCHEMA
// =============================================================================

export const TriageQueueEntrySchema = z.object({
  id: z.number(),
  triage_assessment: z.number(),
  patient_id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  patient_age: z.number(),
  patient_gender: z.string(),
  triage_category: TriageCategorySchema,
  chief_complaint_category: ChiefComplaintCategorySchema,
  chief_complaint: z.string(),
  assigned_area: AssignedAreaSchema,
  assigned_area_label: z.string(),
  assigned_area_display: z.string(),
  arrival_time: z.string(),
  triage_time: z.string(),
  notes: z.string().optional().nullable(),
  wait_time_minutes: z.number(),
  is_wait_exceeded: z.boolean(),
  status: QueueStatusSchema,
  called_at: z.string().nullable(),
  called_by: z.number().nullable(),
  called_by_name: z.string().nullable(),
  position: z.number(),
  alerts: z.array(TriageAlertSchema),
  alerts_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TriageQueueEntrySchemaType = z.infer<typeof TriageQueueEntrySchema>;

// =============================================================================
// WAITING QUEUE ENTRY SCHEMA
// =============================================================================

export const WaitingQueueEntrySchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  patient_age: z.number().nullable(),
  patient_gender: z.string(),
  encounter: z.number().nullable(),
  check_in_time: z.string(),
  reason_for_visit: z.string(),
  status: WaitingQueueStatusSchema,
  priority_hint: z.string(),
  notes: z.string(),
  wait_time_minutes: z.number(),
  created_at: z.string(),
});

export type WaitingQueueEntrySchemaType = z.infer<typeof WaitingQueueEntrySchema>;

// =============================================================================
// CALCULATE CATEGORY RESPONSE SCHEMA
// =============================================================================

export const CalculateCategoryResponseSchema = z.object({
  suggested_category: TriageCategorySchema,
  alerts: z.array(TriageAlertSchema),
  reasoning: z.string().optional().nullable(),
  vitals: z.record(z.unknown()).optional(),
});

export type CalculateCategoryResponseSchemaType = z.infer<typeof CalculateCategoryResponseSchema>;

// =============================================================================
// ROUTE TO CLINIC RESPONSE SCHEMA
// =============================================================================

export const RouteToClinicResponseSchema = z.object({
  id: z.number(),
  queue_number: z.string(),
  patient: z.object({
    id: z.number(),
    full_name: z.string(),
    mrn: z.string(),
  }),
  session: z.object({
    id: z.number(),
    clinic: z.object({
      id: z.number(),
      name: z.string(),
    }),
    session_date: z.string(),
  }),
  status: z.string(),
  priority: z.string(),
  chief_complaint: z.string(),
  notes: z.string(),
  registered_at: z.string(),
});

export type RouteToClinicResponseSchemaType = z.infer<typeof RouteToClinicResponseSchema>;

// =============================================================================
// REPORT SCHEMAS
// =============================================================================

export const WaitTimeStatsSchema = z.object({
  category: TriageCategorySchema,
  target_minutes: z.number(),
  avg_wait_minutes: z.number(),
  median_wait_minutes: z.number(),
  exceeded_count: z.number(),
  exceeded_percentage: z.number(),
  total_count: z.number(),
});

export type WaitTimeStatsSchemaType = z.infer<typeof WaitTimeStatsSchema>;

export const VolumeByCategorySchema = z.object({
  category: TriageCategorySchema,
  count: z.number(),
  percentage: z.number(),
});

export const VolumeByAreaSchema = z.object({
  area: AssignedAreaSchema,
  area_label: z.string(),
  count: z.number(),
});

export const LWBSStatsSchema = z.object({
  total_lwbs: z.number(),
  lwbs_rate: z.number(),
  avg_wait_before_lwbs_minutes: z.number(),
  by_category: z.array(z.object({
    category: TriageCategorySchema,
    count: z.number(),
    rate: z.number(),
  })),
});

export const TriageReportSummarySchema = z.object({
  date_range: z.object({
    start: z.string(),
    end: z.string(),
  }),
  total_assessments: z.number(),
  avg_wait_time_minutes: z.number(),
  median_wait_time_minutes: z.number(),
  target_met_percentage: z.number(),
  wait_times_by_category: z.array(WaitTimeStatsSchema),
  volume_by_category: z.array(VolumeByCategorySchema),
  volume_by_area: z.array(VolumeByAreaSchema),
  lwbs_stats: LWBSStatsSchema,
});

export type TriageReportSummarySchemaType = z.infer<typeof TriageReportSummarySchema>;

export const WaitTimeStatsResponseSchema = z.object({
  avg_wait_minutes: z.number(),
  median_wait_minutes: z.number(),
  target_met_percentage: z.number(),
  by_category: z.array(WaitTimeStatsSchema),
});

export type WaitTimeStatsResponseSchemaType = z.infer<typeof WaitTimeStatsResponseSchema>;

export const VolumeReportResponseSchema = z.object({
  by_category: z.array(z.object({
    category: TriageCategorySchema,
    count: z.number(),
    percentage: z.number(),
  })),
  by_area: z.array(z.object({
    area: AssignedAreaSchema,
    area_label: z.string(),
    count: z.number(),
  })),
  total: z.number(),
});

export type VolumeReportResponseSchemaType = z.infer<typeof VolumeReportResponseSchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedTriageAssessmentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TriageAssessmentSchema),
});

export const PaginatedTriageQueueSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TriageQueueEntrySchema),
});

export const PaginatedWaitingQueueSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WaitingQueueEntrySchema),
});

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const TriageVitalThresholdArraySchema = z.array(TriageVitalThresholdSchema);

// Legacy aliases for backwards compatibility
export const TriageVitalsSchema = TriageVitalThresholdSchema;
export const TriageQueueArrayResponseSchema = z.object({
  results: z.array(TriageQueueEntrySchema),
});

// =============================================================================
// DERIVED TYPE EXPORTS
// These types are derived from schemas and should be used instead of manual
// interface definitions to ensure runtime validation matches static types.
// =============================================================================

// Enum types
export type TriageCategory = z.infer<typeof TriageCategorySchema>;
export type AssignedArea = z.infer<typeof AssignedAreaSchema>;
export type AVPUStatus = z.infer<typeof AVPUStatusSchema>;
export type PatientStage = z.infer<typeof PatientStageSchema>;
export type MobilityStatus = z.infer<typeof MobilityStatusSchema>;
export type ArrivalMode = z.infer<typeof ArrivalModeSchema>;
export type ChiefComplaintCategory = z.infer<typeof ChiefComplaintCategorySchema>;
export type QueueStatus = z.infer<typeof QueueStatusSchema>;
export type VitalType = z.infer<typeof VitalTypeSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type WaitingQueueStatus = z.infer<typeof WaitingQueueStatusSchema>;

// Entity types
export type TriageVitalThreshold = z.infer<typeof TriageVitalThresholdSchema>;
export type TriageAssessment = z.infer<typeof TriageAssessmentSchema>;
export type TriageQueueEntry = z.infer<typeof TriageQueueEntrySchema>;
export type WaitingQueueEntry = z.infer<typeof WaitingQueueEntrySchema>;
export type RouteToClinicResponse = z.infer<typeof RouteToClinicResponseSchema>;
export type CalculateCategoryResponse = z.infer<typeof CalculateCategoryResponseSchema>;

// Report types
export type WaitTimeStats = z.infer<typeof WaitTimeStatsSchema>;
export type VolumeByCategory = z.infer<typeof VolumeByCategorySchema>;
export type VolumeByArea = z.infer<typeof VolumeByAreaSchema>;
export type LWBSStats = z.infer<typeof LWBSStatsSchema>;
export type TriageReportSummary = z.infer<typeof TriageReportSummarySchema>;
export type WaitTimeStatsResponse = z.infer<typeof WaitTimeStatsResponseSchema>;
export type VolumeReportResponse = z.infer<typeof VolumeReportResponseSchema>;

// Paginated types
export type PaginatedTriageAssessment = z.infer<typeof PaginatedTriageAssessmentSchema>;
export type PaginatedTriageQueue = z.infer<typeof PaginatedTriageQueueSchema>;
export type PaginatedWaitingQueue = z.infer<typeof PaginatedWaitingQueueSchema>;
