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
