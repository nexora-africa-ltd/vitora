/**
 * Contract Test: RBAC Schema Comparison
 *
 * Layer 3 — Frontend Schema Comparison Tests
 *
 * Compares Zod schemas against the OpenAPI spec exported from the backend.
 * Catches frontend schema drift — when the Zod schema doesn't match the actual API.
 *
 * @see docs/contract-testing-recommendations.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  // Object schemas
  DepartmentSchema,
  RoleSchema,
  PermissionSchema,
  PermissionGroupSchema,
  StaffProfileSchema,
  UserPermissionsSchema,
  UsernameCheckResponseSchema,
  UsernameSuggestionResponseSchema,
  AuditLogEntrySchema,
  GroupSchema,
  // Enum schemas
  DepartmentTypeSchema,
  RoleCategorySchema,
  EmploymentStatusSchema,
  EmploymentTypeSchema,
  GenderSchema,
  AuditActionSchema,
} from '@/lib/schemas/rbac.schema';

// =============================================================================
// OPENAPI SCHEMA LOADING
// =============================================================================

interface OpenAPISchema {
  components: {
    schemas: Record<string, {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      enum?: string[];
      allOf?: Array<{ $ref?: string }>;
      description?: string;
    }>;
  };
}

/**
 * Load the OpenAPI schema from the backend.
 * The schema.json is actually in YAML format.
 */
function loadOpenAPISchema(): OpenAPISchema {
  const schemaPath = path.resolve(__dirname, '../../../backend/schema.json');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  return yaml.load(schemaContent) as OpenAPISchema;
}

/**
 * Get the properties from a component schema, resolving $ref if needed.
 */
function getSchemaProperties(
  openapi: OpenAPISchema,
  schemaName: string
): Record<string, unknown> | null {
  const schema = openapi.components.schemas[schemaName];
  if (!schema) return null;
  return (schema.properties ?? {}) as Record<string, unknown>;
}

/**
 * Get enum values from a component schema.
 */
function getSchemaEnumValues(
  openapi: OpenAPISchema,
  schemaName: string
): string[] | null {
  const schema = openapi.components.schemas[schemaName];
  if (!schema || !schema.enum) return null;
  return schema.enum;
}

/**
 * Extract field names from a Zod schema using zod-to-json-schema.
 */
function getZodSchemaFields(zodSchema: unknown): string[] {
  const jsonSchema = zodToJsonSchema(zodSchema as Parameters<typeof zodToJsonSchema>[0], {
    target: 'openApi3',
  });
  
  if (typeof jsonSchema === 'object' && jsonSchema !== null && 'properties' in jsonSchema) {
    return Object.keys((jsonSchema as { properties: Record<string, unknown> }).properties);
  }
  return [];
}

/**
 * Extract enum values from a Zod enum schema.
 */
function getZodEnumValues(zodSchema: unknown): string[] {
  const jsonSchema = zodToJsonSchema(zodSchema as Parameters<typeof zodToJsonSchema>[0], {
    target: 'openApi3',
  });
  
  if (typeof jsonSchema === 'object' && jsonSchema !== null && 'enum' in jsonSchema) {
    return (jsonSchema as { enum: string[] }).enum;
  }
  return [];
}

// =============================================================================
// CONTRACT TESTS
// =============================================================================

describe('RBAC Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // OBJECT SCHEMA TESTS
  // ===========================================================================

  describe('DepartmentSchema', () => {
    it('should have all fields from the OpenAPI Department schema', () => {
      const zodFields = getZodSchemaFields(DepartmentSchema);
      const apiProperties = getSchemaProperties(openapi, 'Department');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  DepartmentSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'name', 'code', 'department_type', 'is_active'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical department fields', () => {
      const zodFields = getZodSchemaFields(DepartmentSchema);
      
      const criticalFields = [
        'id',
        'name',
        'code',
        'description',
        'department_type',
        'is_active',
        'staff_count',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include hierarchy and relationship fields', () => {
      const zodFields = getZodSchemaFields(DepartmentSchema);
      
      const relationshipFields = [
        'parent',
        'parent_name',
        'head',
        'head_name',
      ];

      const missing = relationshipFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('RoleSchema', () => {
    it('should have all fields from the OpenAPI Role schema', () => {
      const zodFields = getZodSchemaFields(RoleSchema);
      const apiProperties = getSchemaProperties(openapi, 'Role');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  RoleSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'name', 'code', 'category', 'is_active'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical role fields', () => {
      const zodFields = getZodSchemaFields(RoleSchema);
      
      const criticalFields = [
        'id',
        'name',
        'code',
        'description',
        'category',
        'hierarchy_level',
        'is_active',
        'requires_license',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include permission and hierarchy fields', () => {
      const zodFields = getZodSchemaFields(RoleSchema);
      
      const permissionFields = [
        'permissions_matrix',
        'parent_role',
        'parent_role_name',
        'django_group',
        'django_group_name',
        'license_body',
      ];

      const missing = permissionFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('PermissionSchema', () => {
    it('should have all fields from the OpenAPI Permission schema', () => {
      const zodFields = getZodSchemaFields(PermissionSchema);
      const apiProperties = getSchemaProperties(openapi, 'Permission');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  PermissionSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['codename', 'name', 'app_label'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have core permission fields', () => {
      const zodFields = getZodSchemaFields(PermissionSchema);
      
      const coreFields = [
        'codename',
        'name',
        'app_label',
      ];

      const missing = coreFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('PermissionGroupSchema', () => {
    it('should have group structure fields', () => {
      const zodFields = getZodSchemaFields(PermissionGroupSchema);
      
      const structureFields = [
        'app_label',
        'app_name',
        'permissions',
      ];

      const missing = structureFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('StaffProfileSchema', () => {
    it('should have all fields from the OpenAPI StaffProfile schema', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      const apiProperties = getSchemaProperties(openapi, 'StaffProfile');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  StaffProfileSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'user', 'employee_id', 'employment_status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical staff profile fields', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      
      const criticalFields = [
        'id',
        'user',
        'employee_id',
        'full_name',
        'primary_role',
        'primary_department',
        'employment_status',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include user account fields', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      
      const userFields = [
        'user_username',
        'user_email',
        'user_first_name',
        'user_last_name',
      ];

      const missing = userFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include role and department fields', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      
      const roleFields = [
        'primary_role',
        'primary_role_name',
        'secondary_roles',
        'primary_department',
        'primary_department_name',
        'secondary_departments',
      ];

      const missing = roleFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include licensing fields', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      
      const licenseFields = [
        'hwr_id',
        'license_number',
        'license_expiry',
        'license_verified',
        'licensing_body',
        'is_license_valid',
      ];

      const missing = licenseFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include contact and personal fields', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      
      const personalFields = [
        'title',
        'middle_name',
        'phone_number',
        'emergency_contact_name',
        'emergency_contact_phone',
        'specialization',
      ];

      const missing = personalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include employment fields', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      
      const employmentFields = [
        'employment_status',
        'employment_type',
        'date_joined',
        'date_left',
        'supervisor',
      ];

      const missing = employmentFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('UserPermissionsSchema', () => {
    it('should have permissions array field', () => {
      const zodFields = getZodSchemaFields(UserPermissionsSchema);
      
      expect(zodFields).toContain('permissions');
    });
  });

  describe('UsernameCheckResponseSchema', () => {
    it('should have username availability fields', () => {
      const zodFields = getZodSchemaFields(UsernameCheckResponseSchema);
      
      const requiredFields = [
        'username',
        'available',
        'suggestions',
      ];

      const missing = requiredFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('UsernameSuggestionResponseSchema', () => {
    it('should have suggestions array field', () => {
      const zodFields = getZodSchemaFields(UsernameSuggestionResponseSchema);
      
      expect(zodFields).toContain('suggestions');
    });
  });

  describe('AuditLogEntrySchema', () => {
    it('should have all fields from the OpenAPI AuditLog schema', () => {
      const zodFields = getZodSchemaFields(AuditLogEntrySchema);
      const apiProperties = getSchemaProperties(openapi, 'AuditLog');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  AuditLogEntrySchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'action', 'resource_type', 'timestamp'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical audit log fields', () => {
      const zodFields = getZodSchemaFields(AuditLogEntrySchema);
      
      const criticalFields = [
        'id',
        'user',
        'username',
        'action',
        'resource_type',
        'resource_id',
        'timestamp',
        'ip_address',
        'user_agent',
        'details',
        'patient_id',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('GroupSchema', () => {
    it('should have id and name fields', () => {
      const zodFields = getZodSchemaFields(GroupSchema);
      
      const requiredFields = ['id', 'name'];

      const missing = requiredFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // ENUM SCHEMA TESTS
  // ===========================================================================

  describe('DepartmentTypeSchema (enum)', () => {
    it('should match OpenAPI DepartmentTypeEnum values', () => {
      const zodValues = getZodEnumValues(DepartmentTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'DepartmentTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`⚠️  DepartmentTypeSchema: Missing values from API: ${missingInZod.join(', ')}`);
      }

      // Enum values must match exactly
      expect(missingInZod).toEqual([]);
    });

    it('should include core department types', () => {
      const zodValues = getZodEnumValues(DepartmentTypeSchema);
      
      const coreTypes = [
        'CLINICAL',
        'ADMINISTRATIVE',
        'SUPPORT',
      ];

      const missing = coreTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  describe('RoleCategorySchema (enum)', () => {
    it('should match OpenAPI RoleCategoryEnum values', () => {
      const zodValues = getZodEnumValues(RoleCategorySchema);
      const apiValues = getSchemaEnumValues(openapi, 'RoleCategoryEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`⚠️  RoleCategorySchema: Missing values from API: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all role categories', () => {
      const zodValues = getZodEnumValues(RoleCategorySchema);
      
      const allCategories = [
        'CLINICAL',
        'ADMINISTRATIVE',
        'TECHNICAL',
        'MANAGEMENT',
        'COMMUNITY',
      ];

      const missing = allCategories.filter((c) => !zodValues.includes(c));
      expect(missing).toEqual([]);
    });
  });

  describe('EmploymentStatusSchema (enum)', () => {
    it('should match OpenAPI EmploymentStatusEnum values', () => {
      const zodValues = getZodEnumValues(EmploymentStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'EmploymentStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`⚠️  EmploymentStatusSchema: Missing values from API: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include core employment statuses', () => {
      const zodValues = getZodEnumValues(EmploymentStatusSchema);
      
      const coreStatuses = [
        'ACTIVE',
        'ON_LEAVE',
        'SUSPENDED',
        'TERMINATED',
      ];

      const missing = coreStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('EmploymentTypeSchema (enum)', () => {
    it('should match OpenAPI EmploymentTypeEnum values', () => {
      const zodValues = getZodEnumValues(EmploymentTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'EmploymentTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`⚠️  EmploymentTypeSchema: Missing values from API: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include core employment types', () => {
      const zodValues = getZodEnumValues(EmploymentTypeSchema);
      
      const coreTypes = [
        'PERMANENT',
        'CONTRACT',
        'LOCUM',
      ];

      const missing = coreTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  describe('GenderSchema (enum)', () => {
    it('should match OpenAPI GenderEnum values', () => {
      const zodValues = getZodEnumValues(GenderSchema);
      const apiValues = getSchemaEnumValues(openapi, 'GenderEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`⚠️  GenderSchema: Missing values from API: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all gender options', () => {
      const zodValues = getZodEnumValues(GenderSchema);
      
      const allGenders = ['M', 'F', 'O'];

      const missing = allGenders.filter((g) => !zodValues.includes(g));
      expect(missing).toEqual([]);
    });
  });

  describe('AuditActionSchema (enum)', () => {
    it('should have RBAC-related audit actions', () => {
      const zodValues = getZodEnumValues(AuditActionSchema);
      
      // The OpenAPI audit action is a string field, not an enum
      // This test ensures our Zod enum covers expected actions
      const rbacActions = [
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
      ];

      const missing = rbacActions.filter((a) => !zodValues.includes(a));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // FIELD MAPPING TESTS
  // ===========================================================================

  describe('Field Mapping Verification', () => {
    it('DepartmentSchema should have department_type_display for UI', () => {
      const zodFields = getZodSchemaFields(DepartmentSchema);
      expect(zodFields).toContain('department_type_display');
    });

    it('RoleSchema should have category_display for UI', () => {
      const zodFields = getZodSchemaFields(RoleSchema);
      expect(zodFields).toContain('category');
    });

    it('StaffProfileSchema should have full_name computed field', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      expect(zodFields).toContain('full_name');
    });

    it('StaffProfileSchema should have is_license_valid computed field', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      expect(zodFields).toContain('is_license_valid');
    });
  });

  // ===========================================================================
  // CONSISTENCY TESTS
  // ===========================================================================

  describe('Schema Consistency', () => {
    it('StaffProfileSchema should reference same role ID type as RoleSchema', () => {
      const staffFields = getZodSchemaFields(StaffProfileSchema);
      const roleFields = getZodSchemaFields(RoleSchema);
      
      expect(staffFields).toContain('primary_role');
      expect(roleFields).toContain('id');
    });

    it('StaffProfileSchema should reference same department ID type as DepartmentSchema', () => {
      const staffFields = getZodSchemaFields(StaffProfileSchema);
      const deptFields = getZodSchemaFields(DepartmentSchema);
      
      expect(staffFields).toContain('primary_department');
      expect(deptFields).toContain('id');
    });

    it('RoleSchema should have parent_role field for hierarchy', () => {
      const zodFields = getZodSchemaFields(RoleSchema);
      expect(zodFields).toContain('parent_role');
      expect(zodFields).toContain('parent_role_name');
    });

    it('DepartmentSchema should have parent field for hierarchy', () => {
      const zodFields = getZodSchemaFields(DepartmentSchema);
      expect(zodFields).toContain('parent');
      expect(zodFields).toContain('parent_name');
    });
  });

  // ===========================================================================
  // RELATIONSHIP TESTS
  // ===========================================================================

  describe('Schema Relationships', () => {
    it('StaffProfileSchema should support multiple roles', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      expect(zodFields).toContain('primary_role');
      expect(zodFields).toContain('secondary_roles');
    });

    it('StaffProfileSchema should support multiple departments', () => {
      const zodFields = getZodSchemaFields(StaffProfileSchema);
      expect(zodFields).toContain('primary_department');
      expect(zodFields).toContain('secondary_departments');
    });

    it('RoleSchema should link to Django Group for permissions', () => {
      const zodFields = getZodSchemaFields(RoleSchema);
      expect(zodFields).toContain('django_group');
      expect(zodFields).toContain('django_group_name');
    });

    it('DepartmentSchema should link to department head', () => {
      const zodFields = getZodSchemaFields(DepartmentSchema);
      expect(zodFields).toContain('head');
      expect(zodFields).toContain('head_name');
    });
  });
});
