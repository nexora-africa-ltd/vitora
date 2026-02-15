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

export const SpecimenStatusSchema = z.enum([
  'PENDING',
  'COLLECTED',
  'RECEIVED',
  'PROCESSING',
  'REJECTED',
  'STORED',
  'DISPOSED',
]);

export const ValidationTypeSchema = z.enum(['TECHNICAL', 'CLINICAL']);

export const ValidationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const InterfaceTypeSchema = z.enum(['ASTM', 'HL7', 'SERIAL', 'TCP', 'NONE']);

export const AnalyzerRunStatusSchema = z.enum(['RECEIVED', 'PARSED', 'APPLIED', 'ERROR']);

export const DiagnosticReportStatusSchema = z.enum([
  'DRAFT',
  'PRELIMINARY',
  'FINAL',
  'AMENDED',
  'CANCELLED',
]);

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
// SPECIMEN SCHEMA
// =============================================================================

export const SpecimenSchema = z.object({
  id: z.number(),
  barcode: z.string(),
  specimen_type: SpecimenTypeSchema,
  container_type: z.string().nullable().optional(),
  lab_order: z.number(),
  order_items: z.array(z.number()),
  collected_by: z.number().nullable().optional(),
  collected_by_name: z.string().nullable().optional(),
  collected_at: z.string().nullable().optional(),
  collection_site: z.string().nullable().optional(),
  received_by: z.number().nullable().optional(),
  received_at: z.string().nullable().optional(),
  status: SpecimenStatusSchema,
  rejection_reason: z.string().nullable().optional(),
  storage_location: z.string().nullable().optional(),
  storage_temperature: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SpecimenSchemaType = z.infer<typeof SpecimenSchema>;

// =============================================================================
// RESULT VALIDATION SCHEMA
// =============================================================================

export const ResultValidationSchema = z.object({
  id: z.number(),
  result: z.number(),
  validation_type: ValidationTypeSchema,
  validation_type_display: z.string(),
  status: ValidationStatusSchema,
  status_display: z.string(),
  validated_by: z.number().nullable().optional(),
  validated_by_name: z.string().nullable().optional(),
  validated_at: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export type ResultValidationSchemaType = z.infer<typeof ResultValidationSchema>;

// =============================================================================
// INSTRUMENTS & ANALYZER RUNS
// =============================================================================

export const InstrumentSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  is_active: z.boolean(),
  interface_type: InterfaceTypeSchema,
  interface_type_display: z.string(),
  integration_config: z.record(z.unknown()).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type InstrumentSchemaType = z.infer<typeof InstrumentSchema>;

export const AnalyzerRunSchema = z.object({
  id: z.number(),
  specimen: z.number(),
  specimen_barcode: z.string(),
  instrument: z.number(),
  instrument_code: z.string(),
  instrument_name: z.string(),
  operator: z.number().nullable().optional(),
  operator_name: z.string().nullable().optional(),
  run_datetime: z.string(),
  raw_message: z.string().nullable().optional(),
  raw_payload: z.record(z.unknown()).nullable().optional(),
  status: AnalyzerRunStatusSchema,
  status_display: z.string(),
  error_message: z.string().nullable().optional(),
  created_at: z.string(),
});

export type AnalyzerRunSchemaType = z.infer<typeof AnalyzerRunSchema>;

// =============================================================================
// DIAGNOSTIC REPORTS
// =============================================================================

export const DiagnosticReportSchema = z.object({
  id: z.number(),
  report_number: z.string(),
  lab_order: z.number(),
  lab_order_number: z.string(),
  patient_name: z.string(),
  status: DiagnosticReportStatusSchema,
  status_display: z.string(),
  is_finalized: z.boolean(),
  issued_by: z.number(),
  issued_by_name: z.string(),
  issued_at: z.string().nullable().optional(),
  conclusion: z.string().nullable().optional(),
  clinical_info: z.string().nullable().optional(),
  amended_by: z.number().nullable().optional(),
  amended_by_name: z.string().nullable().optional(),
  amended_at: z.string().nullable().optional(),
  cancellation_reason: z.string().nullable().optional(),
  pdf_file: z.string().nullable().optional(),
  pdf_url: z.string().nullable().optional(),
  fhir_resource_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DiagnosticReportSchemaType = z.infer<typeof DiagnosticReportSchema>;

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
  order_number: z.string(),
  patient_name: z.string().nullable().optional(),
  patient_mrn: z.string().nullable().optional(),
  queue_number: z.string(),
  priority: LabPrioritySchema,
  queue_status: QueueStatusSchema,
  sample_type: z.string(),
  sample_id: z.string().nullable().optional(),
  specimen: SpecimenSchema.nullable().optional(),
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
// LAB OPERATIONAL REPORTS
// =============================================================================

export const TurnaroundTimeReportSchema = z.object({
  start: z.string(),
  end: z.string(),
  overall: z.object({
    results_verified: z.number(),
    avg_result_tat_hours: z.number().nullable(),
  }),
  by_test: z.array(
    z.object({
      test_code: z.string(),
      test_name: z.string(),
      result_count: z.number(),
      avg_tat_hours: z.number().nullable(),
    })
  ),
  by_priority: z.array(
    z.object({
      priority: LabPrioritySchema,
      result_count: z.number(),
      avg_tat_hours: z.number().nullable(),
    })
  ),
  queue_tat: z.object({
    released_count: z.number(),
    avg_collect_to_release_hours: z.number().nullable(),
    avg_processing_to_release_hours: z.number().nullable(),
  }),
});

export type TurnaroundTimeReportSchemaType = z.infer<typeof TurnaroundTimeReportSchema>;

export const WorkloadReportSchema = z.object({
  start: z.string(),
  end: z.string(),
  totals: z.object({
    tests_entered: z.number(),
    tests_verified: z.number(),
  }),
  by_day: z.array(
    z.object({
      date: z.string(),
      tests_entered: z.number(),
      tests_verified: z.number(),
    })
  ),
  by_technician: z.array(
    z.object({
      technician_id: z.number(),
      technician_name: z.string(),
      entered_count: z.number(),
      verified_count: z.number(),
    })
  ),
});

export type WorkloadReportSchemaType = z.infer<typeof WorkloadReportSchema>;

export const CriticalValuesReportSchema = z.object({
  start: z.string(),
  end: z.string(),
  total_critical: z.number(),
  by_test: z.array(
    z.object({
      test_code: z.string(),
      test_name: z.string(),
      critical_count: z.number(),
    })
  ),
});

export type CriticalValuesReportSchemaType = z.infer<typeof CriticalValuesReportSchema>;

export const SampleRejectionReportSchema = z.object({
  start: z.string(),
  end: z.string(),
  total_orders: z.number(),
  rejected_orders: z.number(),
  rejection_rate: z.number(),
  reasons: z.array(
    z.object({
      reason: z.string(),
      count: z.number(),
    })
  ),
});

export type SampleRejectionReportSchemaType = z.infer<typeof SampleRejectionReportSchema>;

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

// =============================================================================
// ARRAY RESPONSES FOR NEW TYPES
// =============================================================================

export const SpecimenArraySchema = z.array(SpecimenSchema);
export const ResultValidationArraySchema = z.array(ResultValidationSchema);
export const InstrumentArraySchema = z.array(InstrumentSchema);
export const AnalyzerRunArraySchema = z.array(AnalyzerRunSchema);
export const DiagnosticReportArraySchema = z.array(DiagnosticReportSchema);
