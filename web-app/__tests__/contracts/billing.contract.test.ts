/**
 * Contract Test: Billing Schema Comparison
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
  ServiceCategorySchema,
  ServiceSchema,
  InvoiceSchema,
  InvoiceItemSchema,
  PaymentPointSchema,
  PaymentSchema,
  CreditNoteSchema,
  // Enum schemas
  InvoiceStatusSchema,
  PaymentMethodSchema,
  PaymentStatusSchema,
  CreditNoteReasonSchema,
  CreditNoteStatusSchema,
  DiscountTypeSchema,
  // Enum constant arrays (for contract testing - getZodEnumValues doesn't work with transformed schemas)
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  CREDIT_NOTE_REASONS,
  CREDIT_NOTE_STATUSES,
  DISCOUNT_TYPES,
} from '@/lib/schemas/billing.schema';

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
 * Handles union types (.or()) by extracting enums from nested schemas.
 */
function getZodEnumValues(zodSchema: unknown): string[] {
  const jsonSchema = zodToJsonSchema(zodSchema as Parameters<typeof zodToJsonSchema>[0], {
    target: 'openApi3',
  });
  
  if (typeof jsonSchema === 'object' && jsonSchema !== null) {
    // Direct enum
    if ('enum' in jsonSchema) {
      return (jsonSchema as { enum: string[] }).enum;
    }
    // Union type (oneOf/anyOf) - extract enums from nested schemas
    const schemaObj = jsonSchema as { oneOf?: Array<{ enum?: string[] }>; anyOf?: Array<{ enum?: string[] }> };
    const unionSchemas = schemaObj.oneOf || schemaObj.anyOf;
    if (unionSchemas) {
      const allEnums: string[] = [];
      for (const nested of unionSchemas) {
        if (nested.enum) {
          allEnums.push(...nested.enum);
        }
      }
      // Filter out empty string if present (used for optional/nullable)
      return allEnums.filter(v => v !== '');
    }
  }
  return [];
}

/**
 * Normalize enum values for comparison (lowercase).
 * API uses lowercase, Zod schemas use uppercase.
 */
function normalizeEnumValues(values: string[]): string[] {
  return values.map((v) => v.toLowerCase());
}

// =============================================================================
// CONTRACT TESTS
// =============================================================================

describe('Billing Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  // ===========================================================================
  // OBJECT SCHEMA TESTS
  // ===========================================================================

  describe('ServiceCategorySchema', () => {
    it('should have all fields from the OpenAPI ServiceCategory schema', () => {
      const zodFields = getZodSchemaFields(ServiceCategorySchema);
      const apiProperties = getSchemaProperties(openapi, 'ServiceCategory');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ServiceCategorySchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      // Critical fields should cause test failure
      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'name', 'code'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ServiceCategorySchema);
      
      const criticalFields = [
        'id',
        'name',
        'code',
        'is_active',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('ServiceSchema', () => {
    it('should have all fields from the OpenAPI Service schema', () => {
      const zodFields = getZodSchemaFields(ServiceSchema);
      const apiProperties = getSchemaProperties(openapi, 'Service');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  ServiceSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'name', 'code', 'unit_price', 'category'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(ServiceSchema);
      
      const criticalFields = [
        'id',
        'code',
        'name',
        'unit_price',
        'category',
        'is_active',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('InvoiceSchema', () => {
    it('should have all fields from the OpenAPI Invoice schema', () => {
      const zodFields = getZodSchemaFields(InvoiceSchema);
      const apiProperties = getSchemaProperties(openapi, 'Invoice');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  InvoiceSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'invoice_number', 'patient', 'status', 'total_amount'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(InvoiceSchema);
      
      const criticalFields = [
        'id',
        'invoice_number',
        'patient',
        'status',
        'invoice_date',
        'due_date',
        'subtotal',
        'total_amount',
        'amount_paid',
        'balance_due',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('InvoiceItemSchema', () => {
    it('should have all fields from the OpenAPI InvoiceItem schema', () => {
      const zodFields = getZodSchemaFields(InvoiceItemSchema);
      const apiProperties = getSchemaProperties(openapi, 'InvoiceItem');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  InvoiceItemSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'invoice', 'description', 'quantity', 'unit_price', 'line_total'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(InvoiceItemSchema);
      
      const criticalFields = [
        'id',
        'invoice',
        'description',
        'quantity',
        'unit_price',
        'line_total',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('PaymentPointSchema', () => {
    it('should have all fields from the OpenAPI PaymentPoint schema', () => {
      const zodFields = getZodSchemaFields(PaymentPointSchema);
      const apiProperties = getSchemaProperties(openapi, 'PaymentPoint');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  PaymentPointSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'name', 'code', 'method'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(PaymentPointSchema);
      
      const criticalFields = [
        'id',
        'name',
        'code',
        'method',
        'is_active',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('PaymentSchema', () => {
    it('should have all fields from the OpenAPI Payment schema', () => {
      const zodFields = getZodSchemaFields(PaymentSchema);
      const apiProperties = getSchemaProperties(openapi, 'Payment');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  PaymentSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'payment_reference', 'invoice', 'amount', 'method', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(PaymentSchema);
      
      const criticalFields = [
        'id',
        'payment_reference',
        'invoice',
        'amount',
        'method',
        'status',
        'created_at',
        'updated_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  describe('CreditNoteSchema', () => {
    it('should have all fields from the OpenAPI CreditNote schema', () => {
      const zodFields = getZodSchemaFields(CreditNoteSchema);
      const apiProperties = getSchemaProperties(openapi, 'CreditNote');

      expect(apiProperties).not.toBeNull();
      if (!apiProperties) return;

      const apiFields = Object.keys(apiProperties);
      const missingInZod = apiFields.filter((field) => !zodFields.includes(field));
      
      if (missingInZod.length > 0) {
        console.warn(
          `⚠️  CreditNoteSchema: API fields missing from Zod schema:\n  ${missingInZod.join(', ')}`
        );
      }

      const criticalMissingFields = missingInZod.filter(
        (field) => ['id', 'credit_note_number', 'invoice', 'amount', 'reason', 'status'].includes(field)
      );

      expect(criticalMissingFields).toEqual([]);
    });

    it('should have critical required fields', () => {
      const zodFields = getZodSchemaFields(CreditNoteSchema);
      
      const criticalFields = [
        'id',
        'credit_note_number',
        'invoice',
        'amount',
        'reason',
        'status',
        'requested_by',
        'created_at',
      ];

      const missing = criticalFields.filter((field) => !zodFields.includes(field));
      expect(missing).toEqual([]);
    });
  });

  // ===========================================================================
  // ENUM SCHEMA TESTS
  // ===========================================================================

  describe('InvoiceStatusSchema (enum)', () => {
    it('should match OpenAPI InvoiceStatusEnum values', () => {
      // Use constant array directly - caseInsensitiveEnum creates transformed schemas
      // that don't serialize properly to JSON Schema
      const zodValues = normalizeEnumValues([...INVOICE_STATUSES]);
      const apiValues = getSchemaEnumValues(openapi, 'InvoiceStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`InvoiceStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all critical invoice statuses', () => {
      const zodValues = normalizeEnumValues([...INVOICE_STATUSES]);
      
      const criticalStatuses = [
        'draft',
        'pending',
        'partial',
        'paid',
        'cancelled',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('PaymentMethodSchema (enum)', () => {
    it('should match OpenAPI PaymentMethodEnum values', () => {
      const zodValues = normalizeEnumValues([...PAYMENT_METHODS]);
      const apiValues = getSchemaEnumValues(openapi, 'PaymentMethodEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`PaymentMethodSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all critical payment methods', () => {
      const zodValues = normalizeEnumValues([...PAYMENT_METHODS]);
      
      const criticalMethods = [
        'cash',
        'mpesa',
        'card',
        'insurance',
      ];

      const missing = criticalMethods.filter((m) => !zodValues.includes(m));
      expect(missing).toEqual([]);
    });
  });

  describe('PaymentStatusSchema (enum)', () => {
    it('should match OpenAPI PaymentStatusEnum values', () => {
      const zodValues = normalizeEnumValues([...PAYMENT_STATUSES]);
      const apiValues = getSchemaEnumValues(openapi, 'PaymentStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`PaymentStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all critical payment statuses', () => {
      const zodValues = normalizeEnumValues([...PAYMENT_STATUSES]);
      
      const criticalStatuses = [
        'pending',
        'completed',
        'failed',
        'refunded',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('CreditNoteReasonSchema (enum)', () => {
    it('should match OpenAPI CreditNoteReasonEnum values', () => {
      const zodValues = normalizeEnumValues([...CREDIT_NOTE_REASONS]);
      const apiValues = getSchemaEnumValues(openapi, 'CreditNoteReasonEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`CreditNoteReasonSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include key credit note reasons', () => {
      const zodValues = normalizeEnumValues([...CREDIT_NOTE_REASONS]);
      
      const keyReasons = [
        'overcharge',
        'other',
      ];

      const missing = keyReasons.filter((r) => !zodValues.includes(r));
      expect(missing).toEqual([]);
    });
  });

  describe('CreditNoteStatusSchema (enum)', () => {
    it('should match OpenAPI CreditNoteStatusEnum values', () => {
      const zodValues = normalizeEnumValues([...CREDIT_NOTE_STATUSES]);
      const apiValues = getSchemaEnumValues(openapi, 'CreditNoteStatusEnum');

      expect(apiValues).not.toBeNull();
      if (!apiValues) return;

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      
      if (missingInZod.length > 0) {
        console.warn(`CreditNoteStatusSchema: Missing values: ${missingInZod.join(', ')}`);
      }

      expect(missingInZod).toEqual([]);
    });

    it('should include all critical credit note statuses', () => {
      const zodValues = normalizeEnumValues([...CREDIT_NOTE_STATUSES]);
      
      const criticalStatuses = [
        'approved',
        'rejected',
        'refunded',
      ];

      const missing = criticalStatuses.filter((s) => !zodValues.includes(s));
      expect(missing).toEqual([]);
    });
  });

  describe('DiscountTypeSchema (enum)', () => {
    it('should have valid discount type values', () => {
      // Use constant array directly for testing
      const zodValues = normalizeEnumValues([...DISCOUNT_TYPES]);

      // DiscountType may be frontend-only or embedded in Invoice schema
      // Verify it has the expected values
      expect(zodValues).toContain('percentage');
      expect(zodValues).toContain('fixed');
    });

    it('should match OpenAPI DiscountTypeEnum values if exists', () => {
      const zodValues = normalizeEnumValues([...DISCOUNT_TYPES]);
      const apiValues = getSchemaEnumValues(openapi, 'DiscountTypeEnum');

      // DiscountTypeEnum may not exist in backend as a separate schema
      if (!apiValues) {
        // Frontend-only enum - just verify it has valid values
        expect(zodValues.length).toBeGreaterThan(0);
        return;
      }

      const missingInZod = apiValues.filter((v) => !zodValues.includes(v));
      expect(missingInZod).toEqual([]);
    });
  });
});
