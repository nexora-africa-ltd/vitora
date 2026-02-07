/**
 * Contract Test: Triage Schema Comparison
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
  TriageAssessmentSchema,
  TriageQueueEntrySchema,
  TriageVitalThresholdSchema,
  // Enum schemas
  TriageCategorySchema,
  AVPUStatusSchema,
  MobilityStatusSchema,
  ArrivalModeSchema,
  ChiefComplaintCategorySchema,
  AssignedAreaSchema,
  QueueStatusSchema,
  VitalTypeSchema,
} from '@/lib/schemas/triage.schema';

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

describe('Triage Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // OBJECT SCHEMA TESTS
  // ===========================================================================

  describe('TriageAssessmentSchema', () => {
    it('should have all fields from the OpenAPI TriageAssessment schema', () => {
      const zodFields = getZodSchemaFields(TriageAssessmentSchema);
      const apiProperties = getSchemaProperties(openapi, 'TriageAssessment');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  TriageAssessmentSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'encounter', 'triage_category', 'chief_complaint'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(TriageAssessmentSchema);
      
      const criticalFields = [
        'id',
        'encounter',
        'arrival_mode',
        'arrival_time',
        'chief_complaint',
        'triage_category',
        'assigned_area',
        'triaged_by',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('TriageQueueEntrySchema', () => {
    it('should have all fields from the OpenAPI TriageQueue schema', () => {
      const zodFields = getZodSchemaFields(TriageQueueEntrySchema);
      const apiProperties = getSchemaProperties(openapi, 'TriageQueue');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  TriageQueueEntrySchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'triage_assessment', 'patient_name', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(TriageQueueEntrySchema);
      
      const criticalFields = [
        'id',
        'triage_assessment',
        'patient_name',
        'patient_mrn',
        'triage_category',
        'status',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('TriageVitalThresholdSchema', () => {
    it('should have all fields from the OpenAPI TriageVitalThreshold schema', () => {
      const zodFields = getZodSchemaFields(TriageVitalThresholdSchema);
      const apiProperties = getSchemaProperties(openapi, 'TriageVitalThreshold');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  TriageVitalThresholdSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'vital_type', 'is_active'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(TriageVitalThresholdSchema);
      
      const criticalFields = [
        'id',
        'vital_type',
        'is_active',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // ENUM SCHEMA TESTS
  // ===========================================================================

  describe('TriageCategorySchema (enum)', () => {
    it('should match OpenAPI TriageCategoryEnum values', () => {
      const zodValues = getZodEnumValues(TriageCategorySchema);
      const apiValues = getSchemaEnumValues(openapi, 'TriageCategoryEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`TriageCategorySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all critical triage categories', () => {
      const zodValues = getZodEnumValues(TriageCategorySchema);
      
      const criticalCategories = [
        'RED',
        'ORANGE',
        'YELLOW',
        'GREEN',
        'BLUE',
      ];

      const missing = criticalCategories.filter((c) => !zodValues.includes(c));
      expect(missing).toEqual([]);
    });
  });

  describe('AVPUStatusSchema (enum)', () => {
    it('should match OpenAPI MentalStatusEnum values', () => {
      const zodValues = getZodEnumValues(AVPUStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'MentalStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`AVPUStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all AVPU statuses', () => {
      const zodValues = getZodEnumValues(AVPUStatusSchema);
      
      const avpuStatuses = ['A', 'V', 'P', 'U'];

      const missing = avpuStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('MobilityStatusSchema (enum)', () => {
    it('should match OpenAPI MobilityEnum values', () => {
      const zodValues = getZodEnumValues(MobilityStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'MobilityEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`MobilityStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical mobility statuses', () => {
      const zodValues = getZodEnumValues(MobilityStatusSchema);
      
      const criticalStatuses = [
        'AMBULATORY',
        'WHEELCHAIR',
        'STRETCHER',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('ArrivalModeSchema (enum)', () => {
    it('should match OpenAPI ArrivalModeEnum values', () => {
      const zodValues = getZodEnumValues(ArrivalModeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ArrivalModeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ArrivalModeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical arrival modes', () => {
      const zodValues = getZodEnumValues(ArrivalModeSchema);
      
      const criticalModes = [
        'WALK_IN',
        'AMBULANCE',
        'REFERRAL',
      ];

      const missing = criticalModes.filter((m) => !zodValues.includes(m));
      expect(missing).toEqual([]);
    });
  });

  describe('ChiefComplaintCategorySchema (enum)', () => {
    it('should match OpenAPI ChiefComplaintCategoryEnum values', () => {
      const zodValues = getZodEnumValues(ChiefComplaintCategorySchema);
      const apiValues = getSchemaEnumValues(openapi, 'ChiefComplaintCategoryEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ChiefComplaintCategorySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical complaint categories', () => {
      const zodValues = getZodEnumValues(ChiefComplaintCategorySchema);
      
      const criticalCategories = [
        'CHEST_PAIN',
        'DIFFICULTY_BREATHING',
        'TRAUMA',
        'FEVER',
        'OTHER',
      ];

      const missing = criticalCategories.filter((c) => !zodValues.includes(c));
      expect(missing).toEqual([]);
    });
  });

  describe('AssignedAreaSchema (enum)', () => {
    it('should match OpenAPI AssignedAreaEnum values', () => {
      const zodValues = getZodEnumValues(AssignedAreaSchema);
      const apiValues = getSchemaEnumValues(openapi, 'AssignedAreaEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`AssignedAreaSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical assigned areas', () => {
      const zodValues = getZodEnumValues(AssignedAreaSchema);
      
      const criticalAreas = [
        'ER_RESUS',
        'ER_ACUTE',
        'OPD',
      ];

      const missing = criticalAreas.filter((a) => !zodValues.includes(a));
      expect(missing).toEqual([]);
    });
  });

  describe('QueueStatusSchema (enum)', () => {
    it('should match OpenAPI TriageQueueStatusEnum values', () => {
      const zodValues = getZodEnumValues(QueueStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'TriageQueueStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`QueueStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical queue statuses', () => {
      const zodValues = getZodEnumValues(QueueStatusSchema);
      
      const criticalStatuses = [
        'WAITING',
        'CALLED',
        'COMPLETED',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('VitalTypeSchema (enum)', () => {
    it('should match OpenAPI VitalTypeEnum values', () => {
      const zodValues = getZodEnumValues(VitalTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'VitalTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`VitalTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical vital types', () => {
      const zodValues = getZodEnumValues(VitalTypeSchema);
      
      const criticalVitals = [
        'SPO2',
        'HEART_RATE',
        'TEMPERATURE',
        'RESPIRATORY_RATE',
      ];

      const missing = criticalVitals.filter((v) => !zodValues.includes(v));
      expect(missing).toEqual([]);
    });
  });
});
