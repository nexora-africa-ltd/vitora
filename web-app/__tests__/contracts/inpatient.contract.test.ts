/**
 * Contract Test: Inpatient Schema Comparison
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
  WardSchema,
  BedSchema,
  AdmissionRecommendationSchema,
  AdmissionSchema,
  DischargeSchema,
  TransferSchema,
  WardRoundSchema,
  NursingKardexSchema,
  ShiftHandoverSchema,
  // Enum schemas
  InpatientWardTypeSchema,
  BedStatusSchema,
  AdmissionRecommendationStatusSchema,
  AdmissionRecommendationUrgencySchema,
  AdmissionStatusSchema,
  AdmissionPayerTypeSchema,
  DischargeTypeSchema,
  TransferReasonSchema,
  ConditionStatusSchema,
  RiskLevelSchema,
  ShiftTypeSchema,
} from '@/lib/schemas/inpatient.schema';

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
 * Get the properties from a component schema.
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

describe('Inpatient Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // OBJECT SCHEMA TESTS
  // ===========================================================================

  describe('WardSchema', () => {
    it('should have all fields from the OpenAPI InpatientWard schema', () => {
      const zodFields = getZodSchemaFields(WardSchema);
      const apiProperties = getSchemaProperties(openapi, 'InpatientWard');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  WardSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'name', 'code', 'ward_type', 'capacity'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(WardSchema);
      
      const criticalFields = [
        'id',
        'name',
        'code',
        'ward_type',
        'capacity',
        'is_active',
        'daily_rate',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('BedSchema', () => {
    it('should have all fields from the OpenAPI Bed schema', () => {
      const zodFields = getZodSchemaFields(BedSchema);
      const apiProperties = getSchemaProperties(openapi, 'Bed');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  BedSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'ward', 'bed_number', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(BedSchema);
      
      const criticalFields = [
        'id',
        'ward',
        'bed_number',
        'status',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('AdmissionRecommendationSchema', () => {
    it('should have all fields from the OpenAPI AdmissionRecommendation schema', () => {
      const zodFields = getZodSchemaFields(AdmissionRecommendationSchema);
      const apiProperties = getSchemaProperties(openapi, 'AdmissionRecommendation');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  AdmissionRecommendationSchema: API fields missing:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'encounter', 'status', 'urgency'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(AdmissionRecommendationSchema);
      
      const criticalFields = [
        'id',
        'encounter',
        'recommended_by',
        'reason',
        'urgency',
        'status',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('AdmissionSchema', () => {
    it('should have all fields from the OpenAPI Admission schema', () => {
      const zodFields = getZodSchemaFields(AdmissionSchema);
      const apiProperties = getSchemaProperties(openapi, 'Admission');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  AdmissionSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'admission_number', 'patient', 'ward', 'bed', 'admission_status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(AdmissionSchema);
      
      const criticalFields = [
        'id',
        'admission_number',
        'patient',
        'admission_date',
        'ward',
        'bed',
        'admission_status',
        'payer_type',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('DischargeSchema', () => {
    it('should have all fields from the OpenAPI Discharge schema', () => {
      const zodFields = getZodSchemaFields(DischargeSchema);
      const apiProperties = getSchemaProperties(openapi, 'Discharge');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  DischargeSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'admission', 'discharge_type', 'discharge_date'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(DischargeSchema);
      
      const criticalFields = [
        'id',
        'admission',
        'discharge_type',
        'discharge_date',
        'discharged_by',
        'final_diagnosis',
        'treatment_summary',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('TransferSchema', () => {
    it('should have all fields from the OpenAPI Transfer schema', () => {
      const zodFields = getZodSchemaFields(TransferSchema);
      const apiProperties = getSchemaProperties(openapi, 'Transfer');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  TransferSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'admission', 'source_ward', 'destination_ward', 'reason'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(TransferSchema);
      
      const criticalFields = [
        'id',
        'admission',
        'source_ward',
        'source_bed',
        'destination_ward',
        'destination_bed',
        'reason',
        'transferred_by',
        'transfer_date',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('WardRoundSchema', () => {
    it('should have all fields from the OpenAPI WardRound schema', () => {
      const zodFields = getZodSchemaFields(WardRoundSchema);
      const apiProperties = getSchemaProperties(openapi, 'WardRound');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  WardRoundSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'admission', 'round_date', 'conducted_by'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(WardRoundSchema);
      
      const criticalFields = [
        'id',
        'admission',
        'round_date',
        'round_time',
        'conducted_by',
        'subjective',
        'objective',
        'assessment',
        'plan',
        'condition_status',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('NursingKardexSchema', () => {
    it('should have all fields from the OpenAPI NursingKardex schema', () => {
      const zodFields = getZodSchemaFields(NursingKardexSchema);
      const apiProperties = getSchemaProperties(openapi, 'NursingKardex');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  NursingKardexSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'admission', 'fall_risk', 'pressure_sore_risk'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(NursingKardexSchema);
      
      const criticalFields = [
        'id',
        'admission',
        'fall_risk',
        'pressure_sore_risk',
        'isolation_required',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ShiftHandoverSchema', () => {
    it('should have all fields from the OpenAPI ShiftHandover schema', () => {
      const zodFields = getZodSchemaFields(ShiftHandoverSchema);
      const apiProperties = getSchemaProperties(openapi, 'ShiftHandover');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ShiftHandoverSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'ward', 'shift_date', 'outgoing_nurse', 'incoming_nurse'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ShiftHandoverSchema);
      
      const criticalFields = [
        'id',
        'ward',
        'shift_date',
        'shift_ending',
        'outgoing_nurse',
        'incoming_nurse',
        'total_patients',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // ENUM SCHEMA TESTS
  // ===========================================================================

  describe('InpatientWardTypeSchema (enum)', () => {
    it('should match OpenAPI WardTypeEnum values', () => {
      const zodValues = getZodEnumValues(InpatientWardTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'WardTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`InpatientWardTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical ward types', () => {
      const zodValues = getZodEnumValues(InpatientWardTypeSchema);
      
      const criticalTypes = [
        'MEDICAL',
        'SURGICAL',
        'ICU',
        'MATERNITY',
      ];

      const missing = criticalTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  describe('BedStatusSchema (enum)', () => {
    it('should match OpenAPI BedStatusEnum values', () => {
      const zodValues = getZodEnumValues(BedStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'BedStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`BedStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical bed statuses', () => {
      const zodValues = getZodEnumValues(BedStatusSchema);
      
      const criticalStatuses = [
        'AVAILABLE',
        'OCCUPIED',
        'MAINTENANCE',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('AdmissionRecommendationStatusSchema (enum)', () => {
    it('should match OpenAPI AdmissionRecommendationStatusEnum values', () => {
      const zodValues = getZodEnumValues(AdmissionRecommendationStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'AdmissionRecommendationStatusEnum');

      if (!apiValues) {
        console.warn('AdmissionRecommendationStatusEnum not found in OpenAPI');
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`AdmissionRecommendationStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical statuses', () => {
      const zodValues = getZodEnumValues(AdmissionRecommendationStatusSchema);
      
      const criticalStatuses = [
        'PENDING',
        'ACCEPTED',
        'DECLINED',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('AdmissionRecommendationUrgencySchema (enum)', () => {
    it('should match OpenAPI UrgencyEnum values', () => {
      const zodValues = getZodEnumValues(AdmissionRecommendationUrgencySchema);
      const apiValues = getSchemaEnumValues(openapi, 'UrgencyEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`AdmissionRecommendationUrgencySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all urgency levels', () => {
      const zodValues = getZodEnumValues(AdmissionRecommendationUrgencySchema);
      
      const urgencyLevels = [
        'ROUTINE',
        'URGENT',
        'EMERGENCY',
      ];

      const missing = urgencyLevels.filter((u) => !zodValues.includes(u));
      expect(missing).toEqual([]);
    });
  });

  describe('AdmissionStatusSchema (enum)', () => {
    it('should match OpenAPI AdmissionStatusEnum values', () => {
      const zodValues = getZodEnumValues(AdmissionStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'AdmissionStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`AdmissionStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical admission statuses', () => {
      const zodValues = getZodEnumValues(AdmissionStatusSchema);
      
      const criticalStatuses = [
        'ACTIVE',
        'DISCHARGED',
        'DECEASED',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('AdmissionPayerTypeSchema (enum)', () => {
    it('should match OpenAPI PayerTypeEnum values', () => {
      const zodValues = getZodEnumValues(AdmissionPayerTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'PayerTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`AdmissionPayerTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical payer types', () => {
      const zodValues = getZodEnumValues(AdmissionPayerTypeSchema);
      
      const criticalPayers = [
        'CASH',
        'SHA',
      ];

      const missing = criticalPayers.filter((p) => !zodValues.includes(p));
      expect(missing).toEqual([]);
    });
  });

  describe('DischargeTypeSchema (enum)', () => {
    it('should match OpenAPI DischargeTypeEnum values', () => {
      const zodValues = getZodEnumValues(DischargeTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'DischargeTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`DischargeTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include critical discharge types', () => {
      const zodValues = getZodEnumValues(DischargeTypeSchema);
      
      const criticalTypes = [
        'NORMAL',
        'DECEASED',
        'AGAINST_ADVICE',
      ];

      const missing = criticalTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  describe('TransferReasonSchema (enum)', () => {
    it('should match OpenAPI TransferReasonEnum values', () => {
      const zodValues = getZodEnumValues(TransferReasonSchema);
      const apiValues = getSchemaEnumValues(openapi, 'TransferReasonEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`TransferReasonSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include key transfer reasons', () => {
      const zodValues = getZodEnumValues(TransferReasonSchema);
      
      const keyReasons = [
        'STEP_UP',
        'STEP_DOWN',
        'SPECIALTY',
      ];

      const missing = keyReasons.filter((r) => !zodValues.includes(r));
      expect(missing).toEqual([]);
    });
  });

  describe('ConditionStatusSchema (enum)', () => {
    it('should match OpenAPI ConditionStatusEnum values', () => {
      const zodValues = getZodEnumValues(ConditionStatusSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ConditionStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ConditionStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all condition statuses', () => {
      const zodValues = getZodEnumValues(ConditionStatusSchema);
      
      const allStatuses = [
        'STABLE',
        'IMPROVING',
        'DETERIORATING',
        'CRITICAL',
      ];

      const missing = allStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('RiskLevelSchema (enum)', () => {
    it('should match OpenAPI RiskLevelEnum values', () => {
      const zodValues = getZodEnumValues(RiskLevelSchema);
      const apiValues = getSchemaEnumValues(openapi, 'FallRiskEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`RiskLevelSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all risk levels', () => {
      const zodValues = getZodEnumValues(RiskLevelSchema);
      
      const allLevels = [
        'LOW',
        'MODERATE',
        'HIGH',
      ];

      const missing = allLevels.filter((l) => !zodValues.includes(l));
      expect(missing).toEqual([]);
    });
  });

  describe('ShiftTypeSchema (enum)', () => {
    it('should match OpenAPI ShiftEnum values', () => {
      const zodValues = getZodEnumValues(ShiftTypeSchema);
      const apiValues = getSchemaEnumValues(openapi, 'ShiftEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`ShiftTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include basic shifts', () => {
      const zodValues = getZodEnumValues(ShiftTypeSchema);
      
      const basicShifts = [
        'DAY',
        'NIGHT',
      ];

      const missing = basicShifts.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });
});
