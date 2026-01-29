/**
 * Schema exports for API validation
 *
 * All API responses should be validated with Zod schemas at runtime.
 * See validation.ts for the parseResponse utility.
 *
 * Implementation status:
 * ✅ clinic.schema.ts - Fully implemented
 * ✅ triage.schema.ts - Fully implemented
 * ✅ encounter.schema.ts - Fully implemented
 * 📋 All others - Placeholder schemas (TODO: implement)
 *
 * Note: Some schemas define the same enum (e.g., GenderSchema, QueueStatusSchema).
 * We export from the "primary" schema to avoid conflicts.
 * - GenderSchema: from patient.schema
 * - QueueStatusSchema: from triage.schema
 * - AlertSeveritySchema: triage vs pharmacy have DIFFERENT values, so both are exported with prefixes
 */

// Validation utilities
export * from './validation';

// Fully implemented schemas
export * from './clinic.schema';
export * from './triage.schema';
export * from './encounter.schema';

// Patient schema (canonical source for GenderSchema)
export * from './patient.schema';

// Schemas with potential conflicts - export selectively
export {
  // Pharmacy schemas - include alias for AlertSeveritySchema
  PharmacyAlertSeveritySchema,
  DrugSchema,
  DrugListItemSchema,
  InventoryItemSchema,
  InventoryBatchSchema,
  StockBatchSchema,
  StockAlertSchema,
  StockAdjustmentSchema,
  PrescriptionSchema,
  PrescriptionItemSchema,
  DispensingSchema,
  DrugCategorySchema,
  DrugCategoryEnumSchema,
  DrugFormSchema,
  DrugScheduleSchema,
  StockStatusSchema,
  AlertTypeSchema,
  AlertSeveritySchema,
  PrescriptionStatusSchema,
  DispensingStatusSchema,
  AdjustmentTypeSchema,
  PaginatedDrugCategorySchema,
  PaginatedDrugSchema,
  PaginatedStockBatchSchema,
  PaginatedStockAlertSchema,
  PaginatedPrescriptionSchema,
  PaginatedDispensingSchema,
  PaginatedStockAdjustmentSchema,
  PaginatedInventoryItemSchema,
} from './pharmacy.schema';

export {
  // Laboratory schemas - include alias for QueueStatusSchema
  LabQueueStatusSchema,
  LabTestSchema,
  LabTestCatalogSchema,
  LabOrderSchema,
  LabOrderItemSchema,
  LabResultSchema,
  LabQueueSchema,
  LabTechnicianSchema,
  CriticalAlertSchema,
  TestCategorySchema,
  SpecimenTypeSchema,
  ResultTypeSchema,
  OrderTypeSchema,
  LabOrderStatusSchema,
  LabPrioritySchema,
  LabOrderItemStatusSchema,
  ResultFlagSchema,
  VerificationStatusSchema,
  QueueStatusSchema,
  PaginatedLabTestCatalogSchema,
  PaginatedLabOrderSchema,
  PaginatedLabQueueSchema,
} from './laboratory.schema';

export * from './billing.schema';
export * from './inpatient.schema';

// RBAC schema - exclude duplicate GenderSchema
export {
  RoleSchema,
  RoleCategorySchema,
  PermissionSchema,
  PermissionGroupSchema,
  StaffProfileSchema,
  UserSchema,
  UserPermissionsSchema,
  UsernameCheckResponseSchema,
  UsernameSuggestionResponseSchema,
  AuditLogEntrySchema,
  DepartmentSchema,
  DepartmentTypeSchema,
  EmploymentStatusSchema,
  EmploymentTypeSchema,
  AuditActionSchema,
  PaginatedStaffProfileSchema,
  PaginatedUserSchema,
  PaginatedRoleSchema,
  PaginatedDepartmentSchema,
  PaginatedAuditLogSchema,
} from './rbac.schema';

export * from './sha.schema';
export * from './core.schema';

export * from './sha.schema';
export * from './core.schema';
