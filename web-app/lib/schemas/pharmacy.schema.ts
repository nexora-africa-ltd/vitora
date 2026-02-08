/**
 * Zod schemas for Pharmacy API response validation
 *
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * See lib/types/pharmacy.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const DrugFormSchema = z.enum([
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'CREAM',
  'OINTMENT',
  'DROPS',
  'INHALER',
  'SUPPOSITORY',
  'POWDER',
  'SUSPENSION',
  'SOLUTION',
  'GEL',
  'PATCH',
  'SPRAY',
]);

export const DrugCategoryEnumSchema = z.enum([
  'ANALGESIC',
  'ANTIBIOTIC',
  'ANTIMALARIAL',
  'ANTIRETROVIRAL',
  'ANTIHYPERTENSIVE',
  'ANTIDIABETIC',
  'ANTIHISTAMINE',
  'VITAMIN',
  'VACCINE',
  'CONTRACEPTIVE',
  'PSYCHOTROPIC',
  'CONTROLLED',
  'OTHER',
]);

export const DrugScheduleSchema = z.enum(['OTC', 'POM', 'P', 'CD']);

export const StockStatusSchema = z.enum([
  'AVAILABLE',
  'LOW',
  'OUT_OF_STOCK',
  'EXPIRED',
  'QUARANTINE',
  'RECALLED',
]);

export const AlertTypeSchema = z.enum([
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'EXPIRING_SOON',
  'EXPIRING_CRITICAL',
  'EXPIRED',
  'RECALLED',
]);

export const AlertSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
// Alias for module-specific export to avoid conflicts with triage AlertSeveritySchema
export const PharmacyAlertSeveritySchema = AlertSeveritySchema;

export const PrescriptionStatusSchema = z.enum([
  'PENDING',
  'PARTIAL',
  'DISPENSED',
  'CANCELLED',
  'EXPIRED',
]);

export const DispensingStatusSchema = z.enum(['COMPLETED', 'RETURNED', 'CANCELLED']);

export const AdjustmentTypeSchema = z.enum([
  'DAMAGED',
  'EXPIRED',
  'LOST',
  'THEFT',
  'CORRECTION',
  'RETURN_TO_SUPPLIER',
  'DONATION',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'OTHER',
  // Additional values from OpenAPI
  'DAMAGE',
  'LOSS',
  'RETURN_SUPPLIER',
  'COUNT_CORRECTION',
  'SAMPLE',
]);

// =============================================================================
// DRUG CATEGORY REGISTRY SCHEMA (backend registry, not enum)
// =============================================================================

export const DrugCategorySchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  value: z.string(),
  label: z.string(),
  is_active: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type DrugCategorySchemaType = z.infer<typeof DrugCategorySchema>;

// =============================================================================
// DRUG SCHEMA
// =============================================================================

export const DrugSchema = z.object({
  id: z.number(),
  code: z.string(),
  display_name: z.string().optional(),
  generic_name: z.string(),
  brand_names: z.array(z.string()),
  category: DrugCategoryEnumSchema.nullable(),
  categories: z.array(DrugCategoryEnumSchema),
  form: DrugFormSchema,
  strength: z.string(),
  unit: z.string(),
  schedule: DrugScheduleSchema,
  requires_prescription: z.boolean(),
  is_controlled: z.boolean(),
  is_narcotic: z.boolean(),
  keml_code: z.string().optional().nullable(),
  is_essential: z.boolean(),
  nhif_code: z.string().optional().nullable(),
  default_reorder_level: z.number(),
  default_reorder_quantity: z.number(),
  shelf_life_months: z.number().optional().nullable(),
  storage_requirements: z.string().optional().nullable(),
  reference_price: z.number().optional().nullable(),
  is_active: z.boolean(),
  current_stock: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DrugSchemaType = z.infer<typeof DrugSchema>;

// Alias for backward compatibility
export const DrugListItemSchema = DrugSchema;

// =============================================================================
// STOCK BATCH SCHEMA
// =============================================================================

export const StockBatchSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  drug_code: z.string().optional().nullable(),
  batch_number: z.string(),
  barcode: z.string().optional().nullable(),
  quantity_received: z.number(),
  quantity_available: z.number(),
  quantity_dispensed: z.number(),
  quantity_damaged: z.number(),
  quantity_expired: z.number(),
  manufacture_date: z.string().optional().nullable(),
  expiry_date: z.string(),
  days_until_expiry: z.number().optional().nullable(),
  is_expired_status: z.boolean().optional().nullable(),
  is_low_stock_status: z.boolean().optional().nullable(),
  received_date: z.string(),
  cost_price: z.number(),
  selling_price: z.number(),
  supplier: z.string().optional().nullable(),
  purchase_order: z.string().optional().nullable(),
  received_by: z.number(),
  received_by_name: z.string().optional().nullable(),
  status: StockStatusSchema,
  location: z.string().optional().nullable(),
  days_to_expiry: z.number(),
  is_expired: z.boolean(),
  is_low_stock: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type StockBatchSchemaType = z.infer<typeof StockBatchSchema>;

// Alias for backward compatibility
export const InventoryBatchSchema = StockBatchSchema;
export const InventoryItemSchema = StockBatchSchema;

// =============================================================================
// STOCK ALERT SCHEMA
// =============================================================================

export const StockAlertSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  drug_code: z.string().optional().nullable(),
  stock_batch: z.number().optional().nullable(),
  batch_number: z.string().optional().nullable(),
  alert_type: AlertTypeSchema,
  severity: AlertSeveritySchema,
  message: z.string(),
  acknowledged: z.boolean(),
  is_acknowledged: z.boolean().optional().nullable(),
  acknowledged_by: z.number().optional().nullable(),
  acknowledged_by_name: z.string().optional().nullable(),
  acknowledged_at: z.string().optional().nullable(),
  resolved: z.boolean(),
  is_resolved: z.boolean().optional().nullable(),
  resolved_by: z.number().optional().nullable(),
  resolved_by_name: z.string().optional().nullable(),
  resolved_at: z.string().optional().nullable(),
  resolution_notes: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type StockAlertSchemaType = z.infer<typeof StockAlertSchema>;

// =============================================================================
// PRESCRIPTION ITEM SCHEMA (defined before Prescription for nesting)
// =============================================================================

export const PrescriptionItemSchema = z.object({
  id: z.number(),
  prescription: z.number(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  drug_code: z.string().optional().nullable(),
  quantity_prescribed: z.number(),
  quantity: z.number().optional().nullable(),
  quantity_dispensed: z.number(),
  dosage: z.string(),
  frequency: z.string(),
  duration: z.string(),
  route: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  is_substitutable: z.boolean(),
  is_cancelled: z.boolean(),
  cancelled_reason: z.string().optional().nullable(),
  cancellation_reason: z.string().optional().nullable(),
  remaining_quantity: z.number(),
  remaining_qty: z.number().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type PrescriptionItemSchemaType = z.infer<typeof PrescriptionItemSchema>;

// =============================================================================
// PRESCRIPTION SCHEMA
// =============================================================================

export const PrescriptionSchema = z.object({
  id: z.number(),
  prescription_number: z.string(),
  patient: z.number(),
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  encounter: z.number().optional().nullable(),
  prescriber: z.number(),
  prescriber_name: z.string().optional().nullable(),
  prescribed_by: z.number().optional().nullable(),
  status: PrescriptionStatusSchema,
  prescribed_date: z.string(),
  prescribed_at: z.string().optional().nullable(),
  valid_until: z.string(),
  clinical_notes: z.string().optional().nullable(),
  cancelled_reason: z.string().optional().nullable(),
  cancelled_by: z.number().optional().nullable(),
  cancelled_at: z.string().optional().nullable(),
  items: z.array(PrescriptionItemSchema),
  is_valid: z.boolean(),
  is_valid_prescription: z.boolean().optional(),
  is_fully_dispensed: z.boolean(),
  is_fully_dispensed_status: z.boolean().optional(),
  verification_url: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type PrescriptionSchemaType = z.infer<typeof PrescriptionSchema>;

// =============================================================================
// DISPENSING SCHEMA
// =============================================================================

export const DispensingSchema = z.object({
  id: z.number(),
  prescription_item: z.number().optional().nullable(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  drug_code: z.string().optional().nullable(),
  stock_batch: z.number(),
  batch: z.number().optional().nullable(),
  batch_number: z.string().optional().nullable(),
  quantity: z.number(),
  quantity_dispensed: z.number().optional().nullable(),
  quantity_returned: z.number().optional().nullable(),
  discount: z.number().optional().nullable(),
  instructions_given: z.string().optional().nullable(),
  patient_counseled: z.boolean().optional().nullable(),
  patient: z.number().optional().nullable(),
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  dispensed_by: z.number(),
  dispensed_by_name: z.string().optional().nullable(),
  dispensed_at: z.string(),
  verified_by: z.number().optional().nullable(),
  verified_by_name: z.string().optional().nullable(),
  verified_at: z.string().optional().nullable(),
  status: DispensingStatusSchema,
  unit_price: z.number(),
  total_price: z.number(),
  payment_status: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  is_direct_sale: z.boolean(),
  returned_quantity: z.number().optional().nullable(),
  return_reason: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DispensingSchemaType = z.infer<typeof DispensingSchema>;

// =============================================================================
// STOCK ADJUSTMENT SCHEMA
// =============================================================================

export const StockAdjustmentSchema = z.object({
  id: z.number(),
  stock_batch: z.number(),
  batch: z.number().optional().nullable(),
  batch_number: z.string().optional().nullable(),
  drug_name: z.string().optional().nullable(),
  adjustment_type: AdjustmentTypeSchema,
  quantity: z.number(),
  reason: z.string(),
  adjusted_at: z.string().optional().nullable(),
  requires_approval: z.boolean().optional().nullable(),
  adjusted_by: z.number(),
  adjusted_by_name: z.string().optional().nullable(),
  approved_by: z.number().optional().nullable(),
  approved_by_name: z.string().optional().nullable(),
  approved_at: z.string().optional().nullable(),
  reference_number: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type StockAdjustmentSchemaType = z.infer<typeof StockAdjustmentSchema>;

// =============================================================================
// REPORT SCHEMAS
// =============================================================================

export const StockSummaryBatchSchema = z.object({
  batch_number: z.string(),
  quantity_available: z.number(),
  expiry_date: z.string(),
  days_to_expiry: z.number(),
});

export const StockSummaryItemSchema = z.object({
  drug_id: z.number(),
  drug_name: z.string(),
  total_quantity: z.number(),
  reorder_level: z.number(),
  is_below_reorder: z.boolean(),
  batches: z.array(StockSummaryBatchSchema),
});

export const ExpiryReportItemSchema = z.object({
  batch_id: z.number(),
  drug_name: z.string(),
  drug_code: z.string(),
  batch_number: z.string(),
  quantity_available: z.number(),
  expiry_date: z.string(),
  days_to_expiry: z.number(),
  status: z.enum(['EXPIRED', 'CRITICAL', 'WARNING', 'OK']),
  value: z.number(),
});

export const DispensingReportRecordSchema = z.object({
  dispensing_id: z.number(),
  drug_name: z.string(),
  quantity_dispensed: z.number(),
  dispensed_date: z.string(),
  patient_name: z.string(),
  dispensed_by: z.string(),
  batch_number: z.string(),
  total_cost: z.string(),
});

export const DispensingReportSummarySchema = z.object({
  total_dispensed: z.number(),
  total_value: z.number(),
  by_category: z.array(z.object({
    category: DrugCategoryEnumSchema,
    count: z.number(),
    value: z.number(),
  })),
  by_date: z.array(z.object({
    date: z.string(),
    count: z.number(),
    value: z.number(),
  })),
  top_drugs: z.array(z.object({
    drug_name: z.string(),
    quantity: z.number(),
    value: z.number(),
  })),
  results: z.array(DispensingReportRecordSchema).optional(),
});

export type StockSummaryItemSchemaType = z.infer<typeof StockSummaryItemSchema>;
export type ExpiryReportItemSchemaType = z.infer<typeof ExpiryReportItemSchema>;
export type DispensingReportSummarySchemaType = z.infer<typeof DispensingReportSummarySchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedDrugCategorySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DrugCategorySchema),
});

export const PaginatedDrugSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DrugSchema),
});

export const PaginatedStockBatchSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StockBatchSchema),
});

export const PaginatedStockAlertSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StockAlertSchema),
});

export const PaginatedPrescriptionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PrescriptionSchema),
});

export const PaginatedDispensingSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DispensingSchema),
});

export const PaginatedStockAdjustmentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StockAdjustmentSchema),
});

// Backward compatibility alias
export const PaginatedInventoryItemSchema = PaginatedStockBatchSchema;

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const DrugArraySchema = z.array(DrugSchema);
export const StockBatchArraySchema = z.array(StockBatchSchema);
export const StockAlertArraySchema = z.array(StockAlertSchema);
export const PrescriptionArraySchema = z.array(PrescriptionSchema);
export const DispensingArraySchema = z.array(DispensingSchema);
export const StockSummaryArraySchema = z.array(StockSummaryItemSchema);
export const ExpiryReportArraySchema = z.array(ExpiryReportItemSchema);

export const PrescriptionItemArrayResponseSchema = z.object({
  results: z.array(PrescriptionItemSchema),
});

export const StockSummaryResponseSchema = z.object({
  results: z.array(StockSummaryItemSchema),
});

export const ExpiryReportResponseSchema = z.object({
  results: z.array(ExpiryReportItemSchema),
});

// Stock movement (generic for reports)
export const StockMovementSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string().optional().nullable(),
  batch_number: z.string().optional().nullable(),
  movement_type: z.string(),
  quantity: z.number(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_by: z.number().optional().nullable(),
  created_by_name: z.string().optional().nullable(),
  created_at: z.string(),
});

// Alert settings
export const AlertSettingsSchema = z.object({
  id: z.number().optional(),
  low_stock_threshold: z.number(),
  expiry_warning_days: z.number(),
  expiry_critical_days: z.number(),
  enable_email_notifications: z.boolean(),
  notification_email_recipients: z.string().optional().nullable(),
});

export type AlertSettingsSchemaType = z.infer<typeof AlertSettingsSchema>;

// Stock movement report
export const StockMovementReportSchema = z.object({
  results: z.array(StockMovementSchema),
});
