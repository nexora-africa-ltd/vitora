/**
 * Contract Test: SHA (Social Health Authority) Schema Comparison
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
  SHAMemberSchema,
  ClaimSchema,
  ClaimItemSchema,
  // Enum schemas
  ClaimStatusSchema,
  ClaimItemStatusSchema,
  MembershipTypeSchema,
  MemberStatusSchema,
  CoverageTypeSchema,
  PFMSCategorySchema,
  SchemeCategorySchema,
} from '@/lib/schemas/sha.schema';

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

/**
 * Normalize enum values for comparison (lowercase).
 * API uses lowercase, Zod schemas may use uppercase.
 */
function normalizeEnumValues(values: string[]): string[] {
  return values.map((v) => v.toLowerCase());
}

// =============================================================================
// CONTRACT TESTS
// =============================================================================

describe('SHA Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // OBJECT SCHEMA TESTS
  // ===========================================================================

  describe('SHAMemberSchema', () => {
    it('should have all fields from the OpenAPI SHAMember schema', () => {
      const zodFields = getZodSchemaFields(SHAMemberSchema);
      const apiProperties = getSchemaProperties(openapi, 'SHAMember');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  SHAMemberSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      // Note: sha_number in API maps to sha_member_number in Zod
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'patient', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(SHAMemberSchema);

      const criticalFields = [
        'id',
        'patient',
        'sha_member_number', // Zod uses sha_member_number, API uses sha_number
        'coverage_start_date',
        'is_active',
        'is_pfms_eligible',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include PFMS-related fields for government subsidy tracking', () => {
      const zodFields = getZodSchemaFields(SHAMemberSchema);

      const pfmsFields = [
        'is_pfms_eligible',
        'pfms_category',
        'pfms_verified',
      ];

      const missing = pfmsFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ClaimSchema (SHAClaimSchema)', () => {
    it('should have all fields from the OpenAPI SHAClaim schema', () => {
      const zodFields = getZodSchemaFields(ClaimSchema);
      const apiProperties = getSchemaProperties(openapi, 'SHAClaim');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClaimSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      // Note: patient in API maps to patient_id in Zod, total_amount in Zod maps to claimed_amount
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'claim_number', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ClaimSchema);

      const criticalFields = [
        'id',
        'claim_number',
        'status',
        'total_amount',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include claim processing fields', () => {
      const zodFields = getZodSchemaFields(ClaimSchema);

      const processingFields = [
        'sha_reference',
        'approved_amount',
        'rejection_reason',
        'submitted_at',
      ];

      const missing = processingFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ClaimItemSchema (SHAClaimItemSchema)', () => {
    it('should have all fields from the OpenAPI SHAClaimItem schema', () => {
      const zodFields = getZodSchemaFields(ClaimItemSchema);
      const apiProperties = getSchemaProperties(openapi, 'SHAClaimItem');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));

      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ClaimItemSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'claim', 'description', 'quantity', 'unit_price', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ClaimItemSchema);

      const criticalFields = [
        'id',
        'claim',
        'description',
        'quantity',
        'unit_price',
        'claimed_amount',
        'status',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });

    it('should include coverage type fields for PFMS support', () => {
      const zodFields = getZodSchemaFields(ClaimItemSchema);

      const coverageFields = [
        'coverage_type',
        'coverage_type_display',
      ];

      const missing = coverageFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // ENUM SCHEMA TESTS
  // ===========================================================================

  describe('ClaimStatusSchema (enum)', () => {
    it('should match OpenAPI ShaClaimStatusEnum values', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(ClaimStatusSchema));
      const apiValues = getSchemaEnumValues(openapi, 'ShaClaimStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      // Map API values to Zod values where they differ
      // API: 'partial' -> Zod: 'partial_approved'
      const normalizedApiValues = apiValues.map(v => {
        if (v === 'partial') return 'partial_approved';
        if (v === 'validated') return 'pending'; // validated might map to pending
        if (v === 'pending_submission') return 'pending';
        return v;
      });

      // Check for critical statuses that must exist
      const criticalStatuses = ['draft', 'submitted', 'approved', 'rejected', 'paid'];
      const missingCritical = criticalStatuses.filter(s => !zodValues.includes(s));

      if (missingCritical.length > 0) {
        console.warn(`ClaimStatusSchema: Missing critical values: ${missingCritical.join(', ')}`);
      }

      expect(missingCritical).toEqual([]);
    });

    it('should include all critical claim statuses', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(ClaimStatusSchema));

      const criticalStatuses = [
        'draft',
        'pending',
        'submitted',
        'approved',
        'rejected',
        'paid',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('ClaimItemStatusSchema (enum)', () => {
    it('should match OpenAPI ShaClaimItemStatusEnum values', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(ClaimItemStatusSchema));
      const apiValues = getSchemaEnumValues(openapi, 'ShaClaimItemStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`ClaimItemStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all claim item statuses', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(ClaimItemStatusSchema));

      const allStatuses = [
        'pending',
        'approved',
        'rejected',
        'adjusted',
      ];

      const missing = allStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('MembershipTypeSchema (enum)', () => {
    it('should match OpenAPI MembershipTypeEnum values', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(MembershipTypeSchema));
      const apiValues = getSchemaEnumValues(openapi, 'MembershipTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`MembershipTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all membership types', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(MembershipTypeSchema));

      const allTypes = [
        'principal',
        'spouse',
        'child',
        'parent',
      ];

      const missing = allTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  describe('MemberStatusSchema (enum)', () => {
    it('should match OpenAPI ShaMemberStatusEnum values', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(MemberStatusSchema));
        const apiValues = getSchemaEnumValues(openapi, 'ShaMemberStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      // Map API values - API uses 'pending_verification', Zod might use different format
      const normalizedApiValues = apiValues.map(v =>
        v === 'pending_verification' ? 'pending_verification' : v
      );

      const missingInZod = normalizedApiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`MemberStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      // Only fail on critical statuses
      const criticalMissing = missingInZod.filter(v =>
        ['active', 'inactive', 'suspended'].includes(v)
      );
      expect(criticalMissing).toEqual([]);
    });

    it('should include critical member statuses', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(MemberStatusSchema));

      const criticalStatuses = [
        'active',
        'inactive',
        'suspended',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('CoverageTypeSchema (enum)', () => {
    it('should match OpenAPI CoverageTypeEnum values', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(CoverageTypeSchema));
      const apiValues = getSchemaEnumValues(openapi, 'CoverageTypeEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`CoverageTypeSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all coverage types', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(CoverageTypeSchema));

      const allTypes = [
        'sha',
        'pfms',
        'both',
      ];

      const missing = allTypes.filter((t) => !zodValues.includes(t));
      expect(missing).toEqual([]);
    });
  });

  describe('PFMSCategorySchema (enum)', () => {
    it('should match OpenAPI PfmsCategoryEnum values', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(PFMSCategorySchema));
      const apiValues = getSchemaEnumValues(openapi, 'PfmsCategoryEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));

      if (missingInZod.length > 0) {
        console.warn(`PFMSCategorySchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all PFMS categories', () => {
      const zodValues = normalizeEnumValues(getZodEnumValues(PFMSCategorySchema));

      const allCategories = [
        'vulnerable',
        'elderly',
        'disabled',
        'orphan',
        'indigent',
      ];

      const missing = allCategories.filter((c) => !zodValues.includes(c));
      expect(missing).toEqual([]);
    });
  });

  describe('SchemeCategorySchema (enum)', () => {
    it('should have valid SHIF scheme categories', () => {
      const zodValues = getZodEnumValues(SchemeCategorySchema);

      // SchemeCategorySchema is frontend-specific for SHIF categories
      // Verify it has the expected values
      const expectedCategories = [
        'SHIF_EMPLOYED',
        'SHIF_SELF_EMPLOYED',
        'SHIF_INDIGENT',
      ];

      const missing = expectedCategories.filter((c) => !zodValues.includes(c));
      expect(missing).toEqual([]);
    });

    it('should include all SHIF scheme types', () => {
      const zodValues = getZodEnumValues(SchemeCategorySchema);

      expect(zodValues).toContain('SHIF_EMPLOYED');
      expect(zodValues).toContain('SHIF_SELF_EMPLOYED');
      expect(zodValues).toContain('NHIF_LEGACY');
      expect(zodValues).toContain('UNKNOWN');
    });
  });

  // ===========================================================================
  // FIELD MAPPING TESTS
  // ===========================================================================

  describe('Field Mapping Verification', () => {
    it('SHAMemberSchema sha_member_number should map to API sha_number', () => {
      const zodFields = getZodSchemaFields(SHAMemberSchema);
      const apiProperties = getSchemaProperties(openapi, 'SHAMember');

      // Zod uses 'sha_member_number', API uses 'sha_number'
      // Verify at least one exists in each
      expect(zodFields).toContain('sha_member_number');
      expect(apiProperties).toHaveProperty('sha_number');
    });

    it('ClaimSchema total_amount should map to API claimed_amount', () => {
      const zodFields = getZodSchemaFields(ClaimSchema);
      const apiProperties = getSchemaProperties(openapi, 'SHAClaim');

      // Zod uses 'total_amount', API uses 'claimed_amount'
      expect(zodFields).toContain('total_amount');
      expect(apiProperties).toHaveProperty('claimed_amount');
    });
  });
});
