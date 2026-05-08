/**
 * Zod schemas for Worksheets & Label Printing API responses.
 * Phase L5.3
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

export const WorksheetGroupBySchema = z.enum(['ANALYZER', 'SECTION', 'PRIORITY', 'SPECIMEN_TYPE']);
export const WorksheetExportFormatSchema = z.enum(['CSV', 'PDF', 'ZPL']);
export const WorksheetStatusSchema = z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PRINTED']);

export const LabelFormatSchema = z.enum(['ZPL', 'PDF']);
export const LabelTypeSchema = z.enum(['SPECIMEN', 'ALIQUOT', 'SLIDE', 'BLOCK', 'RACK', 'TRAY']);
export const LabelPrintJobStatusSchema = z.enum(['PENDING', 'GENERATED', 'PRINTED', 'FAILED']);

// =============================================================================
// Worksheet Template
// =============================================================================

export const WorksheetTemplateSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  group_by: WorksheetGroupBySchema,
  section_filter: z.string(),
  instrument: z.number().nullable(),
  instrument_name: z.string().nullable().optional(),
  include_qc_slots: z.boolean(),
  max_specimens_per_page: z.number(),
  default_export_format: WorksheetExportFormatSchema,
  columns: z.array(z.string()).optional(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedWorksheetTemplateSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WorksheetTemplateSchema),
});

// =============================================================================
// Worksheet Item
// =============================================================================

export const WorksheetItemSchema = z.object({
  id: z.number(),
  order_item: z.number().nullable(),
  specimen: z.number().nullable(),
  specimen_barcode: z.string(),
  patient_name: z.string(),
  test_name: z.string(),
  position: z.number(),
  is_qc_slot: z.boolean(),
});

// =============================================================================
// Worksheet (Batch)
// =============================================================================

export const WorksheetSchema = z.object({
  id: z.number(),
  worksheet_number: z.string(),
  template: z.number().nullable(),
  template_name: z.string(),
  status: WorksheetStatusSchema,
  title: z.string(),
  specimen_count: z.number(),
  export_format: z.string(),
  notes: z.string(),
  generated_by: z.number(),
  generated_by_name: z.string(),
  generated_at: z.string(),
  printed_at: z.string().nullable(),
  items: z.array(WorksheetItemSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const WorksheetListItemSchema = z.object({
  id: z.number(),
  worksheet_number: z.string(),
  template: z.number().nullable(),
  template_name: z.string(),
  status: WorksheetStatusSchema,
  title: z.string(),
  specimen_count: z.number(),
  export_format: z.string(),
  generated_by: z.number(),
  generated_by_name: z.string(),
  generated_at: z.string(),
  printed_at: z.string().nullable(),
  created_at: z.string(),
});

export const PaginatedWorksheetSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WorksheetListItemSchema),
});

// =============================================================================
// Label Template
// =============================================================================

export const LabelTemplateSchema = z.object({
  id: z.number(),
  name: z.string(),
  label_format: LabelFormatSchema,
  label_type: LabelTypeSchema,
  width_mm: z.number(),
  height_mm: z.number(),
  barcode_format: z.string(),
  include_fields: z.array(z.string()),
  zpl_template: z.string(),
  is_default: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedLabelTemplateSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(LabelTemplateSchema),
});

// =============================================================================
// Label Print Job Item
// =============================================================================

export const LabelPrintJobItemSchema = z.object({
  id: z.number(),
  specimen: z.number(),
  specimen_barcode: z.string(),
  order_item: z.number(),
  copies: z.number(),
  label_data: z.record(z.unknown()),
});

// =============================================================================
// Label Print Job
// =============================================================================

export const LabelPrintJobSchema = z.object({
  id: z.number(),
  template: z.number().nullable(),
  template_name: z.string(),
  status: LabelPrintJobStatusSchema,
  label_count: z.number(),
  output_data: z.string(),
  error_message: z.string(),
  generated_by: z.number().nullable(),
  generated_at: z.string().nullable(),
  printed_at: z.string().nullable(),
  items: z.array(LabelPrintJobItemSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedLabelPrintJobSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(z.object({
    id: z.number(),
    template: z.number().nullable(),
    template_name: z.string(),
    status: LabelPrintJobStatusSchema,
    label_count: z.number(),
    generated_by: z.number().nullable(),
    generated_at: z.string().nullable(),
    printed_at: z.string().nullable(),
    created_at: z.string(),
  })),
});
