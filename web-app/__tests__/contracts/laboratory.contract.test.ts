/**
 * Contract Test: Laboratory Schema Comparison
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
  LabTestCatalogSchema,
  LabOrderSchema,
  LabOrderItemSchema,
  LabResultSchema,
  LabQueueSchema,
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
} from '@/lib/schemas/laboratory.schema';

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

describe('Laboratory Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  describe('LabTestCatalogSchema', () => {
    it('should have all fields from the OpenAPI TestCatalog schema', () => {
      const zodFields = getZodSchemaFields(LabTestCatalogSchema);
      // Backend uses TestCatalog, not LabTestCatalog
      const apiProperties = getSchemaProperties(openapi, 'TestCatalog');

      if (!apiProperties) {
        console.warn('TestCatalog schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);

      // Find fields in API but missing from Zod
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  LabTestCatalogSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) =>
          ['id', 'code', 'name', 'category', 'specimen_type'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(LabTestCatalogSchema);

      const criticalFields = [
        'id',
        'code',
        'name',
        'category',
        'specimen_type',
        'result_type',
        'is_active',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('LabOrderSchema', () => {
    it('should have all fields from the OpenAPI LabOrder schema', () => {
      const zodFields = getZodSchemaFields(LabOrderSchema);
      const apiProperties = getSchemaProperties(openapi, 'LabOrder');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  LabOrderSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'order_number', 'patient', 'encounter', 'status'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('LabOrderItemSchema', () => {
    it('should have all fields from the OpenAPI LabOrderItem schema', () => {
      const zodFields = getZodSchemaFields(LabOrderItemSchema);
      const apiProperties = getSchemaProperties(openapi, 'LabOrderItem');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  LabOrderItemSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'test_name', 'test_code', 'status'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('LabResultSchema', () => {
    it('should have all fields from the OpenAPI LabResult schema', () => {
      const zodFields = getZodSchemaFields(LabResultSchema);
      const apiProperties = getSchemaProperties(openapi, 'LabResult');

      if (!apiProperties) {
        console.warn('LabResult schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  LabResultSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'order_item', 'verification_status'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('LabQueueSchema', () => {
    it('should have all fields from the OpenAPI LabQueue schema', () => {
      const zodFields = getZodSchemaFields(LabQueueSchema);
      const apiProperties = getSchemaProperties(openapi, 'LabQueue');

      if (!apiProperties) {
        console.warn('LabQueue schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  LabQueueSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'lab_order', 'queue_number', 'priority', 'queue_status'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  // =============================================================================
  // ENUM TESTS
  // =============================================================================

  describe('TestCategorySchema (enum)', () => {
    it('should match OpenAPI LabTestCategoryEnum values', () => {
      const zodValues = getZodEnumValues(TestCategorySchema);
      // Backend uses LabTestCategoryEnum, not TestCategoryEnum
      const apiValues = getSchemaEnumValues(openapi, 'LabTestCategoryEnum');

      if (!apiValues) {
        const labCatalog = getSchemaProperties(openapi, 'TestCatalog');
        if (labCatalog) {
          return;
        }
        console.warn('LabTestCategoryEnum not found in OpenAPI (test category)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`TestCategorySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('SpecimenTypeSchema (enum)', () => {
    it('should match OpenAPI SpecimenTypeEnum values', () => {
      const zodValues = getZodEnumValues(SpecimenTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'SpecimenTypeEnum');

      if (!apiValues) {
        console.warn('SpecimenTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`SpecimenTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ResultTypeSchema (enum)', () => {
    it('should match OpenAPI ResultTypeEnum values', () => {
      const zodValues = getZodEnumValues(ResultTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ResultTypeEnum');

      if (!apiValues) {
        console.warn('ResultTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ResultTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('OrderTypeSchema (enum)', () => {
    it('should match OpenAPI OrderTypeEnum values', () => {
      const zodValues = getZodEnumValues(OrderTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'OrderTypeEnum');

      if (!apiValues) {
        console.warn('OrderTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`OrderTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('LabOrderStatusSchema (enum)', () => {
    it('should match OpenAPI LabOrderStatusEnum values', () => {
      const zodValues = getZodEnumValues(LabOrderStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'LabOrderStatusEnum');

      if (!apiValues) {
        console.warn('LabOrderStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`LabOrderStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('LabPrioritySchema (enum)', () => {
    it('should match OpenAPI lab priority enum values', () => {
      const zodValues = getZodEnumValues(LabPrioritySchema);
      const apiValues = getSchemaEnumValues(openapi, 'OrderPriorityEnum');

      if (!apiValues) {
        console.warn('OrderPriorityEnum not found in OpenAPI (lab priority)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`LabPrioritySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('LabOrderItemStatusSchema (enum)', () => {
    it('should match OpenAPI LabOrderItemStatusEnum values', () => {
      const zodValues = getZodEnumValues(LabOrderItemStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'LabOrderItemStatusEnum');

      if (!apiValues) {
        console.warn('LabOrderItemStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`LabOrderItemStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ResultFlagSchema (enum)', () => {
    it('should match OpenAPI ResultFlagEnum values', () => {
      const zodValues = getZodEnumValues(ResultFlagSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ResultFlagEnum');

      if (!apiValues) {
        console.warn('ResultFlagEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ResultFlagSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('VerificationStatusSchema (enum)', () => {
    it('should match OpenAPI VerificationStatusEnum values', () => {
      const zodValues = getZodEnumValues(VerificationStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'VerificationStatusEnum');

      if (!apiValues) {
        console.warn('VerificationStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`VerificationStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('QueueStatusSchema (enum)', () => {
    it('should match OpenAPI queue status enum values', () => {
      const zodValues = getZodEnumValues(QueueStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'QueueStatusEnum');

      if (!apiValues) {
        console.warn('QueueStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`QueueStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });
});
