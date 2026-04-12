/**
 * Zod schemas for RBAC API response validation
 *
 * Implements validation for all RBAC-related API responses.
 * See lib/types/rbac.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const DepartmentTypeSchema = z.enum(['CLINICAL', 'ADMINISTRATIVE', 'SUPPORT', 'LABORATORY', 'PHARMACY', 'RADIOLOGY', 'RECORDS']);

export const RoleCategorySchema = z.enum([
  'CLINICAL',
  'ADMINISTRATIVE',
  'TECHNICAL',
  'MANAGEMENT',
  'COMMUNITY',
  'ALLIED_HEALTH',
]);

export const EmploymentStatusSchema = z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']);

export const EmploymentTypeSchema = z.enum(['PERMANENT', 'CONTRACT', 'LOCUM']);

export const GenderSchema = z.enum(['M', 'F', 'O']);

export const AuditActionSchema = z.enum([
  'department_created',
  'department_updated',
  'department_deleted',
  'role_created',
  'role_updated',
  'role_deleted',
  'staff_created',
  'staff_updated',
  'staff_deactivated',
  'role_assigned',
]);

// =============================================================================
// DEPARTMENT SCHEMA
// =============================================================================

export const DepartmentSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  department_type: DepartmentTypeSchema,
  department_type_display: z.string(),
  parent: z.number().nullable(),
  parent_name: z.string().nullable().optional().transform((value) => value ?? null),
  head: z.number().nullable(),
  head_name: z.string().nullable(),
  is_active: z.boolean(),
  staff_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DepartmentSchemaType = z.infer<typeof DepartmentSchema>;

// =============================================================================
// ROLE SCHEMA
// =============================================================================

export const RoleScopeSchema = z.enum(['ORG', 'FACILITY']);

export const RoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  category: RoleCategorySchema,
  category_display: z.string().optional().nullable(),
  scope: RoleScopeSchema,
  scope_display: z.string().optional().nullable(),
  organization: z.number().nullable(),
  organization_name: z.string().optional().nullable(),
  facility: z.number().nullable(),
  facility_name: z.string().optional().nullable(),
  permissions_matrix: z.record(z.record(z.boolean())),
  hierarchy_level: z.number(),
  parent_role: z.number().nullable(),
  parent_role_name: z.string().optional().nullable(),
  django_group: z.number().nullable(),
  django_group_name: z.string().optional().nullable(),
  requires_license: z.boolean(),
  license_body: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type RoleSchemaType = z.infer<typeof RoleSchema>;

// =============================================================================
// PERMISSION SCHEMA
// =============================================================================

export const PermissionSchema = z.object({
  id: z.number(),
  codename: z.string(),
  name: z.string(),
  app_label: z.string(),
  model: z.string(),
});

export type PermissionSchemaType = z.infer<typeof PermissionSchema>;

export const PermissionGroupSchema = z.object({
  app_label: z.string(),
  app_name: z.string(),
  permissions: z.array(PermissionSchema),
});

export type PermissionGroupSchemaType = z.infer<typeof PermissionGroupSchema>;

// =============================================================================
// STAFF PROFILE SCHEMA
// =============================================================================

export const StaffProfileSchema = z.object({
  id: z.number(),
  user: z.number(),
  user_username: z.string(),
  user_email: z.string(),
  user_first_name: z.string(),
  user_last_name: z.string(),
  full_name: z.string(),
  employee_id: z.string(),
  title: z.string().nullable().optional(),
  middle_name: z.string().nullable().optional(),
  primary_role: z.number().nullable().optional(),
  primary_role_name: z.string().nullable().optional(),
  secondary_roles: z.array(z.number()).optional(),
  primary_department: z.number().nullable().optional(),
  primary_department_name: z.string().nullable().optional(),
  secondary_departments: z.array(z.number()).optional(),
  primary_facility: z.number().nullable().optional(),
  primary_facility_name: z.string().nullable().optional(),
  organization: z.number().nullable().optional(),
  organization_name: z.string().nullable().optional(),
  hwr_id: z.string().nullable().optional(),
  license_number: z.string().nullable().optional(),
  license_expiry: z.string().nullable().optional(),
  license_verified: z.boolean().optional(),
  licensing_body: z.string().nullable().optional(),
  is_license_valid: z.boolean().optional(),
  specialization: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  employment_status: EmploymentStatusSchema.optional(),
  employment_type: EmploymentTypeSchema.nullable().optional(),
  date_joined: z.string().nullable().optional(),
  date_left: z.string().nullable().optional(),
  supervisor: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type StaffProfileSchemaType = z.infer<typeof StaffProfileSchema>;

export const OrgChartSummarySchema = z.object({
  department_count: z.number(),
  staff_count: z.number(),
  root_department_count: z.number(),
  department_heads_count: z.number(),
  supervisor_link_count: z.number(),
});

export type OrgChartSummarySchemaType = z.infer<typeof OrgChartSummarySchema>;

export const OrgChartResponseSchema = z.object({
  departments: z.array(DepartmentSchema),
  staff: z.array(StaffProfileSchema),
  summary: OrgChartSummarySchema,
});

export type OrgChartResponseSchemaType = z.infer<typeof OrgChartResponseSchema>;

// =============================================================================
// USER PERMISSIONS SCHEMA
// =============================================================================

export const UserPermissionsSchema = z.object({
  permissions: z.array(z.string()),
});

export type UserPermissionsSchemaType = z.infer<typeof UserPermissionsSchema>;

// =============================================================================
// USERNAME CHECK/SUGGESTION SCHEMAS
// =============================================================================

export const UsernameCheckResponseSchema = z.object({
  username: z.string(),
  available: z.boolean(),
  suggestions: z.array(z.string()),
});

export type UsernameCheckResponseSchemaType = z.infer<typeof UsernameCheckResponseSchema>;

export const UsernameSuggestionResponseSchema = z.object({
  suggestions: z.array(z.string()),
});

export type UsernameSuggestionResponseSchemaType = z.infer<typeof UsernameSuggestionResponseSchema>;

// =============================================================================
// AUDIT LOG SCHEMA
// =============================================================================

export const AuditLogEntrySchema = z.object({
  id: z.number(),
  user: z.number().nullable(),
  username: z.string(),
  user_name: z.string().optional(), // Legacy field for backward compatibility
  action: z.string(), // OpenAPI uses string, not enum
  resource_type: z.string(),
  resource_id: z.number().nullable(),
  resource_name: z.string().optional(), // Custom field, may not be in API
  details: z.record(z.unknown()),
  ip_address: z.string().nullable(),
  user_agent: z.string(),
  patient_id: z.number().nullable(),
  facility: z.number().nullable(),
  facility_name: z.string().optional().nullable(),
  organization: z.number().nullable(),
  organization_name: z.string().optional().nullable(),
  timestamp: z.string(),
});

export type AuditLogEntrySchemaType = z.infer<typeof AuditLogEntrySchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedDepartmentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DepartmentSchema),
});

export const PaginatedRoleSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(RoleSchema),
});

export const PaginatedStaffProfileSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StaffProfileSchema),
});

export const PaginatedAuditLogSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(AuditLogEntrySchema),
});

// Legacy aliases for backwards compatibility
export const PaginatedUserSchema = PaginatedStaffProfileSchema;
export const UserSchema = StaffProfileSchema;
export const UserProfileSchema = StaffProfileSchema;
export const GroupSchema = z.object({
  id: z.number(),
  name: z.string(),
});

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const PermissionArraySchema = z.array(PermissionSchema);
export const DepartmentArraySchema = z.array(DepartmentSchema);
export const RoleArraySchema = z.array(RoleSchema);
export const StaffProfileArraySchema = z.array(StaffProfileSchema);
export const AuditLogArraySchema = z.array(AuditLogEntrySchema);

export const PermissionArrayResponseSchema = z.object({
  results: z.array(PermissionSchema),
});
