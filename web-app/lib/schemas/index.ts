/**
 * Schema exports for API validation
 *
 * All API responses should be validated with Zod schemas at runtime.
 * See validation.ts for the parseResponse utility.
 *
 * Implementation status:
 * ✅ clinic.schema.ts - Fully implemented with parseResponse validation
 * ✅ triage.schema.ts - Fully implemented with parseResponse validation
 * ✅ encounter.schema.ts - Fully implemented with parseResponse validation
 * ✅ patient.schema.ts - Fully implemented with parseResponse validation
 * ✅ rbac.schema.ts - Fully implemented with parseResponse validation
 * ✅ sha.schema.ts - Fully implemented with parseResponse validation
 * ✅ core.schema.ts - Fully implemented with parseResponse validation
 * ✅ inpatient.schema.ts - Fully implemented with parseResponse validation
 * ⚠️ pharmacy.schema.ts - Schemas defined, parseResponse TODO
 * ⚠️ laboratory.schema.ts - Schemas defined, parseResponse TODO
 * ⚠️ billing.schema.ts - Schemas defined, parseResponse TODO
 *
 * Note: Some schemas define the same enum (e.g., GenderSchema, QueueStatusSchema).
 * We export from the "primary" schema to avoid conflicts:
 * - GenderSchema: from patient.schema (canonical)
 * - EncounterStatusSchema: from patient.schema (canonical)
 * - QueueStatusSchema: from triage.schema (canonical)
 * - AlertSeveritySchema: triage vs pharmacy have DIFFERENT values
 *   - Triage: 'CRITICAL' | 'WARNING'
 *   - Pharmacy: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 *   Both exported with PharmacyAlertSeveritySchema alias for pharmacy
 */

// Validation utilities
export * from './validation';

// Fully implemented schemas
export * from './clinic.schema';
export * from './triage.schema';
export * from './encounter.schema';

// Patient schema (canonical source for GenderSchema, EncounterStatusSchema)
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
