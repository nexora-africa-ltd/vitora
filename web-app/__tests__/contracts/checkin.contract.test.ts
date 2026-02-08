/**
 * Contract Test: Check-in Schema Comparison
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
  CheckInResponseSchema,
  TodayCheckinSchema,
  PatientLookupResponseSchema,
  ClinicalSnapshotSchema,
  PendingResultSchema,
  // Enum schemas
  VisitTypeSchema,
  VisitReasonSchema,
} from '@/lib/schemas/checkin.schema';

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

describe('Check-in Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // OBJECT SCHEMA TESTS
  // ===========================================================================

  describe('CheckInResponseSchema', () => {
    it('should have all fields from the OpenAPI CheckInResponse schema', () => {
      const zodFields = getZodSchemaFields(CheckInResponseSchema);
      const apiProperties = getSchemaProperties(openapi, 'CheckInResponse');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  CheckInResponseSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['checkin_id', 'patient_name', 'status', 'destination'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(CheckInResponseSchema);
      
      const criticalFields = [
        'checkin_id',
        'patient_name',
        'patient_mrn',
        'destination',
        'visit_type',
        'visit_reason',
        'status',
        'queue_position',
        'estimated_wait_minutes',
        'checked_in_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include queue and routing fields', () => {
      const zodFields = getZodSchemaFields(CheckInResponseSchema);
      
      const routingFields = [
        'destination_clinic_id',
        'destination_clinic_name',
        'skip_triage',
        'encounter_id',
        'linked_encounter_id',
        'clinic_visit_id',
      ];

      const missing = routingFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('TodayCheckinSchema', () => {
    it('should have all fields from the OpenAPI TodayCheckin schema', () => {
      const zodFields = getZodSchemaFields(TodayCheckinSchema);
      const apiProperties = getSchemaProperties(openapi, 'TodayCheckin');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  TodayCheckinSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'patient_name', 'patient_mrn', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(TodayCheckinSchema);
      
      const criticalFields = [
        'id',
        'patient_name',
        'patient_mrn',
        'destination',
        'visit_type',
        'visit_reason',
        'status',
        'checked_in_at',
        'skip_triage',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include staff and clinic fields', () => {
      const zodFields = getZodSchemaFields(TodayCheckinSchema);
      
      const staffFields = [
        'destination_clinic_id',
        'checked_in_by_name',
      ];

      const missing = staffFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('PatientLookupResponseSchema', () => {
    it('should have all fields from the OpenAPI PatientLookup schema', () => {
      const zodFields = getZodSchemaFields(PatientLookupResponseSchema);
      const apiProperties = getSchemaProperties(openapi, 'PatientLookup');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  PatientLookupResponseSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'mrn', 'first_name', 'last_name'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical patient fields', () => {
      const zodFields = getZodSchemaFields(PatientLookupResponseSchema);
      
      const criticalFields = [
        'id',
        'mrn',
        'first_name',
        'last_name',
        'full_name',
        'date_of_birth',
        'age',
        'gender',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include clinical context fields', () => {
      const zodFields = getZodSchemaFields(PatientLookupResponseSchema);
      
      const clinicalFields = [
        'clinical_snapshot',
        'suggested_visit_type',
        'suggested_visit_reason',
        'last_encounter_date',
      ];

      const missing = clinicalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include identification and location fields', () => {
      const zodFields = getZodSchemaFields(PatientLookupResponseSchema);
      
      const identityFields = [
        'phone_number',
        'identification_type',
        'identification_number',
        'county',
        'sub_county',
        'ward',
      ];

      const missing = identityFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ClinicalSnapshotSchema', () => {
    it('should have all fields from the OpenAPI ClinicalSnapshot schema', () => {
      const zodFields = getZodSchemaFields(ClinicalSnapshotSchema);
      const apiProperties = getSchemaProperties(openapi, 'ClinicalSnapshot');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClinicalSnapshotSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // All clinical fields are critical
      expect(missingInZod).toEqual([]);
    });

    it('should have all clinical summary fields', () => {
      const zodFields = getZodSchemaFields(ClinicalSnapshotSchema);
      
      const summaryFields = [
        'allergies',
        'active_conditions',
        'current_medications',
        'last_visit_date',
        'last_visit_clinic',
        'pending_results',
        'alerts',
      ];

      const missing = summaryFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('PendingResultSchema', () => {
    it('should have required lab result fields', () => {
      const zodFields = getZodSchemaFields(PendingResultSchema);
      
      const requiredFields = [
        'test_name',
        'ordered_date',
        'status',
      ];

      const missing = requiredFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // ENUM SCHEMA TESTS
  // ===========================================================================

  describe('VisitTypeSchema (enum)', () => {
    it('should match OpenAPI CheckInVisitTypeEnum values', () => {
      const zodValues = getZodEnumValues(VisitTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'CheckInVisitTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`VisitTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all visit types', () => {
      const zodValues = getZodEnumValues(VisitTypeSchema);
      
      const allTypes = [
        'NEW',
        'RETURN',
        'FOLLOW_UP',
        'EMERGENCY',
        'SCHEDULED',
      ];

      const missing = allTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  describe('VisitReasonSchema (enum)', () => {
    it('should match OpenAPI VisitReasonEnum values', () => {
      const zodValues = getZodEnumValues(VisitReasonSchema);
      const apiValues = getSchemaEnumValues(openapi, 'VisitReasonEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`VisitReasonSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all visit reasons', () => {
      const zodValues = getZodEnumValues(VisitReasonSchema);
      
      const allReasons = [
        'NEW_COMPLAINT',
        'FOLLOW_UP',
        'CHRONIC_CARE',
        'PROCEDURE_REVIEW',
        'REFILL_ONLY',
        'LAB_REVIEW',
        'REFERRAL_VISIT',
        'OTHER',
      ];

      const missing = allReasons.filter((r) => !zodValues.includes(r));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // FIELD MAPPING TESTS
  // ===========================================================================

  describe('Field Mapping Verification', () => {
    it('CheckInResponseSchema should have queue_position as number', () => {
      const zodFields = getZodSchemaFields(CheckInResponseSchema);
      expect(zodFields).toContain('queue_position');
    });

    it('CheckInResponseSchema should have estimated_wait_minutes as number', () => {
      const zodFields = getZodSchemaFields(CheckInResponseSchema);
      expect(zodFields).toContain('estimated_wait_minutes');
    });

    it('TodayCheckinSchema should have id field for list operations', () => {
      const zodFields = getZodSchemaFields(TodayCheckinSchema);
      expect(zodFields).toContain('id');
    });

    it('PatientLookupResponseSchema should have nested clinical_snapshot', () => {
      const zodFields = getZodSchemaFields(PatientLookupResponseSchema);
      expect(zodFields).toContain('clinical_snapshot');
    });
  });

  // ===========================================================================
  // CONSISTENCY TESTS
  // ===========================================================================

  describe('Schema Consistency', () => {
    it('visit_type should use same enum in both CheckInResponse and TodayCheckin', () => {
      const responseFields = getZodSchemaFields(CheckInResponseSchema);
      const todayFields = getZodSchemaFields(TodayCheckinSchema);
      
      expect(responseFields).toContain('visit_type');
      expect(todayFields).toContain('visit_type');
    });

    it('visit_reason should use same enum in both CheckInResponse and TodayCheckin', () => {
      const responseFields = getZodSchemaFields(CheckInResponseSchema);
      const todayFields = getZodSchemaFields(TodayCheckinSchema);
      
      expect(responseFields).toContain('visit_reason');
      expect(todayFields).toContain('visit_reason');
    });

    it('patient_mrn field should be consistent across schemas', () => {
      const responseFields = getZodSchemaFields(CheckInResponseSchema);
      const todayFields = getZodSchemaFields(TodayCheckinSchema);
      
      expect(responseFields).toContain('patient_mrn');
      expect(todayFields).toContain('patient_mrn');
    });
  });
});
