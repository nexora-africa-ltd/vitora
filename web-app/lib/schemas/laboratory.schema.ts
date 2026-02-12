/**
 * Zod schemas for Laboratory API response validation
 *
 * Sprint 1.5-1.6 Track B: Lab Workflow
 * See lib/types/laboratory.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const TestCategorySchema = z.enum([
  'HEMATOLOGY',
  'CHEMISTRY',
  'MICROBIOLOGY',
  'PARASITOLOGY',
  'SEROLOGY',
  'IMMUNOLOGY',
  'URINALYSIS',
  'HISTOPATHOLOGY',
  'CYTOLOGY',
  'MOLECULAR',
  'PATHOLOGY',
  'RADIOLOGY',
  'OTHER',
]);

export const SpecimenTypeSchema = z.enum([
  'BLOOD',
  'URINE',
  'STOOL',
  'SPUTUM',
  'CSF',
  'SWAB',
  'TISSUE',
  'OTHER',
  // Additional values from OpenAPI
  'SERUM',
  'PLASMA',
  'ASPIRATE',
]);

export const ResultTypeSchema = z.enum(['NUMERIC', 'TEXT', 'OPTION', 'PANEL', 'OPTIONS']);

export const OrderTypeSchema = z.enum(['IN_HOUSE', 'EXTERNAL']);

export const LabOrderStatusSchema = z.enum([
  'DRAFT',
  'ORDERED',
  'SPECIMEN_COLLECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
]);

export const LabPrioritySchema = z.enum(['ROUTINE', 'URGENT', 'STAT']);

export const LabOrderItemStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const ResultFlagSchema = z.enum([
  'NORMAL',
  'LOW',
  'HIGH',
  'CRITICAL_LOW',
  'CRITICAL_HIGH',
  'ABNORMAL',
  'POSITIVE',
  'NEGATIVE',
]);

export const VerificationStatusSchema = z.enum(['UNVERIFIED', 'VERIFIED', 'REJECTED']);

export const QueueStatusSchema = z.enum([
  'PENDING',
  'COLLECTED',
  'PROCESSING',
  'REVIEW',
  'RELEASED',
  'REJECTED',
]);
// Alias for module-specific export to avoid conflicts with triage QueueStatusSchema
export const LabQueueStatusSchema = QueueStatusSchema;

// =============================================================================
// LAB RESULT SCHEMA (defined first for forward reference)
// =============================================================================

export const LabResultSchema = z.object({
  id: z.number(),
  order_item: z.number(),
  test_name: z.string().optional().nullable(),
  test_code: z.string().optional().nullable(),
  numeric_value: z.number().nullable().optional(),
  text_value: z.string().nullable().optional(),
  option_value: z.string().nullable().optional(),
  formatted_value: z.string().nullable().optional(),
  result_unit: z.string().nullable().optional(),
  reference_low: z.number().nullable().optional(),
  reference_high: z.number().nullable().optional(),
  reference_range_text: z.string().nullable().optional(),
  result_flag: ResultFlagSchema.nullable().optional(),
  interpretation: z.string().nullable().optional(),
  is_critical_result: z.boolean(),
  method: z.string().nullable().optional(),
  equipment: z.string().nullable().optional(),
  verification_status: VerificationStatusSchema,
  verified_by: z.number().nullable().optional(),
  verified_by_name: z.string().nullable().optional(),
  verified_at: z.string().nullable().optional(),
  entered_by: z.number(),
  entered_by_name: z.string().nullable().optional(),
  entered_at: z.string(),
  is_amended: z.boolean(),
  amendment_reason: z.string().nullable().optional(),
  original_value: z.string().nullable().optional(),
  is_external_result: z.boolean(),
  external_result_attachment: z.string().nullable().optional(),
  external_result_date: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LabResultSchemaType = z.infer<typeof LabResultSchema>;

// =============================================================================
// LAB TEST CATALOG SCHEMAS
// =============================================================================

/**
 * List schema - matches backend TestCatalogSerializer (optimized for list views).
 * Used by: listTests, searchTests endpoints
 */
export const LabTestCatalogListSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  short_name: z.string(),
  category: TestCategorySchema,
  specimen_type: SpecimenTypeSchema,
  cost: z.coerce.number(), // Backend returns DecimalField as string
  sha_claimable: z.boolean(),
  available_in_house: z.boolean(),
  is_active: z.boolean(),
});

export type LabTestCatalogListSchemaType = z.infer<typeof LabTestCatalogListSchema>;

/**
 * Detail schema - matches backend TestCatalogDetailSerializer (full fields).
 * Used by: getTest endpoint
 */
export const LabTestCatalogSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  short_name: z.string(),
  loinc_code: z.string().nullable().optional(),
  category: TestCategorySchema,
  specimen_type: SpecimenTypeSchema,
  result_type: ResultTypeSchema,
  result_unit: z.string().nullable().optional(),
  normal_range_male: z.string().nullable().optional(),
  normal_range_female: z.string().nullable().optional(),
  normal_range_child: z.string().nullable().optional(),
  cost: z.coerce.number(), // Backend returns DecimalField as string
  sha_claimable: z.boolean(),
  available_in_house: z.boolean(),
  external_lab_partner: z.string().nullable().optional(),
  turnaround_hours: z.number().nullable().optional(),
  is_panel: z.boolean(),
  panel_components: z.array(z.number()).nullable().optional(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LabTestCatalogSchemaType = z.infer<typeof LabTestCatalogSchema>;

// Alias for backward compatibility
export const LabTestSchema = LabTestCatalogSchema;

// =============================================================================
// LAB ORDER ITEM SCHEMA
// =============================================================================

export const LabOrderItemSchema = z.object({
  id: z.number(),
  lab_order: z.number(),
  test: z.number(),
  test_code: z.string(),
  test_name: z.string(),
  unit_cost: z.number(),
  status: LabOrderItemStatusSchema,
  special_instructions: z.string().nullable().optional(),
  has_result: z.boolean(),
  result: LabResultSchema.nullable().optional(),
  created_at: z.string(),
});

export type LabOrderItemSchemaType = z.infer<typeof LabOrderItemSchema>;

// =============================================================================
// LAB ORDER SCHEMA
// =============================================================================

export const LabOrderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient: z.number(),
  patient_name: z.string().nullable().optional(),
  patient_mrn: z.string().nullable().optional(),
  encounter: z.number(),
  admission: z.number().nullable().optional(),
  ordered_by: z.number(),
  ordered_by_name: z.string().nullable().optional(),
  order_type: OrderTypeSchema,
  external_lab: z.string().nullable().optional(),
  status: LabOrderStatusSchema,
  priority: LabPrioritySchema,
  clinical_notes: z.string().nullable().optional(),
  specimen_collected: z.boolean(),
  specimen_collected_at: z.string().nullable().optional(),
  specimen_collected_by: z.number().nullable().optional(),
  ordered_at: z.string(),
  completed_at: z.string().nullable().optional(),
  cancellation_reason: z.string().nullable().optional(),
  cancelled_by: z.number().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  items: z.array(LabOrderItemSchema),
  total_cost: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LabOrderSchemaType = z.infer<typeof LabOrderSchema>;

// =============================================================================
// LAB QUEUE SCHEMA
// =============================================================================

export const LabQueueSchema = z.object({
  id: z.number(),
  lab_order: z.number(),
  order_number: z.string(),
  patient_name: z.string().nullable().optional(),
  patient_mrn: z.string().nullable().optional(),
  queue_number: z.string(),
  priority: LabPrioritySchema,
  queue_status: QueueStatusSchema,
  sample_type: z.string(),
  sample_id: z.string().nullable().optional(),
  tests: z.array(z.object({ code: z.string(), name: z.string() })).nullable().optional(),
  collected_at: z.string().nullable().optional(),
  collected_by: z.number().nullable().optional(),
  collected_by_name: z.string().nullable().optional(),
  assigned_technician: z.number().nullable().optional(),
  assigned_technician_name: z.string().nullable().optional(),
  processing_started_at: z.string().nullable().optional(),
  processing_completed_at: z.string().nullable().optional(),
  reviewed_by: z.number().nullable().optional(),
  reviewed_by_name: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  released_at: z.string().nullable().optional(),
  technician_notes: z.string().nullable().optional(),
  rejection_reason: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  // TAT fields
  expected_tat_hours: z.number().nullable().optional(),
  elapsed_hours: z.number().nullable().optional(),
  actual_tat_hours: z.number().nullable().optional(),
  is_overdue: z.boolean().nullable().optional(),
});

export type LabQueueSchemaType = z.infer<typeof LabQueueSchema>;

// =============================================================================
// LAB TECHNICIAN SCHEMA
// =============================================================================

export const LabTechnicianSchema = z.object({
  id: z.number(),
  username: z.string(),
  full_name: z.string(),
});

export type LabTechnicianSchemaType = z.infer<typeof LabTechnicianSchema>;

// =============================================================================
// CRITICAL ALERT SCHEMA
// =============================================================================

export const CriticalAlertSchema = z.object({
  test_name: z.string(),
  value: z.string(),
  flag: ResultFlagSchema,
});

export type CriticalAlertSchemaType = z.infer<typeof CriticalAlertSchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedLabTestCatalogSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(LabTestCatalogListSchema), // Uses list schema for paginated results
});

export const PaginatedLabOrderSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(LabOrderSchema),
});

export const PaginatedLabQueueSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(LabQueueSchema),
});

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const LabOrderItemArrayResponseSchema = z.object({
  results: z.array(LabOrderItemSchema),
});

export const LabResultArrayResponseSchema = z.object({
  results: z.array(LabResultSchema),
});

export const CriticalAlertArraySchema = z.array(CriticalAlertSchema);

export const LabTechnicianArraySchema = z.array(LabTechnicianSchema);

// =============================================================================
// QUEUE STATS
// =============================================================================

export const LabQueueStatsSchema = z.object({
  pending: z.number(),
  collected: z.number(),
  processing: z.number(),
  review: z.number(),
  released: z.number(),
});

export type LabQueueStatsSchemaType = z.infer<typeof LabQueueStatsSchema>;

// =============================================================================
// RESULT ATTACHMENTS
// =============================================================================

export const LabResultAttachmentSchema = z.object({
  id: z.number(),
  file: z.string(),
  file_name: z.string(),
  uploaded_at: z.string().optional(),
});

export const LabResultAttachmentArraySchema = z.array(LabResultAttachmentSchema);
