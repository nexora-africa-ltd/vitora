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

export const DepartmentTypeSchema = z.enum(['CLINICAL', 'ANCILLARY', 'ADMINISTRATIVE', 'SUPPORT']);

export const RoleCategorySchema = z.enum(['CLINICAL', 'ADMINISTRATIVE', 'TECHNICAL', 'MANAGEMENT', 'COMMUNITY']);

export const EmploymentStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']);

export const EmploymentTypeSchema = z.enum(['PERMANENT', 'CONTRACT', 'LOCUM', 'INTERN', 'VOLUNTEER']);

export const GenderSchema = z.enum(['M', 'F', 'O']);

export const AuditActionSchema = z.enum([
  'role_created',
  'role_updated',
  'role_deleted',
  'permission_granted',
  'permission_revoked',
  'staff_created',
  'staff_updated',
  'staff_deactivated',
  'role_assigned',
  'department_created',
  'department_updated',
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
  parent_name: z.string().nullable(),
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

export const RoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  category: RoleCategorySchema,
  category_display: z.string().optional().nullable(),
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
  codename: z.string(),
  name: z.string(),
  app_label: z.string(),
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
  title: z.string().nullable(),
  middle_name: z.string().nullable(),
  gender: GenderSchema.nullable(),
  date_of_birth: z.string().nullable(),
  primary_role: z.number().nullable(),
  primary_role_name: z.string().nullable(),
  secondary_roles: z.array(z.number()),
  primary_department: z.number().nullable(),
  primary_department_name: z.string().nullable(),
  secondary_departments: z.array(z.number()),
  hwr_id: z.string().nullable(),
  license_number: z.string().nullable(),
  license_expiry: z.string().nullable(),
  license_verified: z.boolean(),
  licensing_body: z.string().nullable(),
  is_license_valid: z.boolean(),
  specialization: z.string().nullable(),
  phone_number: z.string().nullable(),
  emergency_contact_name: z.string().nullable(),
  emergency_contact_phone: z.string().nullable(),
  employment_status: EmploymentStatusSchema,
  employment_type: EmploymentTypeSchema.nullable(),
  date_joined: z.string().nullable(),
  date_left: z.string().nullable(),
  supervisor: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type StaffProfileSchemaType = z.infer<typeof StaffProfileSchema>;

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
  user: z.number(),
  user_name: z.string(),
  action: AuditActionSchema,
  resource_type: z.string(),
  resource_id: z.number(),
  resource_name: z.string(),
  details: z.record(z.unknown()),
  ip_address: z.string(),
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
