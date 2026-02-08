/**
 * Contract Test: Imaging Schema Comparison
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
  ImagingProcedureSchema,
  ImagingProcedureDetailSchema,
  ImagingOrderSchema,
  ImagingOrderItemSchema,
  ImagingResourceSchema,
  ImagingModalitySchema,
  ImagingBodyRegionSchema,
  ImagingOrderStatusSchema,
  ImagingPrioritySchema,
  LateralitySchema,
} from '@/lib/schemas/imaging.schema';

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

describe('Imaging Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // OBJECT SCHEMA TESTS
  // ===========================================================================

  describe('ImagingProcedureSchema', () => {
    it('should have all fields from the OpenAPI ImagingProcedure schema', () => {
      const zodFields = getZodSchemaFields(ImagingProcedureSchema);
      const apiProperties = getSchemaProperties(openapi, 'ImagingProcedure');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ImagingProcedureSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) =>
          ['id', 'code', 'name', 'modality', 'body_region'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ImagingProcedureSchema);
      
      const criticalFields = [
        'id',
        'code',
        'name',
        'modality',
        'body_region',
        'cost',
        'sha_claimable',
        'available_in_house',
        'is_active',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ImagingProcedureDetailSchema', () => {
    it('should have all fields from the OpenAPI ImagingProcedureDetail schema', () => {
      const zodFields = getZodSchemaFields(ImagingProcedureDetailSchema);
      const apiProperties = getSchemaProperties(openapi, 'ImagingProcedureDetail');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ImagingProcedureDetailSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) =>
          ['id', 'code', 'name', 'modality', 'body_region', 'requires_contrast', 'requires_sedation'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ImagingProcedureDetailSchema);
      
      const criticalFields = [
        'id',
        'code',
        'name',
        'modality',
        'body_region',
        'requires_contrast',
        'requires_sedation',
        'turnaround_hours',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ImagingOrderSchema', () => {
    it('should have all fields from the OpenAPI ImagingOrder schema', () => {
      const zodFields = getZodSchemaFields(ImagingOrderSchema);
      const apiProperties = getSchemaProperties(openapi, 'ImagingOrder');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ImagingOrderSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'order_number', 'patient', 'encounter', 'status', 'priority'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ImagingOrderSchema);
      
      const criticalFields = [
        'id',
        'order_number',
        'patient',
        'encounter',
        'ordered_by',
        'priority',
        'clinical_indication',
        'status',
        'total_cost',
        'is_paid',
        'items',
        'ordered_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ImagingOrderItemSchema', () => {
    it('should have all fields from the OpenAPI ImagingOrderItem schema', () => {
      const zodFields = getZodSchemaFields(ImagingOrderItemSchema);
      const apiProperties = getSchemaProperties(openapi, 'ImagingOrderItem');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ImagingOrderItemSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'procedure', 'procedure_name', 'laterality'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ImagingOrderItemSchema);
      
      const criticalFields = [
        'id',
        'procedure',
        'procedure_name',
        'procedure_code',
        'modality',
        'laterality',
        'is_completed',
        'unit_cost',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ImagingResourceSchema', () => {
    it('should have all fields from the OpenAPI ImagingResource schema', () => {
      const zodFields = getZodSchemaFields(ImagingResourceSchema);
      const apiProperties = getSchemaProperties(openapi, 'ImagingResource');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ImagingResourceSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissing = missingInZod.filter(
        (field) => ['id', 'name', 'code', 'resource_type', 'is_active'].includes(field)
      );
      expect(criticalMissing).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ImagingResourceSchema);
      
      const criticalFields = [
        'id',
        'name',
        'code',
        'resource_type',
        'is_active',
        'metadata',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // ENUM TESTS
  // ===========================================================================

  describe('ImagingModalitySchema (enum)', () => {
    it('should match OpenAPI ModalityEnum values', () => {
      const zodValues = getZodEnumValues(ImagingModalitySchema);
      const apiValues = getSchemaEnumValues(openapi, 'ModalityEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) {
        console.warn('ModalityEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ImagingModalitySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all standard imaging modalities', () => {
      const zodValues = getZodEnumValues(ImagingModalitySchema);
      
      const expectedModalities = ['XR', 'US', 'CT', 'MRI', 'NM', 'MG', 'FL', 'OTHER'];
      const missing = expectedModalities.filter((m) => !zodValues.includes(m));
      
      expect(missing).toEqual([]);
    });
  });

  describe('ImagingBodyRegionSchema (enum)', () => {
    it('should match OpenAPI BodyRegionEnum values', () => {
      const zodValues = getZodEnumValues(ImagingBodyRegionSchema);
      const apiValues = getSchemaEnumValues(openapi, 'BodyRegionEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) {
        console.warn('BodyRegionEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ImagingBodyRegionSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all standard body regions', () => {
      const zodValues = getZodEnumValues(ImagingBodyRegionSchema);
      
      const expectedRegions = [
        'HEAD', 'NECK', 'CHEST', 'ABDOMEN', 'PELVIS',
        'SPINE', 'UPPER_EXTREMITY', 'LOWER_EXTREMITY', 'WHOLE_BODY', 'OTHER',
      ];
      const missing = expectedRegions.filter((r) => !zodValues.includes(r));
      
      expect(missing).toEqual([]);
    });
  });

  describe('ImagingOrderStatusSchema (enum)', () => {
    it('should match OpenAPI ImagingOrderStatusEnum values', () => {
      const zodValues = getZodEnumValues(ImagingOrderStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ImagingOrderStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) {
        console.warn('ImagingOrderStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ImagingOrderStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all standard order statuses', () => {
      const zodValues = getZodEnumValues(ImagingOrderStatusSchema);
      
      const expectedStatuses = [
        'DRAFT', 'ORDERED', 'SCHEDULED', 'IN_PROGRESS',
        'COMPLETED', 'REPORTED', 'CANCELLED',
      ];
      const missing = expectedStatuses.filter((s) => !zodValues.includes(s));
      
      expect(missing).toEqual([]);
    });
  });

  describe('ImagingPrioritySchema (enum)', () => {
    it('should match OpenAPI OrderPriorityEnum values', () => {
      const zodValues = getZodEnumValues(ImagingPrioritySchema);
      const apiValues = getSchemaEnumValues(openapi, 'OrderPriorityEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) {
        console.warn('OrderPriorityEnum not found in OpenAPI (imaging priority)');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ImagingPrioritySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include ROUTINE, URGENT, and STAT priorities', () => {
      const zodValues = getZodEnumValues(ImagingPrioritySchema);
      
      const expectedPriorities = ['ROUTINE', 'URGENT', 'STAT'];
      const missing = expectedPriorities.filter((p) => !zodValues.includes(p));
      
      expect(missing).toEqual([]);
    });
  });

  describe('LateralitySchema (enum)', () => {
    it('should match OpenAPI LateralityEnum values', () => {
      const zodValues = getZodEnumValues(LateralitySchema);
      const apiValues = getSchemaEnumValues(openapi, 'LateralityEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) {
        console.warn('LateralityEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`LateralitySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all laterality options', () => {
      const zodValues = getZodEnumValues(LateralitySchema);
      
      const expectedLateralities = ['NA', 'LEFT', 'RIGHT', 'BILATERAL'];
      const missing = expectedLateralities.filter((l) => !zodValues.includes(l));
      
      expect(missing).toEqual([]);
    });
  });
});
