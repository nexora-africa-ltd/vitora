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
