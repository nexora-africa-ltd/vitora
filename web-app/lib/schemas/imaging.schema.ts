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
