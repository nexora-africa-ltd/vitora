/**
 * Imaging/Radiology module type definitions.
 * Phase B: Frontend Order Management
 *
 * Based on backend models from:
 * - hmis/apps/imaging/models.py
 * - hmis/apps/imaging/serializers.py
 */

// =============================================================================
// ENUMS / CHOICE TYPES
// =============================================================================

export type ImagingModality =
  | 'XR'      // X-Ray
  | 'US'      // Ultrasound
  | 'CT'      // Computed Tomography
  | 'MRI'     // Magnetic Resonance Imaging
  | 'NM'      // Nuclear Medicine
  | 'MG'      // Mammography
  | 'FL'      // Fluoroscopy
  | 'OTHER';

export type ImagingBodyRegion =
  | 'HEAD'
  | 'NECK'
  | 'CHEST'
  | 'ABDOMEN'
  | 'PELVIS'
  | 'SPINE'
  | 'UPPER_EXTREMITY'
  | 'LOWER_EXTREMITY'
  | 'WHOLE_BODY'
  | 'OTHER';

export type ImagingOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REPORTED'
  | 'CANCELLED';

export type ImagingPriority = 'ROUTINE' | 'URGENT' | 'STAT';

export type Laterality = 'NA' | 'LEFT' | 'RIGHT' | 'BILATERAL';

// =============================================================================
// DISPLAY MAPPINGS
// =============================================================================

export const MODALITY_LABELS: Record<ImagingModality, string> = {
  XR: 'X-Ray',
  US: 'Ultrasound',
  CT: 'Computed Tomography',
  MRI: 'Magnetic Resonance Imaging',
  NM: 'Nuclear Medicine',
  MG: 'Mammography',
  FL: 'Fluoroscopy',
  OTHER: 'Other',
};

export const BODY_REGION_LABELS: Record<ImagingBodyRegion, string> = {
  HEAD: 'Head/Brain',
  NECK: 'Neck',
  CHEST: 'Chest',
  ABDOMEN: 'Abdomen',
  PELVIS: 'Pelvis',
  SPINE: 'Spine',
  UPPER_EXTREMITY: 'Upper Extremity',
  LOWER_EXTREMITY: 'Lower Extremity',
  WHOLE_BODY: 'Whole Body',
  OTHER: 'Other',
};

export const STATUS_LABELS: Record<ImagingOrderStatus, string> = {
  DRAFT: 'Draft',
  ORDERED: 'Ordered',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Pending Report',
  REPORTED: 'Reported',
  CANCELLED: 'Cancelled',
};

export const PRIORITY_LABELS: Record<ImagingPriority, string> = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  STAT: 'STAT (Immediate)',
};

export const LATERALITY_LABELS: Record<Laterality, string> = {
  NA: 'Not Applicable',
  LEFT: 'Left',
  RIGHT: 'Right',
  BILATERAL: 'Bilateral',
};

// =============================================================================
// IMAGING PROCEDURE CATALOG
// =============================================================================

/**
 * Imaging procedure from the catalog (list view).
 */
export interface ImagingProcedure {
  id: number;
  code: string;
  name: string;
  modality: ImagingModality;
  body_region: ImagingBodyRegion;
  cost: number;
  sha_claimable: boolean;
  available_in_house: boolean;
  is_active: boolean;
}

/**
 * Imaging procedure with full details (detail view).
 */
export interface ImagingProcedureDetail extends ImagingProcedure {
  radlex_code?: string | null;
  loinc_code?: string | null;
  requires_contrast: boolean;
  requires_sedation: boolean;
  special_preparation?: string | null;
  turnaround_hours: number;
  sha_intervention_code?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Data for creating/updating an imaging procedure.
 */
export interface ImagingProcedureCreateData {
  code: string;
  name: string;
  modality: ImagingModality;
  body_region: ImagingBodyRegion;
  radlex_code?: string;
  loinc_code?: string;
  requires_contrast?: boolean;
  requires_sedation?: boolean;
  special_preparation?: string;
  turnaround_hours?: number;
  cost: number;
  sha_claimable?: boolean;
  sha_intervention_code?: string;
  is_active?: boolean;
  available_in_house?: boolean;
}

// =============================================================================
// IMAGING ORDER ITEM
// =============================================================================

/**
 * Individual imaging procedure within an order.
 */
export interface ImagingOrderItem {
  id: number;
  procedure: number;
  procedure_name: string;
  procedure_code: string;
  modality: ImagingModality;
  laterality: Laterality;
  specific_instructions?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  unit_cost: number;
}

// =============================================================================
// IMAGING ORDER
// =============================================================================

/**
 * Imaging order with full details.
 */
export interface ImagingOrder {
  id: number;
  order_number: string;
  patient: number;
  patient_name?: string | null;
  encounter: number;
  admission?: number | null;
  ordered_by: number;
  ordered_by_name?: string | null;
  priority: ImagingPriority;
  clinical_indication: string;
  relevant_clinical_history?: string | null;
  status: ImagingOrderStatus;
  scheduled_datetime?: string | null;
  scheduled_room?: string | null;
  accession_number?: string | null;
  study_instance_uid?: string | null;
  total_cost: number;
  is_paid: boolean;
  items: ImagingOrderItem[];
  ordered_at: string;
  completed_at?: string | null;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Data for creating an imaging order item.
 */
export interface ImagingOrderItemCreateData {
  procedure_code: string;
  laterality?: Laterality;
  specific_instructions?: string;
}

/**
 * Data for creating an imaging order.
 */
export interface ImagingOrderCreateData {
  patient: number;
  encounter: number;
  priority?: ImagingPriority;
  clinical_indication: string;
  relevant_clinical_history?: string;
  items: ImagingOrderItemCreateData[];
}

/**
 * Data for scheduling an imaging order.
 */
export interface ScheduleOrderData {
  scheduled_datetime: string;
  scheduled_room?: string;
}

/**
 * Data for cancelling an imaging order.
 */
export interface CancelOrderData {
  reason?: string;
}

// =============================================================================
// QUERY PARAMS
// =============================================================================

/**
 * Params for listing imaging procedures.
 */
export interface ImagingProcedureListParams {
  search?: string;
  modality?: ImagingModality;
  body_region?: ImagingBodyRegion;
  is_active?: boolean;
  available_in_house?: boolean;
  page?: number;
  page_size?: number;
}

/**
 * Params for listing imaging orders.
 */
export interface ImagingOrderListParams {
  patient?: number;
  encounter?: number;
  status?: ImagingOrderStatus;
  priority?: ImagingPriority;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

// =============================================================================
// WORKLIST TYPES
// =============================================================================

/**
 * Worklist filter options for radiologists/technologists.
 */
export interface WorklistFilters {
  status?: ImagingOrderStatus[];
  modality?: ImagingModality[];
  priority?: ImagingPriority[];
  date_from?: string;
  date_to?: string;
}

/**
 * Worklist statistics.
 */
export interface WorklistStats {
  total_pending: number;
  total_in_progress: number;
  total_completed_today: number;
  stat_orders: number;
  urgent_orders: number;
}

// =============================================================================
// SCHEDULING / CALENDAR TYPES
// =============================================================================

/**
 * Imaging resource (room, scanner, etc.).
 */
export interface ImagingResource {
  id: number;
  name: string;
  code: string;
  resource_type: string;
  is_active: boolean;
  metadata: ImagingResourceMetadata;
}

/**
 * Metadata for imaging resources.
 */
export interface ImagingResourceMetadata {
  department?: string;
  modalities?: ImagingModality[];
  room_number?: string;
  equipment_type?: string;
  capacity?: number;
  [key: string]: unknown;
}

/**
 * Appointment summary for calendar slots.
 */
export interface CalendarAppointment {
  id: number;
  patient_name: string | null;
  appointment_number: string;
  status: string;
}

/**
 * Time slot in the scheduling calendar.
 */
export interface ImagingCalendarSlot {
  date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  appointment: CalendarAppointment | null;
}

/**
 * Resource with its availability slots for a given date.
 */
export interface ImagingResourceAvailability {
  resource: ImagingResource;
  slots: ImagingCalendarSlot[];
  total_slots: number;
  available_slots: number;
  booked_slots: number;
}

/**
 * Department calendar response.
 */
export interface ImagingCalendarResponse {
  date: string | null;
  resources: ImagingResourceAvailability[];
}

/**
 * Weekly availability for a resource.
 */
export interface ImagingWeeklyDay {
  date: string;
  day_name: string;
  slots: ImagingCalendarSlot[];
  total_slots: number;
  available_slots: number;
}

/**
 * Resource availability response.
 */
export interface ImagingResourceAvailabilityResponse {
  resource_id: number;
  date: string | null;
  slots: ImagingCalendarSlot[];
}

/**
 * Weekly availability response.
 */
export interface ImagingWeeklyAvailabilityResponse {
  resource_id: number;
  days: ImagingWeeklyDay[];
}

/**
 * Slot availability check response.
 */
export interface SlotAvailabilityCheckResponse {
  is_available: boolean;
  resource_id: number;
  date: string;
  start_time: string;
  end_time: string;
}

/**
 * Params for calendar API.
 */
export interface ImagingCalendarParams {
  date?: string;
  modality?: ImagingModality;
}

/**
 * Params for resource availability.
 */
export interface ResourceAvailabilityParams {
  date?: string;
}

/**
 * Params for weekly availability.
 */
export interface WeeklyAvailabilityParams {
  start_date?: string;
}

// =============================================================================
// DICOM TYPES (Phase C - Sprint C.3)
// =============================================================================

/**
 * DICOM instance (individual image/slice).
 */
export interface DICOMInstance {
  id: number;
  sop_instance_uid: string;
  sop_class_uid?: string | null;
  instance_number?: number | null;
  file_path: string;
  file_size: number;
  transfer_syntax_uid?: string | null;
  rows?: number | null;
  columns?: number | null;
  bits_allocated?: number | null;
  photometric_interpretation?: string | null;
  thumbnail_path?: string | null;
  created_at: string;
}

/**
 * DICOM series (list view, without instances).
 */
export interface DICOMSeriesList {
  id: number;
  series_instance_uid: string;
  series_number?: number | null;
  series_description?: string | null;
  modality: string;
  body_part_examined?: string | null;
  number_of_instances: number;
  total_file_size?: number | null;
  thumbnail_path?: string | null;
  created_at: string;
}

/**
 * DICOM series with nested instances.
 */
export interface DICOMSeries extends DICOMSeriesList {
  instances: DICOMInstance[];
}

/**
 * DICOM study (list view).
 */
export interface DICOMStudy {
  id: number;
  study_instance_uid: string;
  patient: number;
  patient_name: string;
  imaging_order?: number | null;
  study_date: string;
  study_time?: string | null;
  study_description?: string | null;
  accession_number?: string | null;
  referring_physician_name?: string | null;
  modality: string;
  institution_name?: string | null;
  number_of_series: number;
  number_of_instances: number;
  total_file_size?: number | null;
  thumbnail_path?: string | null;
  uploaded_by?: number | null;
  uploaded_by_name?: string | null;
  station_name?: string | null;
  manufacturer?: string | null;
  manufacturer_model_name?: string | null;
  device_serial_number?: string | null;
  source?: 'UPLOAD' | 'CSTORE' | 'EXTERNAL';
  calling_ae_title?: string | null;
  equipment?: number | null;
  equipment_name?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Imaging equipment record.
 */
export interface ImagingEquipment {
  id: number;
  name: string;
  modality: string;
  modality_display?: string;
  ae_title?: string | null;
  station_name?: string | null;
  manufacturer?: string | null;
  model_name?: string | null;
  serial_number?: string | null;
  software_versions?: string | null;
  room?: string | null;
  scheduling_resource?: number | null;
  is_active: boolean;
  installed_date?: string | null;
  last_calibration_date?: string | null;
  next_calibration_due?: string | null;
  is_calibration_overdue: boolean;
  notes?: string | null;
  auto_registered: boolean;
  studies_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Study share link.
 */
export interface StudyShareLink {
  id: number;
  token?: string;
  purpose: 'REFERRAL' | 'PATIENT_COPY' | 'RESEARCH' | 'INSURANCE' | 'OTHER';
  recipient_name?: string | null;
  recipient_email?: string | null;
  notes?: string | null;
  expires_at: string;
  revoked_at?: string | null;
  max_views: number;
  view_count: number;
  allow_download: boolean;
  pin_protected?: boolean;
  created_at: string;
  created_by?: number | null;
  created_by_name?: string | null;
  last_accessed_at?: string | null;
  is_usable?: boolean;
  share_url?: string;
}

/**
 * Create share link request.
 */
export interface CreateShareLinkData {
  purpose: StudyShareLink['purpose'];
  recipient_name?: string;
  recipient_email?: string;
  pin?: string;
  expires_in_hours?: number;
  max_views?: number;
  allow_download?: boolean;
}

/**
 * DICOM study detail (with nested series).
 */
export interface DICOMStudyDetail extends DICOMStudy {
  series: DICOMSeriesList[];
}

/**
 * DICOM upload response.
 */
export interface DICOMUploadResponse {
  study_instance_uid: string | null;
  instances_created: number;
  files_submitted: number;
  errors?: Array<{
    file: string;
    errors: string[];
  }>;
}

/**
 * Params for listing DICOM studies.
 */
export interface DICOMStudyListParams {
  patient?: number;
  modality?: string;
  study_date_after?: string;
  study_date_before?: string;
  imaging_order?: number;
  page?: number;
  page_size?: number;
}

/**
 * DICOM viewer tool types.
 */
export type DICOMViewerTool =
  | 'pan'
  | 'zoom'
  | 'window_level'
  | 'ruler'
  | 'angle'
  | 'rectangle'
  | 'ellipse'
  | 'freehand'
  | 'reset';

/**
 * DICOM viewer state.
 */
export interface DICOMViewerState {
  activeTool: DICOMViewerTool;
  currentInstanceIndex: number;
  currentSeriesIndex: number;
  windowWidth: number;
  windowCenter: number;
  zoom: number;
  pan: { x: number; y: number };
  invert: boolean;
  flipH: boolean;
  flipV: boolean;
  rotation: number;
}

// =============================================================================
// RADIOLOGY REPORTING (Phase D)
// =============================================================================

/**
 * Radiology report status values.
 */
export type RadiologyReportStatus = 'DRAFT' | 'PRELIMINARY' | 'FINAL' | 'AMENDED';

/**
 * Critical finding communication methods.
 */
export type CriticalCommMethod = 'phone' | 'in_person' | 'secure_message' | 'pager' | 'other';

/**
 * Status display labels for reports.
 */
export const REPORT_STATUS_LABELS: Record<RadiologyReportStatus, string> = {
  DRAFT: 'Draft',
  PRELIMINARY: 'Preliminary',
  FINAL: 'Final',
  AMENDED: 'Amended',
};

/**
 * Report amendment record.
 */
export interface ReportAmendment {
  id: number;
  amendment_number: number;
  reason: string;
  previous_findings: string;
  previous_impression: string;
  new_findings: string;
  new_impression: string;
  amended_by: number;
  amended_by_name: string;
  amended_at: string;
}

/**
 * Radiology report (full detail).
 */
export interface RadiologyReport {
  id: number;
  report_number: string;
  imaging_order: number;
  order_number: string;
  study?: number | null;

  // Patient context (from order)
  patient_name: string;
  patient_mrn: string;
  modality: string;
  study_description: string;

  // Report content
  technique: string;
  comparison: string;
  findings: string;
  impression: string;
  recommendations: string;

  // Critical findings
  is_critical: boolean;
  critical_finding_description: string;
  critical_communicated: boolean;
  critical_communicated_to: string;
  critical_communicated_method: string;
  critical_communicated_at?: string | null;
  critical_communicated_by?: number | null;
  critical_communicated_by_name: string;

  // Status and workflow
  status: RadiologyReportStatus;
  reported_by: number;
  reported_by_name: string;
  signed_at?: string | null;

  // Amendments
  amendment_count: number;
  last_amendment_reason: string;
  last_amended_at?: string | null;
  last_amended_by?: number | null;
  last_amended_by_name: string;
  amendments: ReportAmendment[];

  // Computed
  can_edit: boolean;
  can_sign: boolean;
  can_amend: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Data for creating a radiology report draft.
 */
export interface RadiologyReportCreateData {
  imaging_order: number;
  study?: number | null;
  technique?: string;
  comparison?: string;
  findings: string;
  impression: string;
  recommendations?: string;
  is_critical?: boolean;
  critical_finding_description?: string;
}

/**
 * Data for updating a radiology report.
 */
export interface RadiologyReportUpdateData {
  technique?: string;
  comparison?: string;
  findings?: string;
  impression?: string;
  recommendations?: string;
  is_critical?: boolean;
  critical_finding_description?: string;
}

/**
 * Data for amending a radiology report.
 */
export interface RadiologyReportAmendData {
  reason: string;
  findings?: string;
  impression?: string;
}

/**
 * Data for communicating a critical finding.
 */
export interface CommunicateCriticalData {
  communicated_to: string;
  method?: CriticalCommMethod;
}
