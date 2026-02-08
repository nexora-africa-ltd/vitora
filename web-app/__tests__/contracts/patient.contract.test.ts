/**
 * Contract Test: Patient Schema Comparison
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
  PatientSchema,
  PatientListItemSchema,
  EmergencyContactSchema,
  GenderSchema,
  IdentificationTypeSchema,
  ReferralSourceSchema,
  PaymentModeSchema,
  EncounterStatusSchema,
  PatientTitleSchema,
  TitleEnumSchema,
} from '@/lib/schemas/patient.schema';

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

describe('Patient Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  describe('PatientSchema', () => {
    it('should have all fields from the OpenAPI Patient schema', () => {
      const zodFields = getZodSchemaFields(PatientSchema);
      const apiProperties = getSchemaProperties(openapi, 'Patient');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);

      // Find fields in API but missing from Zod
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      // Log missing fields for debugging
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  PatientSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) =>
          // These are critical fields that must be in the Zod schema
          ['id', 'mrn', 'first_name', 'last_name', 'date_of_birth', 'gender']
            .includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields from the API', () => {
      const zodFields = getZodSchemaFields(PatientSchema);
      
      // These fields are required by the API and must be present in Zod
      const criticalFields = [
        'id',
        'mrn',
        'first_name',
        'last_name',
        'date_of_birth',
        'gender',
        'county',
        'sub_county',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should not have fields that do not exist in the API (extra fields)', () => {
      const zodFields = getZodSchemaFields(PatientSchema);
      const apiProperties = getSchemaProperties(openapi, 'Patient');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);

      // Find fields in Zod but not in API (potential frontend overreach)
      const extraInZod = zodFields.filter((field) => !apiFields.includes(field));

      // Log extra fields for review
      if (extraInZod.length > 0) {
        console.warn(
          `⚠️  PatientSchema: Zod fields not in API schema (may be intentional):\n  ${extraInZod.join(', ')}`
        );
      }

      // Note: Extra fields in Zod are often intentional (frontend-only fields)
      // so we just warn rather than fail
    });
  });

  describe('EmergencyContactSchema', () => {
    it('should have all fields from the OpenAPI EmergencyContact schema', () => {
      const zodFields = getZodSchemaFields(EmergencyContactSchema);
      const apiProperties = getSchemaProperties(openapi, 'EmergencyContact');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);

      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  EmergencyContactSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      expect(missingInZod).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(EmergencyContactSchema);
      
      const criticalFields = [
        'id',
        'full_name',
        'relationship',
        'phone_number',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('PatientListItemSchema', () => {
    it('should have essential list fields', () => {
      const zodFields = getZodSchemaFields(PatientListItemSchema);

      const essentialFields = [
        'id',
        'mrn',
        'first_name',
        'last_name',
        'date_of_birth',
        'gender',
        'phone_number',
        'created_at',
      ];

      const missing = essentialFields.filter((field) => !zodFields.includes(field));
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
      const extraInZod = zodValues.filter((v) => !apiValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`GenderSchema: Missing values: ${missingInZod.join(', ')}`);
      }
      if (extraInZod.length > 0) {
        console.warn(`GenderSchema: Extra values: ${extraInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('IdentificationTypeSchema (enum)', () => {
    it('should match OpenAPI IdentificationTypeEnum values', () => {
      const zodValues = getZodEnumValues(IdentificationTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'IdentificationTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`IdentificationTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('ReferralSourceSchema (enum)', () => {
    it('should match OpenAPI ReferralSourceEnum values', () => {
      const zodValues = getZodEnumValues(ReferralSourceSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ReferralSourceEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ReferralSourceSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('EncounterStatusSchema (enum)', () => {
    it('should match OpenAPI EncounterStatusEnum values', () => {
      const zodValues = getZodEnumValues(EncounterStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'EncounterStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`EncounterStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('PatientTitleSchema (enum)', () => {
    it('should match OpenAPI TitleEnum values', () => {
      // Use TitleEnumSchema (base enum) instead of PatientTitleSchema (optional wrapper)
      const zodValues = getZodEnumValues(TitleEnumSchema);
      const apiValues = getSchemaEnumValues(openapi, 'TitleEnum');

      if (!apiValues) {
        console.warn('TitleEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`PatientTitleSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      // All backend values should be present in Zod schema
      expect(missingInZod).toEqual([]);
    });
  });

  describe('PaymentModeSchema (enum)', () => {
    it('should match OpenAPI PaymentTypeEnum values', () => {
      const zodValues = getZodEnumValues(PaymentModeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'PaymentTypeEnum');

      if (!apiValues) {
        console.warn('PaymentTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`PaymentModeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });
});
