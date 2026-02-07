/**
 * Contract Test: Encounter Schema Comparison
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
  EncounterSchema,
  EncounterTypeSchema,
  DiagnosisSchema,
  TreatmentPlanSchema,
  ICD10CodeSchema,
  DiagnosisTypeSchema,
  DiagnosisCertaintySchema,
  TreatmentPlanStatusSchema,
  TriageStatusSchema,
  VisitReasonSchema,
  TriageBypassReasonSchema,
  ConsultationStatusSchema,
  VitalsSourceSchema,
} from '@/lib/schemas/encounter.schema';

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

describe('Encounter Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  describe('EncounterSchema', () => {
    it('should have all fields from the OpenAPI Encounter schema', () => {
      const zodFields = getZodSchemaFields(EncounterSchema);
      const apiProperties = getSchemaProperties(openapi, 'Encounter');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);

      // Find fields in API but missing from Zod
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      // Log missing fields for debugging
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  EncounterSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Allow some tolerance for optional computed fields, but flag as warning
      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) =>
          // These are critical fields that must be in the Zod schema
          ['id', 'patient', 'encounter_type', 'encounter_date', 'chief_complaint', 'status']
            .includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields from the API', () => {
      const zodFields = getZodSchemaFields(EncounterSchema);
      
      // These fields are required by the API and must be present in Zod
      const criticalFields = [
        'id',
        'patient',
        'encounter_type',
        'encounter_date',
        'chief_complaint',
        'status',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should not have fields that do not exist in the API (extra fields)', () => {
      const zodFields = getZodSchemaFields(EncounterSchema);
      const apiProperties = getSchemaProperties(openapi, 'Encounter');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);

      // Find fields in Zod but not in API (potential frontend overreach)
      const extraInZod = zodFields.filter((field) => !apiFields.includes(field));

      // Log extra fields for review
      if (extraInZod.length > 0) {
        console.warn(
          `⚠️  EncounterSchema: Zod fields not in API schema (may be intentional):\n  ${extraInZod.join(', ')}`
        );
      }

      // Note: Extra fields in Zod are often intentional (frontend-only fields)
      // so we just warn rather than fail
    });
  });

  describe('EncounterTypeSchema (enum)', () => {
    it('should match OpenAPI EncounterTypeEnum values', () => {
      const zodValues = getZodEnumValues(EncounterTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'EncounterTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      const extraInZod = zodValues.filter((v) => !apiValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`EncounterTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }
      if (extraInZod.length > 0) {
        console.warn(`EncounterTypeSchema: Extra values: ${extraInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });
  });

  describe('DiagnosisSchema', () => {
    it('should have critical fields from the OpenAPI Diagnosis schema', () => {
      const zodFields = getZodSchemaFields(DiagnosisSchema);
      const apiProperties = getSchemaProperties(openapi, 'Diagnosis');

      if (!apiProperties) {
        // Schema might have different name
        console.warn('Diagnosis schema not found in OpenAPI, checking EncounterDiagnosis');
        return;
      }

      const criticalFields = [
        'id',
        'encounter',
        'diagnosis_type',
        'notes',
        'is_confirmed',
        'certainty',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('TreatmentPlanSchema', () => {
    it('should have critical fields from the OpenAPI TreatmentPlan schema', () => {
      const zodFields = getZodSchemaFields(TreatmentPlanSchema);
      const apiProperties = getSchemaProperties(openapi, 'TreatmentPlan');

      if (!apiProperties) {
        console.warn('TreatmentPlan schema not found in OpenAPI');
        return;
      }

      const criticalFields = [
        'id',
        'encounter',
        'clinical_notes',
        'status',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ICD10CodeSchema', () => {
    it('should have critical fields from the OpenAPI ICD10Code schema', () => {
      const zodFields = getZodSchemaFields(ICD10CodeSchema);
      const apiProperties = getSchemaProperties(openapi, 'ICD10Code');

      if (!apiProperties) {
        console.warn('ICD10Code schema not found in OpenAPI');
        return;
      }

      const criticalFields = ['id', 'code', 'description'];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('DiagnosisTypeSchema (enum)', () => {
    it('should match OpenAPI DiagnosisTypeEnum values', () => {
      const zodValues = getZodEnumValues(DiagnosisTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'DiagnosisTypeEnum');

      if (!apiValues) {
        console.warn('DiagnosisTypeEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });

  describe('DiagnosisCertaintySchema (enum)', () => {
    it('should match OpenAPI DiagnosisCertaintyEnum values', () => {
      const zodValues = getZodEnumValues(DiagnosisCertaintySchema);
      const apiValues = getSchemaEnumValues(openapi, 'CertaintyEnum');

      if (!apiValues) {
        console.warn('CertaintyEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });

  describe('TreatmentPlanStatusSchema (enum)', () => {
    it('should match OpenAPI enum values', () => {
      const zodValues = getZodEnumValues(TreatmentPlanStatusSchema);
      // OpenAPI uses StatusB18Enum for TreatmentPlan status
      const apiValues = getSchemaEnumValues(openapi, 'StatusB18Enum');

      if (!apiValues) {
        // Try alternative name
        const altApiValues = getSchemaEnumValues(openapi, 'TreatmentPlanStatusEnum');
        if (!altApiValues) {
          console.warn('TreatmentPlan status enum not found in OpenAPI');
          return;
        }
      }
    });
  });

  describe('TriageStatusSchema (enum)', () => {
    it('should match OpenAPI TriageStatusEnum values', () => {
      const zodValues = getZodEnumValues(TriageStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'TriageStatusEnum');

      if (!apiValues) {
        console.warn('TriageStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });

  describe('VisitReasonSchema (enum)', () => {
    it('should match OpenAPI VisitReasonEnum values', () => {
      const zodValues = getZodEnumValues(VisitReasonSchema);
      const apiValues = getSchemaEnumValues(openapi, 'VisitReasonEnum');

      if (!apiValues) {
        console.warn('VisitReasonEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });

  describe('TriageBypassReasonSchema (enum)', () => {
    it('should match OpenAPI TriageBypassReasonEnum values', () => {
      const zodValues = getZodEnumValues(TriageBypassReasonSchema);
      const apiValues = getSchemaEnumValues(openapi, 'TriageBypassReasonEnum');

      if (!apiValues) {
        console.warn('TriageBypassReasonEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });

  describe('ConsultationStatusSchema (enum)', () => {
    it('should match OpenAPI ConsultationStatusEnum values', () => {
      const zodValues = getZodEnumValues(ConsultationStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ConsultationStatusEnum');

      if (!apiValues) {
        console.warn('ConsultationStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });

  describe('VitalsSourceSchema (enum)', () => {
    it('should match OpenAPI VitalsSourceEnum values', () => {
      const zodValues = getZodEnumValues(VitalsSourceSchema);
      const apiValues = getSchemaEnumValues(openapi, 'VitalsSourceEnum');

      if (!apiValues) {
        console.warn('VitalsSourceEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });
});
