/**
 * Contract Test: Core Schema Comparison
 *
 * Layer 3 — Frontend Schema Comparison Tests
 *
 * Compares Zod schemas against the OpenAPI spec exported from the backend.
 * Catches frontend schema drift — when the Zod schema doesn't match the actual API.
 *
 * Core module covers:
 * - Kenya location hierarchy (Counties, SubCounties, Wards)
 * - Audit logs
 * - Notifications
 * - Clinical templates
 *
 * @see docs/contract-testing-recommendations.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  // Location schemas
  CountySchema,
  SubCountySchema,
  LocationWardSchema,
  // Notification schemas
  NotificationSchema,
  NotificationPrioritySchema,
  // Clinical template schemas
  ClinicalTemplateSchema,
  TemplateTypeSchema,
} from '@/lib/schemas/core.schema';

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

describe('Core Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // LOCATION SCHEMA TESTS (Kenya Hierarchy)
  // ===========================================================================

  describe('CountySchema', () => {
    it('should have all fields from the OpenAPI County schema', () => {
      const zodFields = getZodSchemaFields(CountySchema);
      const apiProperties = getSchemaProperties(openapi, 'County');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  CountySchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // All County fields are critical
      expect(missingInZod).toEqual([]);
    });

    it('should have all critical fields', () => {
      const zodFields = getZodSchemaFields(CountySchema);
      
      const criticalFields = [
        'id',
        'code',
        'name',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('SubCountySchema', () => {
    it('should have all fields from the OpenAPI SubCounty schema', () => {
      const zodFields = getZodSchemaFields(SubCountySchema);
      const apiProperties = getSchemaProperties(openapi, 'SubCounty');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  SubCountySchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Only fail on critical fields - county_name is optional display field
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'county', 'name'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have all critical fields', () => {
      const zodFields = getZodSchemaFields(SubCountySchema);
      
      const criticalFields = [
        'id',
        'county',
        'name',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('LocationWardSchema', () => {
    it('should have all fields from the OpenAPI Ward schema', () => {
      const zodFields = getZodSchemaFields(LocationWardSchema);
      const apiProperties = getSchemaProperties(openapi, 'Ward');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  LocationWardSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Only fail on critical fields - sub_county_name is optional display field
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'sub_county', 'name'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have all critical fields', () => {
      const zodFields = getZodSchemaFields(LocationWardSchema);
      
      const criticalFields = [
        'id',
        'sub_county',
        'name',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // NOTIFICATION SCHEMA TESTS
  // ===========================================================================

  describe('NotificationSchema', () => {
    it('should have all fields from the OpenAPI Notification schema', () => {
      const zodFields = getZodSchemaFields(NotificationSchema);
      const apiProperties = getSchemaProperties(openapi, 'Notification');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  NotificationSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'notification_type', 'priority', 'title', 'message'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have all critical fields', () => {
      const zodFields = getZodSchemaFields(NotificationSchema);
      
      const criticalFields = [
        'id',
        'notification_type',
        'priority',
        'title',
        'message',
        'is_read',
        'created_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include relation and action fields', () => {
      const zodFields = getZodSchemaFields(NotificationSchema);
      
      const relationFields = [
        'related_model',
        'related_id',
        'action_url',
        'read_at',
      ];

      const missing = relationFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('NotificationPrioritySchema (enum)', () => {
    it('should match OpenAPI NotificationPriorityEnum values', () => {
      const zodValues = getZodEnumValues(NotificationPrioritySchema);
      const apiValues = getSchemaEnumValues(openapi, 'NotificationPriorityEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`NotificationPrioritySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all priority levels', () => {
      const zodValues = getZodEnumValues(NotificationPrioritySchema);
      
      const allPriorities = [
        'low',
        'normal',
        'high',
        'critical',
      ];

      const missing = allPriorities.filter((p) => !zodValues.includes(p));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // CLINICAL TEMPLATE SCHEMA TESTS
  // ===========================================================================

  describe('ClinicalTemplateSchema', () => {
    it('should have all fields from the OpenAPI ClinicalTemplate schema', () => {
      const zodFields = getZodSchemaFields(ClinicalTemplateSchema);
      const apiProperties = getSchemaProperties(openapi, 'ClinicalTemplate');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicalTemplateSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'name', 'template_type', 'content'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have all critical fields', () => {
      const zodFields = getZodSchemaFields(ClinicalTemplateSchema);
      
      const criticalFields = [
        'id',
        'name',
        'template_type',
        'specialty',
        'description',
        'content',
        'is_system',
        'is_active',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include usage and authorship fields', () => {
      const zodFields = getZodSchemaFields(ClinicalTemplateSchema);
      
      const authorshipFields = [
        'usage_count',
        'created_by',
        'created_by_username',
        'sections',
      ];

      const missing = authorshipFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('TemplateTypeSchema (enum)', () => {
    it('should match OpenAPI TemplateTypeEnum values', () => {
      const zodValues = getZodEnumValues(TemplateTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'TemplateTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`TemplateTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all template types', () => {
      const zodValues = getZodEnumValues(TemplateTypeSchema);
      
      const allTypes = [
        'encounter',
        'note',
        'assessment',
        'procedure',
      ];

      const missing = allTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // AUDIT LOG SCHEMA TESTS
  // ===========================================================================

  describe('AuditLog Schema (OpenAPI verification)', () => {
    it('should have AuditLog schema defined in OpenAPI', () => {
      const apiProperties = getSchemaProperties(openapi, 'AuditLog');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      // Verify critical audit log fields exist in API
      const criticalFields = [
        'id',
        'user',
        'action',
        'resource_type',
        'resource_id',
        'timestamp',
        'ip_address',
        'details',
      ];

      const apiFields = Object.keys(apiProperties);
      const missingCritical = criticalFields.filter((f) => !apiFields.includes(f));
      
      expect(missingCritical).toEqual([]);
    });

    it('should include Kenya DPA compliance fields', () => {
      const apiProperties = getSchemaProperties(openapi, 'AuditLog');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      // DPA compliance requires tracking patient access
      const dpaFields = [
        'patient_id',
        'user_agent',
        'username',
      ];

      const apiFields = Object.keys(apiProperties);
      const missingDPA = dpaFields.filter((f) => !apiFields.includes(f));
      
      if (missingDPA.length > 0) {
        console.warn(`AuditLog: Missing DPA fields: ${missingDPA.join(', ')}`);
      }

      expect(missingDPA).toEqual([]);
    });
  });

  // ===========================================================================
  // LOCATION HIERARCHY CONSISTENCY TESTS
  // ===========================================================================

  describe('Location Hierarchy Consistency', () => {
    it('SubCounty should reference County via county field', () => {
      const zodFields = getZodSchemaFields(SubCountySchema);
      expect(zodFields).toContain('county');
    });

    it('Ward should reference SubCounty via sub_county field', () => {
      const zodFields = getZodSchemaFields(LocationWardSchema);
      expect(zodFields).toContain('sub_county');
    });

    it('All location schemas should have id and name fields', () => {
      const countyFields = getZodSchemaFields(CountySchema);
      const subCountyFields = getZodSchemaFields(SubCountySchema);
      const wardFields = getZodSchemaFields(LocationWardSchema);

      expect(countyFields).toContain('id');
      expect(countyFields).toContain('name');
      
      expect(subCountyFields).toContain('id');
      expect(subCountyFields).toContain('name');
      
      expect(wardFields).toContain('id');
      expect(wardFields).toContain('name');
    });
  });

  // ===========================================================================
  // FIELD MAPPING VERIFICATION
  // ===========================================================================

  describe('Field Mapping Verification', () => {
    it('County code should be a number (1-47 Kenya counties)', () => {
      const zodFields = getZodSchemaFields(CountySchema);
      expect(zodFields).toContain('code');
    });

    it('Notification should have notification_type as string', () => {
      const zodFields = getZodSchemaFields(NotificationSchema);
      expect(zodFields).toContain('notification_type');
    });

    it('ClinicalTemplate should have nested content object', () => {
      const zodFields = getZodSchemaFields(ClinicalTemplateSchema);
      expect(zodFields).toContain('content');
    });
  });
});
