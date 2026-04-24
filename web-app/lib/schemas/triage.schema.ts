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
  // Neonatal-specific
  'NEONATAL_SEPSIS',
  'NEONATAL_JAUNDICE',
  'NEONATAL_RESPIRATORY_DISTRESS',
  'BIRTH_ASPHYXIA',
  // Pediatric-specific
  'FEBRILE_CONVULSION',
  'CROUP',
  'BRONCHIOLITIS',
  'SEVERE_MALARIA',
  'OTHER',
]);

export const AgeGroupSchema = z.enum([
  'neonate', 'infant', 'toddler', 'preschool', 'child', 'adolescent', 'adult',
]);

export const DehydrationLevelSchema = z.enum(['NONE', 'SOME', 'SEVERE']);

export const FontanelleStatusSchema = z.enum(['NORMAL', 'BULGING', 'SUNKEN']);

export const BreastfeedingAbilitySchema = z.enum(['NORMAL', 'REDUCED', 'UNABLE']);

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
  '', // Empty when clinic is assigned instead
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
  'GCS',
  'GENERAL',
]);

export const AlertSeveritySchema = z.enum(['CRITICAL', 'WARNING']);

export const WaitingQueueStatusSchema = z.enum(['WAITING_TRIAGE', 'IN_TRIAGE', 'TRIAGED', 'CANCELLED']);

// =============================================================================
// TRIAGE ALERT SCHEMA
// =============================================================================

export const AlertSourceSchema = z.enum(['vitals', 'cds', 'ai']);

export const TriageAlertSchema = z.object({
  id: z.string(),
  severity: AlertSeveritySchema,
  vital_type: VitalTypeSchema,
  message: z.string(),
  value: z.number().nullable(),
  threshold: z.number().nullable(),
  clinical_note: z.string().optional().nullable(),
  actions: z.array(z.string()).optional().nullable(),
  /** Origin of the alert – defaults to 'vitals' when absent. */
  source: AlertSourceSchema.optional(),
});

export type TriageAlertSchemaType = z.infer<typeof TriageAlertSchema>;

// =============================================================================
// TRIAGE VITAL THRESHOLD SCHEMA
// =============================================================================

/** Strict vital type schema for threshold records (backend has only 6 types) */
export const ThresholdVitalTypeSchema = z.enum([
  'SPO2', 'SYSTOLIC_BP', 'DIASTOLIC_BP',
  'HEART_RATE', 'TEMPERATURE', 'RESPIRATORY_RATE',
]);

export const TriageVitalThresholdSchema = z.object({
  id: z.number(),
  vital_type: ThresholdVitalTypeSchema,
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

  // Glasgow Coma Scale (optional - for trauma/neuro cases)
  gcs_eye: z.number().min(1).max(4).optional().nullable(),
  gcs_verbal: z.number().min(1).max(5).optional().nullable(),
  gcs_motor: z.number().min(1).max(6).optional().nullable(),
  gcs_total: z.number().min(3).max(15).optional().nullable(),
  gcs_severity: z.enum(['severe', 'moderate', 'mild']).optional().nullable(),

  mobility: MobilityStatusSchema,
  allergies_noted: z.string(),
  spo2: z.number().optional().nullable(),
  heart_rate: z.number().optional().nullable(),
  systolic_bp: z.number().optional().nullable(),
  diastolic_bp: z.number().optional().nullable(),
  temperature: z.number().optional().nullable(),
  respiratory_rate: z.number().optional().nullable(),
  weight: z.union([z.coerce.number(), z.null()]).optional().nullable(),
  height: z.union([z.coerce.number(), z.null()]).optional().nullable(),
  referring_facility_name: z.string().optional().default(''),
  vitals: z.record(z.unknown()).optional(),

  // ETAT pediatric fields
  // Django uses blank=True, default="" for optional CharField choices,
  // so empty strings must be accepted alongside the enum values.
  age_group: AgeGroupSchema.optional().nullable(),
  etat_danger_signs: z.array(z.string()).optional().default([]),
  dehydration_level: DehydrationLevelSchema.or(z.literal('')).optional().nullable().default(null),
  fontanelle_status: FontanelleStatusSchema.or(z.literal('')).optional().nullable().default(null),
  breastfeeding_ability: BreastfeedingAbilitySchema.or(z.literal('')).optional().nullable().default(null),
  capillary_refill_seconds: z.number().optional().nullable().default(null),
  muac_cm: z.number().optional().nullable().default(null),

  // Triage decision
  triage_category: TriageCategorySchema,
  auto_calculated_category: TriageCategorySchema,
  category_override_reason: z.string().nullable(),

  // Routing - either assigned_area OR assigned_clinic
  assigned_area: AssignedAreaSchema.optional().default(''),
  assigned_clinic: z.number().nullish().default(null),
  assigned_clinic_name: z.string().nullish().default(null),
  routing_destination: z.string().nullish().default('Not assigned'),
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
  assigned_clinic: z.number().optional().nullable(),
  assigned_clinic_name: z.string().optional().nullable(),
  routing_destination: z.string().optional().nullable(),
  arrival_time: z.string(),
  triage_time: z.string(),
  notes: z.string().optional().nullable(),
  wait_time_minutes: z.number(),
  is_wait_exceeded: z.boolean(),
  status: QueueStatusSchema,
  called_at: z.string().nullable(),
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
  triage_room: z.number().nullable(),
  triage_room_name: z.string().nullable(),
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
  patient_name: z.string(),
  patient_mrn: z.string(),
  clinic_name: z.string(),
  queue_number: z.number(),
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
  // Additional backend fields (optional)
  total_assessments: z.number().optional(),
  max_wait_minutes: z.number().optional(),
  min_wait_minutes: z.number().optional(),
  current_queue: z.object({
    count: z.number(),
    avg_wait_minutes: z.number(),
    max_wait_minutes: z.number(),
    longest_waiting_patient: z.number(),
  }).optional(),
  completion_time: z.object({
    count: z.number(),
    avg_minutes: z.number(),
    median_minutes: z.number(),
  }).optional(),
  triage_duration: z.object({
    count: z.number(),
    avg_minutes: z.number(),
  }).optional(),
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
export type AlertSource = z.infer<typeof AlertSourceSchema>;
export type WaitingQueueStatus = z.infer<typeof WaitingQueueStatusSchema>;

// Entity types
export type TriageAlert = z.infer<typeof TriageAlertSchema>;
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

// =============================================================================
// ER BED BOARD SCHEMAS (Phase 3)
// =============================================================================

export const ERBedStatusSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE']);

export const ERZoneSchema = z.enum([
  'ER_RESUS',
  'ER_ACUTE',
  'ER_FAST_TRACK',
  'OBSERVATION',
  'TRAUMA',
  'PEDIATRIC_ER',
  'MATERNITY',
]);

export const ERBedSchema = z.object({
  id: z.number(),
  zone: ERZoneSchema,
  zone_display: z.string(),
  bed_number: z.string(),
  status: ERBedStatusSchema,
  status_display: z.string(),
  current_patient: z.number().nullable(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  current_triage_assessment: z.number().nullable(),
  triage_category: z.union([TriageCategorySchema, z.literal('')]),
  occupied_duration_minutes: z.number().nullable(),
  is_available: z.boolean(),
  notes: z.string(),
  status_changed_at: z.string(),
  status_changed_by: z.number().nullable(),
  created_at: z.string(),
});

export const ERBedListItemSchema = z.object({
  id: z.number(),
  zone: ERZoneSchema,
  bed_number: z.string(),
  status: ERBedStatusSchema,
  current_patient: z.number().nullable(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  triage_category: z.union([TriageCategorySchema, z.literal('')]),
  occupied_duration_minutes: z.number().nullable(),
  is_available: z.boolean(),
});

export const ERBedZoneGroupSchema = z.object({
  zone: ERZoneSchema,
  zone_display: z.string(),
  beds: z.array(ERBedSchema),
});

export const ERBedZoneSummarySchema = z.object({
  zone: ERZoneSchema,
  zone_display: z.string(),
  total_beds: z.number(),
  available: z.number(),
  occupied: z.number(),
  cleaning: z.number(),
  out_of_service: z.number(),
  occupancy_rate: z.number(),
});

export const ERBedBoardResponseSchema = z.array(ERBedZoneGroupSchema);
export const ERBedSummaryResponseSchema = z.array(ERBedZoneSummarySchema);
export const PaginatedERBedSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ERBedListItemSchema),
});

// ER Bed types
export type ERBedStatus = z.infer<typeof ERBedStatusSchema>;
export type ERZone = z.infer<typeof ERZoneSchema>;
export type ERBed = z.infer<typeof ERBedSchema>;
export type ERBedListItem = z.infer<typeof ERBedListItemSchema>;
export type ERBedZoneGroup = z.infer<typeof ERBedZoneGroupSchema>;
export type ERBedZoneSummary = z.infer<typeof ERBedZoneSummarySchema>;


// =============================================================================
// PHASE 4: AUTO-ESCALATION & ALERTS
// =============================================================================

export const BreachSeveritySchema = z.enum(['CRITICAL', 'URGENT', 'WARNING', 'INFO']);
export const BreachStatusSchema = z.enum(['ACTIVE', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED']);
export const EscalationTypeSchema = z.enum(['CHARGE_NURSE', 'ADDITIONAL_STAFF', 'SUPERVISOR']);
export const EscalationStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']);

export const WaitTimeBreachSchema = z.object({
  id: z.number(),
  queue_entry: z.number(),
  triage_assessment: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  triage_category: TriageCategorySchema,
  severity: BreachSeveritySchema,
  target_wait_minutes: z.number(),
  actual_wait_minutes: z.number(),
  assigned_area: z.string(),
  assigned_area_display: z.string().optional().default(''),
  status: BreachStatusSchema,
  acknowledged_by: z.number().nullable(),
  acknowledged_at: z.string().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedWaitTimeBreachSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WaitTimeBreachSchema),
});

export const BreachSummarySchema = z.object({
  total_active: z.number(),
  by_severity: z.record(z.string(), z.number()).default({}),
  by_category: z.record(z.string(), z.number()).default({}),
});

export const EscalationSchema = z.object({
  id: z.number(),
  queue_entry: z.number(),
  triage_assessment: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  escalation_type: EscalationTypeSchema,
  escalation_type_display: z.string(),
  reason: z.string(),
  status: EscalationStatusSchema,
  status_display: z.string(),
  wait_time_at_escalation: z.number().nullable(),
  triage_category: z.string(),
  assigned_area: z.string(),
  escalated_by: z.number().nullable(),
  escalated_by_name: z.string(),
  resolved_by: z.number().nullable(),
  resolved_at: z.string().nullable(),
  resolution_notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedEscalationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(EscalationSchema),
});

// =============================================================================
// TRIAGE SETTINGS & ROOM ROUTING SCHEMAS
// =============================================================================

export const TriageSettingsSchema = z.object({
  id: z.number(),
  facility: z.number(),
  auto_route_to_room: z.boolean(),
  triage_department: z.number().nullable(),
  triage_department_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TriageSettings = z.infer<typeof TriageSettingsSchema>;

export const AvailableTriageRoomSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  capacity: z.number(),
  current_load: z.number(),
  has_active_staff: z.boolean(),
  is_available: z.boolean(),
});

export type AvailableTriageRoom = z.infer<typeof AvailableTriageRoomSchema>;
