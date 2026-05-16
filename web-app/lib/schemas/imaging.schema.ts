/**
 * Zod schemas for Imaging API response validation
 *
 * Phase B: Frontend Order Management
 * See lib/types/imaging.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const ImagingModalitySchema = z.enum([
  'XR',
  'US',
  'CT',
  'MRI',
  'NM',
  'MG',
  'FL',
  'OTHER',
]);

export const ImagingBodyRegionSchema = z.enum([
  'HEAD',
  'NECK',
  'CHEST',
  'ABDOMEN',
  'PELVIS',
  'SPINE',
  'UPPER_EXTREMITY',
  'LOWER_EXTREMITY',
  'WHOLE_BODY',
  'OTHER',
]);

export const ImagingOrderStatusSchema = z.enum([
  'DRAFT',
  'ORDERED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'REPORTED',
  'CANCELLED',
]);

export const ImagingPrioritySchema = z.enum(['ROUTINE', 'URGENT', 'STAT']);

export const LateralitySchema = z.enum(['NA', 'LEFT', 'RIGHT', 'BILATERAL']);

// =============================================================================
// IMAGING PROCEDURE SCHEMAS
// =============================================================================

/**
 * Schema for imaging procedure catalog (list view).
 */
export const ImagingProcedureSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  modality: ImagingModalitySchema,
  body_region: ImagingBodyRegionSchema,
  cost: z.union([z.number(), z.string()]).transform((val) =>
    typeof val === 'string' ? parseFloat(val) : val
  ),
  sha_claimable: z.boolean(),
  available_in_house: z.boolean(),
  is_active: z.boolean(),
});

export type ImagingProcedureSchemaType = z.infer<typeof ImagingProcedureSchema>;

/**
 * Schema for imaging procedure detail (full details).
 */
export const ImagingProcedureDetailSchema = ImagingProcedureSchema.extend({
  radlex_code: z.string().nullable().optional(),
  loinc_code: z.string().nullable().optional(),
  requires_contrast: z.boolean(),
  requires_sedation: z.boolean(),
  special_preparation: z.string().nullable().optional(),
  turnaround_hours: z.number(),
  sha_intervention_code: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ImagingProcedureDetailSchemaType = z.infer<typeof ImagingProcedureDetailSchema>;

// =============================================================================
// IMAGING ORDER ITEM SCHEMA
// =============================================================================

export const ImagingOrderItemSchema = z.object({
  id: z.number(),
  procedure: z.number(),
  procedure_name: z.string(),
  procedure_code: z.string(),
  modality: ImagingModalitySchema,
  laterality: LateralitySchema,
  specific_instructions: z.string().nullable().optional(),
  is_completed: z.boolean(),
  completed_at: z.string().nullable().optional(),
  unit_cost: z.union([z.number(), z.string()]).transform((val) =>
    typeof val === 'string' ? parseFloat(val) : val
  ),
});

export type ImagingOrderItemSchemaType = z.infer<typeof ImagingOrderItemSchema>;

// =============================================================================
// IMAGING ORDER SCHEMA
// =============================================================================

export const ImagingOrderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient: z.number(),
  patient_name: z.string().nullable().optional(),
  encounter: z.number(),
  admission: z.number().nullable().optional(),
  ordered_by: z.number(),
  ordered_by_name: z.string().nullable().optional(),
  priority: ImagingPrioritySchema,
  clinical_indication: z.string(),
  relevant_clinical_history: z.string().nullable().optional(),
  status: ImagingOrderStatusSchema,
  scheduled_datetime: z.string().nullable().optional(),
  scheduled_room: z.string().nullable().optional(),
  accession_number: z.string().nullable().optional(),
  study_instance_uid: z.string().nullable().optional(),
  total_cost: z.union([z.number(), z.string()]).transform((val) =>
    typeof val === 'string' ? parseFloat(val) : val
  ),
  is_paid: z.boolean(),
  items: z.array(ImagingOrderItemSchema),
  ordered_at: z.string(),
  completed_at: z.string().nullable().optional(),
});

export type ImagingOrderSchemaType = z.infer<typeof ImagingOrderSchema>;

// =============================================================================
// PAGINATED RESPONSE SCHEMAS
// =============================================================================

export const PaginatedImagingProcedureSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ImagingProcedureSchema),
});

export type PaginatedImagingProcedureSchemaType = z.infer<typeof PaginatedImagingProcedureSchema>;

export const PaginatedImagingOrderSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ImagingOrderSchema),
});

export type PaginatedImagingOrderSchemaType = z.infer<typeof PaginatedImagingOrderSchema>;

// =============================================================================
// ARRAY SCHEMAS
// =============================================================================

export const ImagingProcedureArraySchema = z.array(ImagingProcedureSchema);
export const ImagingOrderArraySchema = z.array(ImagingOrderSchema);

// =============================================================================
// WORKLIST STATS SCHEMA
// =============================================================================

export const WorklistStatsSchema = z.object({
  total_pending: z.number(),
  total_in_progress: z.number(),
  total_completed_today: z.number(),
  stat_orders: z.number(),
  urgent_orders: z.number(),
});

export type WorklistStatsSchemaType = z.infer<typeof WorklistStatsSchema>;

// =============================================================================
// SCHEDULING / CALENDAR SCHEMAS
// =============================================================================

/**
 * Schema for imaging resource metadata.
 */
export const ImagingResourceMetadataSchema = z.object({
  department: z.string().optional(),
  modalities: z.array(ImagingModalitySchema).optional(),
  room_number: z.string().optional(),
  equipment_type: z.string().optional(),
  capacity: z.number().optional(),
}).passthrough();

export type ImagingResourceMetadataSchemaType = z.infer<typeof ImagingResourceMetadataSchema>;

/**
 * Schema for imaging resource (room, scanner, etc.).
 */
export const ImagingResourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  resource_type: z.string(),
  is_active: z.boolean(),
  metadata: ImagingResourceMetadataSchema,
});

export type ImagingResourceSchemaType = z.infer<typeof ImagingResourceSchema>;

/**
 * Schema for calendar appointment summary.
 */
export const CalendarAppointmentSchema = z.object({
  id: z.number(),
  patient_name: z.string().nullable(),
  appointment_number: z.string(),
  status: z.string(),
});

export type CalendarAppointmentSchemaType = z.infer<typeof CalendarAppointmentSchema>;

/**
 * Schema for imaging calendar slot.
 */
export const ImagingCalendarSlotSchema = z.object({
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  is_available: z.boolean(),
  appointment: CalendarAppointmentSchema.nullable(),
});

export type ImagingCalendarSlotSchemaType = z.infer<typeof ImagingCalendarSlotSchema>;

/**
 * Schema for resource availability.
 */
export const ImagingResourceAvailabilitySchema = z.object({
  resource: ImagingResourceSchema,
  slots: z.array(ImagingCalendarSlotSchema),
  total_slots: z.number(),
  available_slots: z.number(),
  booked_slots: z.number(),
});

export type ImagingResourceAvailabilitySchemaType = z.infer<typeof ImagingResourceAvailabilitySchema>;

/**
 * Schema for department calendar response.
 */
export const ImagingCalendarResponseSchema = z.object({
  date: z.string().nullable(),
  resources: z.array(ImagingResourceAvailabilitySchema),
});

export type ImagingCalendarResponseSchemaType = z.infer<typeof ImagingCalendarResponseSchema>;

/**
 * Schema for weekly availability day.
 */
export const ImagingWeeklyDaySchema = z.object({
  date: z.string(),
  day_name: z.string(),
  slots: z.array(ImagingCalendarSlotSchema),
  total_slots: z.number(),
  available_slots: z.number(),
});

export type ImagingWeeklyDaySchemaType = z.infer<typeof ImagingWeeklyDaySchema>;

/**
 * Schema for resource availability response.
 */
export const ImagingResourceAvailabilityResponseSchema = z.object({
  resource_id: z.number(),
  date: z.string().nullable(),
  slots: z.array(ImagingCalendarSlotSchema),
});

export type ImagingResourceAvailabilityResponseSchemaType = z.infer<typeof ImagingResourceAvailabilityResponseSchema>;

/**
 * Schema for weekly availability response.
 */
export const ImagingWeeklyAvailabilityResponseSchema = z.object({
  resource_id: z.number(),
  days: z.array(ImagingWeeklyDaySchema),
});

export type ImagingWeeklyAvailabilityResponseSchemaType = z.infer<typeof ImagingWeeklyAvailabilityResponseSchema>;

/**
 * Schema for slot availability check response.
 */
export const SlotAvailabilityCheckResponseSchema = z.object({
  is_available: z.boolean(),
  resource_id: z.number(),
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
});

export type SlotAvailabilityCheckResponseSchemaType = z.infer<typeof SlotAvailabilityCheckResponseSchema>;

/**
 * Schema for resources list response.
 */
export const ImagingResourcesListResponseSchema = z.object({
  count: z.number(),
  results: z.array(ImagingResourceSchema),
});

export type ImagingResourcesListResponseSchemaType = z.infer<typeof ImagingResourcesListResponseSchema>;

// =============================================================================
// DICOM SCHEMAS (Phase C - Sprint C.3)
// =============================================================================

/**
 * Schema for a single DICOM instance.
 */
export const DICOMInstanceSchema = z.object({
  id: z.number(),
  sop_instance_uid: z.string(),
  sop_class_uid: z.string().nullable().optional(),
  instance_number: z.number().nullable().optional(),
  file_path: z.string(),
  file_size: z.number(),
  transfer_syntax_uid: z.string().nullable().optional(),
  rows: z.number().nullable().optional(),
  columns: z.number().nullable().optional(),
  bits_allocated: z.number().nullable().optional(),
  photometric_interpretation: z.string().nullable().optional(),
  thumbnail_path: z.string().nullable().optional(),
  created_at: z.string(),
});

export type DICOMInstanceSchemaType = z.infer<typeof DICOMInstanceSchema>;

/**
 * Schema for a DICOM series (list view, without instances).
 */
export const DICOMSeriesListSchema = z.object({
  id: z.number(),
  series_instance_uid: z.string(),
  series_number: z.number().nullable().optional(),
  series_description: z.string().nullable().optional(),
  modality: z.string(),
  body_part_examined: z.string().nullable().optional(),
  number_of_instances: z.number(),
  total_file_size: z.number().nullable().optional(),
  thumbnail_path: z.string().nullable().optional(),
  created_at: z.string(),
});

export type DICOMSeriesListSchemaType = z.infer<typeof DICOMSeriesListSchema>;

/**
 * Schema for a DICOM series with nested instances.
 */
export const DICOMSeriesSchema = DICOMSeriesListSchema.extend({
  instances: z.array(DICOMInstanceSchema),
});

export type DICOMSeriesSchemaType = z.infer<typeof DICOMSeriesSchema>;

/**
 * Schema for a DICOM study (list view).
 */
export const DICOMStudySchema = z.object({
  id: z.number(),
  study_instance_uid: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  imaging_order: z.number().nullable().optional(),
  study_date: z.string(),
  study_time: z.string().nullable().optional(),
  study_description: z.string().nullable().optional(),
  accession_number: z.string().nullable().optional(),
  referring_physician_name: z.string().nullable().optional(),
  modality: z.string(),
  institution_name: z.string().nullable().optional(),
  number_of_series: z.number(),
  number_of_instances: z.number(),
  total_file_size: z.number().nullable().optional(),
  thumbnail_path: z.string().nullable().optional(),
  uploaded_by: z.number().nullable().optional(),
  uploaded_by_name: z.string().nullable().optional(),
  station_name: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  manufacturer_model_name: z.string().nullable().optional(),
  device_serial_number: z.string().nullable().optional(),
  source: z.enum(['UPLOAD', 'CSTORE', 'EXTERNAL']).optional(),
  calling_ae_title: z.string().nullable().optional(),
  equipment: z.number().nullable().optional(),
  equipment_name: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DICOMStudySchemaType = z.infer<typeof DICOMStudySchema>;

/**
 * Imaging Equipment schema.
 */
export const ImagingEquipmentSchema = z.object({
  id: z.number(),
  name: z.string(),
  modality: z.string(),
  modality_display: z.string().optional(),
  ae_title: z.string().nullable().optional(),
  station_name: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  model_name: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  software_versions: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  scheduling_resource: z.number().nullable().optional(),
  is_active: z.boolean(),
  installed_date: z.string().nullable().optional(),
  last_calibration_date: z.string().nullable().optional(),
  next_calibration_due: z.string().nullable().optional(),
  is_calibration_overdue: z.boolean(),
  notes: z.string().nullable().optional(),
  auto_registered: z.boolean(),
  studies_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ImagingEquipmentSchemaType = z.infer<typeof ImagingEquipmentSchema>;

export const PaginatedImagingEquipmentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ImagingEquipmentSchema),
});

/**
 * Study share link schema.
 */
export const StudyShareLinkSchema = z.object({
  id: z.number(),
  token: z.string().optional(),
  purpose: z.enum(['REFERRAL', 'PATIENT_COPY', 'RESEARCH', 'INSURANCE', 'OTHER']),
  recipient_name: z.string().nullable().optional(),
  recipient_email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  expires_at: z.string(),
  revoked_at: z.string().nullable().optional(),
  max_views: z.number(),
  view_count: z.number(),
  allow_download: z.boolean(),
  pin_protected: z.boolean().optional(),
  created_at: z.string(),
  created_by: z.number().nullable().optional(),
  created_by_name: z.string().nullable().optional(),
  last_accessed_at: z.string().nullable().optional(),
  is_usable: z.boolean().optional(),
  share_url: z.string().optional(),
});

export type StudyShareLinkSchemaType = z.infer<typeof StudyShareLinkSchema>;
export const StudyShareLinkArraySchema = z.array(StudyShareLinkSchema);
export const StudyShareLinkListResponseSchema = z.object({
  results: z.array(StudyShareLinkSchema),
});

/**
 * Schema for DICOM study detail (with nested series).
 */
export const DICOMStudyDetailSchema = DICOMStudySchema.extend({
  series: z.array(DICOMSeriesListSchema),
});

export type DICOMStudyDetailSchemaType = z.infer<typeof DICOMStudyDetailSchema>;

/**
 * Schema for paginated DICOM studies response.
 */
export const PaginatedDICOMStudySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DICOMStudySchema),
});

export type PaginatedDICOMStudySchemaType = z.infer<typeof PaginatedDICOMStudySchema>;

/**
 * Schema for DICOM upload response.
 */
export const DICOMUploadResponseSchema = z.object({
  study_instance_uid: z.string().nullable(),
  instances_created: z.number(),
  files_submitted: z.number(),
  errors: z.array(z.object({
    file: z.string(),
    errors: z.array(z.string()),
  })).optional(),
});

export type DICOMUploadResponseSchemaType = z.infer<typeof DICOMUploadResponseSchema>;

/**
 * Array schemas for DICOM entities.
 */
export const DICOMStudyArraySchema = z.array(DICOMStudySchema);
export const DICOMSeriesArraySchema = z.array(DICOMSeriesListSchema);
export const DICOMInstanceArraySchema = z.array(DICOMInstanceSchema);

// =============================================================================
// RADIOLOGY REPORT SCHEMAS (Phase D)
// =============================================================================

export const RadiologyReportStatusSchema = z.enum(['DRAFT', 'PRELIMINARY', 'FINAL', 'AMENDED']);

export const CriticalCommMethodSchema = z.enum([
  'phone',
  'in_person',
  'secure_message',
  'pager',
  'other',
]);

/**
 * Schema for report amendment record.
 */
export const ReportAmendmentSchema = z.object({
  id: z.number(),
  amendment_number: z.number(),
  reason: z.string(),
  previous_findings: z.string(),
  previous_impression: z.string(),
  new_findings: z.string(),
  new_impression: z.string(),
  amended_by: z.number(),
  amended_by_name: z.string(),
  amended_at: z.string(),
});

export type ReportAmendmentSchemaType = z.infer<typeof ReportAmendmentSchema>;

/**
 * Schema for radiology report (full detail).
 */
export const RadiologyReportSchema = z.object({
  id: z.number(),
  report_number: z.string(),
  imaging_order: z.number(),
  order_number: z.string(),
  study: z.number().nullable().optional(),

  // Patient context
  patient_name: z.string(),
  patient_mrn: z.string(),
  modality: z.string(),
  study_description: z.string(),

  // Report content
  technique: z.string(),
  comparison: z.string(),
  findings: z.string(),
  impression: z.string(),
  recommendations: z.string(),

  // Critical findings
  is_critical: z.boolean(),
  critical_finding_description: z.string(),
  critical_communicated: z.boolean(),
  critical_communicated_to: z.string(),
  critical_communicated_method: z.string(),
  critical_communicated_at: z.string().nullable().optional(),
  critical_communicated_by: z.number().nullable().optional(),
  critical_communicated_by_name: z.string(),

  // Status and workflow
  status: RadiologyReportStatusSchema,
  reported_by: z.number(),
  reported_by_name: z.string(),
  signed_at: z.string().nullable().optional(),

  // Amendments
  amendment_count: z.number(),
  last_amendment_reason: z.string(),
  last_amended_at: z.string().nullable().optional(),
  last_amended_by: z.number().nullable().optional(),
  last_amended_by_name: z.string(),
  amendments: z.array(ReportAmendmentSchema),

  // Computed
  can_edit: z.boolean(),
  can_sign: z.boolean(),
  can_amend: z.boolean(),

  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
});

export type RadiologyReportSchemaType = z.infer<typeof RadiologyReportSchema>;

/**
 * Schema for paginated radiology reports.
 */
export const PaginatedRadiologyReportSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(RadiologyReportSchema),
});

export type PaginatedRadiologyReportSchemaType = z.infer<typeof PaginatedRadiologyReportSchema>;

/**
 * Array schema for radiology reports.
 */
export const RadiologyReportArraySchema = z.array(RadiologyReportSchema);
