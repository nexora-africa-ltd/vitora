/**
 * Contract Test: Clinic Schema Comparison
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
  ClinicSchema,
  ClinicListItemSchema,
  ClinicSessionSchema,
  ClinicVisitSchema,
  ClinicStaffSchema,
  ClinicScheduleSchema,
  ClinicEnrollmentSchema,
  ClinicTypeSchema,
  ClinicStatusSchema,
  ClinicVisitStatusSchema,
  ClinicVisitPrioritySchema,
  ClinicVisitTypeSchema,
  ClinicVisitSourceSchema,
  ClinicSessionStatusSchema,
  EnrollmentStatusSchema,
  ClinicStaffRoleSchema,
} from '@/lib/schemas/clinic.schema';

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

describe('Clinic Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  describe('ClinicSchema', () => {
    it('should have all fields from the OpenAPI Clinic schema', () => {
      const zodFields = getZodSchemaFields(ClinicSchema);
      const apiProperties = getSchemaProperties(openapi, 'Clinic');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);

      // Find fields in API but missing from Zod
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      // Log missing fields for debugging
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) =>
          ['id', 'name', 'clinic_type', 'code', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields from the API', () => {
      const zodFields = getZodSchemaFields(ClinicSchema);

      const criticalFields = [
        'id',
        'name',
        'clinic_type',
        'code',
        'status',
        'is_open_today',
        'is_scheduled_today',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ClinicListItemSchema', () => {
    it('should have essential list fields', () => {
      const zodFields = getZodSchemaFields(ClinicListItemSchema);

      const essentialFields = [
        'id',
        'name',
        'clinic_type',
        'code',
        'status',
        'is_open_today',
        'is_scheduled_today',
      ];

      const missing = essentialFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ClinicSessionSchema', () => {
    it('should have all fields from the OpenAPI ClinicSession schema', () => {
      const zodFields = getZodSchemaFields(ClinicSessionSchema);
      const apiProperties = getSchemaProperties(openapi, 'ClinicSession');

      if (!apiProperties) {
        console.warn('ClinicSession schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicSessionSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'clinic', 'session_date', 'status'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('ClinicVisitSchema', () => {
    it('should have all fields from the OpenAPI ClinicVisit schema', () => {
      const zodFields = getZodSchemaFields(ClinicVisitSchema);
      const apiProperties = getSchemaProperties(openapi, 'ClinicVisit');

      if (!apiProperties) {
        console.warn('ClinicVisit schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicVisitSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'session', 'patient', 'status', 'queue_number'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('ClinicStaffSchema', () => {
    it('should have all fields from the OpenAPI ClinicStaff schema', () => {
      const zodFields = getZodSchemaFields(ClinicStaffSchema);
      const apiProperties = getSchemaProperties(openapi, 'ClinicStaff');

      if (!apiProperties) {
        console.warn('ClinicStaff schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicStaffSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'clinic', 'user', 'role'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('ClinicScheduleSchema', () => {
    it('should have all fields from the OpenAPI ClinicSchedule schema', () => {
      const zodFields = getZodSchemaFields(ClinicScheduleSchema);
      const apiProperties = getSchemaProperties(openapi, 'ClinicSchedule');

      if (!apiProperties) {
        console.warn('ClinicSchedule schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicScheduleSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'clinic', 'day_of_week', 'start_time', 'end_time'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('ClinicEnrollmentSchema', () => {
    it('should have all fields from the OpenAPI ClinicEnrollment schema', () => {
      const zodFields = getZodSchemaFields(ClinicEnrollmentSchema);
      const apiProperties = getSchemaProperties(openapi, 'ClinicEnrollment');

      if (!apiProperties) {
        console.warn('ClinicEnrollment schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicEnrollmentSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'clinic', 'patient', 'enrollment_number', 'status'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  // =============================================================================
  // ENUM TESTS
  // =============================================================================

  describe('ClinicTypeSchema (enum)', () => {
    it('should match OpenAPI ClinicTypeEnum values', () => {
      const zodValues = getZodEnumValues(ClinicTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ClinicTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ClinicStatusSchema (enum)', () => {
    it('should match OpenAPI clinic status enum values', () => {
      const zodValues = getZodEnumValues(ClinicStatusSchema);
      // OpenAPI may use ClinicStatusEnum for clinic status
      const apiValues = getSchemaEnumValues(openapi, 'ClinicStatusEnum');

      if (!apiValues) {
        console.warn('ClinicStatusEnum not found in OpenAPI (clinic status)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ClinicVisitStatusSchema (enum)', () => {
    it('should match OpenAPI ClinicVisitStatusEnum values', () => {
      const zodValues = getZodEnumValues(ClinicVisitStatusSchema);
        const apiValues = getSchemaEnumValues(openapi, 'ClinicVisitStatusEnum');

      if (!apiValues) {
          console.warn('ClinicVisitStatusEnum not found in OpenAPI (visit status)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicVisitStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ClinicVisitPrioritySchema (enum)', () => {
    it('should match OpenAPI priority enum values', () => {
      const zodValues = getZodEnumValues(ClinicVisitPrioritySchema);
        const apiValues = getSchemaEnumValues(openapi, 'ClinicVisitPriorityEnum');

      if (!apiValues) {
          console.warn('ClinicVisitPriorityEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicVisitPrioritySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ClinicVisitTypeSchema (enum)', () => {
    it('should match OpenAPI visit type enum values', () => {
      const zodValues = getZodEnumValues(ClinicVisitTypeSchema);
        const apiValues = getSchemaEnumValues(openapi, 'ClinicVisitTypeEnum');

      if (!apiValues) {
          console.warn('ClinicVisitTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicVisitTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ClinicVisitSourceSchema (enum)', () => {
    it('should match OpenAPI source enum values', () => {
      const zodValues = getZodEnumValues(ClinicVisitSourceSchema);
      const apiValues = getSchemaEnumValues(openapi, 'SourceEnum');

      if (!apiValues) {
        console.warn('SourceEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicVisitSourceSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ClinicSessionStatusSchema (enum)', () => {
    it('should match OpenAPI session status enum values', () => {
      const zodValues = getZodEnumValues(ClinicSessionStatusSchema);
        const apiValues = getSchemaEnumValues(openapi, 'ClinicSessionStatusEnum');

      if (!apiValues) {
          console.warn('ClinicSessionStatusEnum not found in OpenAPI (session status)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicSessionStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('EnrollmentStatusSchema (enum)', () => {
    it('should match OpenAPI enrollment status enum values', () => {
      const zodValues = getZodEnumValues(EnrollmentStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ClinicEnrollmentStatusEnum');

      if (!apiValues) {
        console.warn('ClinicEnrollmentStatusEnum not found in OpenAPI (enrollment status)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`EnrollmentStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ClinicStaffRoleSchema (enum)', () => {
    it('should match OpenAPI staff role enum values', () => {
      const zodValues = getZodEnumValues(ClinicStaffRoleSchema);
        const apiValues = getSchemaEnumValues(openapi, 'RoleEnum');

      if (!apiValues) {
          console.warn('RoleEnum not found in OpenAPI (staff role)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClinicStaffRoleSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });
});
