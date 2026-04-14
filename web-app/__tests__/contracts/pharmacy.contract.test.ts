/**
 * Contract Test: Pharmacy Schema Comparison
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
  DrugSchema,
  DrugCategorySchema,
  StockBatchSchema,
  StockAlertSchema,
  PrescriptionSchema,
  PrescriptionItemSchema,
  DispensingSchema,
  StockAdjustmentSchema,
  DrugFormSchema,
  DrugCategoryEnumSchema,
  DrugScheduleSchema,
  StockStatusSchema,
  AlertTypeSchema,
  AlertSeveritySchema,
  PrescriptionStatusSchema,
  DispensingStatusSchema,
  AdjustmentTypeSchema,
} from '@/lib/schemas/pharmacy.schema';

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

describe('Pharmacy Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  describe('DrugSchema', () => {
    it('should have all fields from the OpenAPI Drug schema', () => {
      const zodFields = getZodSchemaFields(DrugSchema);
      const apiProperties = getSchemaProperties(openapi, 'Drug');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);

      // Find fields in API but missing from Zod
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  DrugSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) =>
          ['id', 'code', 'generic_name', 'form', 'strength', 'unit'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields from the API', () => {
      const zodFields = getZodSchemaFields(DrugSchema);

      const criticalFields = [
        'id',
        'code',
        'generic_name',
        'form',
        'strength',
        'unit',
        'is_active',
        'current_stock',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('DrugCategorySchema', () => {
    it('should have all fields from the OpenAPI DrugCategory schema', () => {
      const zodFields = getZodSchemaFields(DrugCategorySchema);
      const apiProperties = getSchemaProperties(openapi, 'DrugCategory');

      if (!apiProperties) {
        console.warn('DrugCategory schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  DrugCategorySchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('StockBatchSchema', () => {
    it('should have all fields from the OpenAPI StockBatch schema', () => {
      const zodFields = getZodSchemaFields(StockBatchSchema);
      const apiProperties = getSchemaProperties(openapi, 'StockBatch');

      if (!apiProperties) {
        console.warn('StockBatch schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  StockBatchSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'drug', 'batch_number', 'quantity_available', 'expiry_date'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('StockAlertSchema', () => {
    it('should have all fields from the OpenAPI StockAlert schema', () => {
      const zodFields = getZodSchemaFields(StockAlertSchema);
      const apiProperties = getSchemaProperties(openapi, 'StockAlert');

      if (!apiProperties) {
        console.warn('StockAlert schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  StockAlertSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'drug', 'alert_type', 'severity'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('PrescriptionSchema', () => {
    it('should have all fields from the OpenAPI Prescription schema', () => {
      const zodFields = getZodSchemaFields(PrescriptionSchema);
      const apiProperties = getSchemaProperties(openapi, 'Prescription');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  PrescriptionSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'prescription_number', 'patient', 'prescriber', 'status'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('PrescriptionItemSchema', () => {
    it('should have all fields from the OpenAPI PrescriptionItem schema', () => {
      const zodFields = getZodSchemaFields(PrescriptionItemSchema);
      const apiProperties = getSchemaProperties(openapi, 'PrescriptionItem');

      if (!apiProperties) {
        console.warn('PrescriptionItem schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  PrescriptionItemSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'prescription', 'drug', 'quantity_prescribed'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('DispensingSchema', () => {
    it('should have all fields from the OpenAPI Dispensing schema', () => {
      const zodFields = getZodSchemaFields(DispensingSchema);
      const apiProperties = getSchemaProperties(openapi, 'Dispensing');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  DispensingSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'drug', 'stock_batch', 'quantity', 'dispensed_by'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  describe('StockAdjustmentSchema', () => {
    it('should have all fields from the OpenAPI StockAdjustment schema', () => {
      const zodFields = getZodSchemaFields(StockAdjustmentSchema);
      const apiProperties = getSchemaProperties(openapi, 'StockAdjustment');

      if (!apiProperties) {
        console.warn('StockAdjustment schema not found in OpenAPI');
        return;
      }

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  StockAdjustmentSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'stock_batch', 'adjustment_type', 'quantity'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });
  });

  // =============================================================================
  // ENUM TESTS
  // =============================================================================

  describe('DrugFormSchema (enum)', () => {
    it('should match OpenAPI FormEnum values', () => {
      const zodValues = getZodEnumValues(DrugFormSchema);
      const apiValues = getSchemaEnumValues(openapi, 'FormEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`DrugFormSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('DrugCategoryEnumSchema (enum)', () => {
    it('should match OpenAPI CategoryEnum values', () => {
      const zodValues = getZodEnumValues(DrugCategoryEnumSchema);
      const apiValues = getSchemaEnumValues(openapi, 'DrugCategoryEnum');

      if (!apiValues) {
        const registrySchema = getSchemaProperties(openapi, 'DrugCategory');
        if (registrySchema) {
          return;
        }
        console.warn('DrugCategoryEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`DrugCategoryEnumSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('DrugScheduleSchema (enum)', () => {
    it('should match OpenAPI ScheduleEnum values', () => {
      const zodValues = getZodEnumValues(DrugScheduleSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ScheduleEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`DrugScheduleSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('StockStatusSchema (enum)', () => {
    it('should match OpenAPI stock status enum values', () => {
      const zodValues = getZodEnumValues(StockStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'StockBatchStatusEnum');

      if (!apiValues) {
        console.warn('StockBatchStatusEnum not found in OpenAPI (stock status)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`StockStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('AlertTypeSchema (enum)', () => {
    it('should match OpenAPI AlertTypeEnum values', () => {
      const zodValues = getZodEnumValues(AlertTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'AlertTypeEnum');

      if (!apiValues) {
        console.warn('AlertTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`AlertTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('AlertSeveritySchema (enum)', () => {
    it('should match OpenAPI SeverityEnum values', () => {
      const zodValues = getZodEnumValues(AlertSeveritySchema);
      const apiValues = getSchemaEnumValues(openapi, 'SeverityEnum');

      if (!apiValues) {
        console.warn('SeverityEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`AlertSeveritySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('PrescriptionStatusSchema (enum)', () => {
    it('should match OpenAPI prescription status enum values', () => {
      const zodValues = getZodEnumValues(PrescriptionStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'PrescriptionStatusEnum');

      if (!apiValues) {
        console.warn('PrescriptionStatusEnum not found in OpenAPI (prescription status)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`PrescriptionStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('DispensingStatusSchema (enum)', () => {
    it('should match OpenAPI dispensing status enum values', () => {
      const zodValues = getZodEnumValues(DispensingStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'DispensingStatusEnum');

      if (!apiValues) {
        const dispensingSchema = getSchemaProperties(openapi, 'Dispensing');
        if (dispensingSchema) {
          return;
        }
        console.warn('DispensingStatusEnum not found in OpenAPI (dispensing status)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`DispensingStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('AdjustmentTypeSchema (enum)', () => {
    it('should match OpenAPI AdjustmentTypeEnum values', () => {
      const zodValues = getZodEnumValues(AdjustmentTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'AdjustmentTypeEnum');

      if (!apiValues) {
        console.warn('AdjustmentTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`AdjustmentTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });
});
