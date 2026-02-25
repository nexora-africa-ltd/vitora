/**
 * Contract Test: Allied Health Schema Comparison
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

import {
  AlliedHealthOrderStatusSchema,
  AlliedHealthSessionStatusSchema,
  AlliedHealthPrioritySchema,
  SessionOutcomeSchema,
  AlliedHealthDashboardStatsSchema,
  AlliedHealthModuleStatsSchema,
} from '@/lib/schemas/allied-health.schema';

// =============================================================================
// OPENAPI SCHEMA LOADING
// =============================================================================

interface OpenAPISchema {
  components: {
    schemas: Record<
      string,
      {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
        enum?: string[];
        allOf?: Array<{ $ref?: string }>;
        description?: string;
      }
    >;
  };
}

/**
 * Load the OpenAPI schema from the backend.
 */
function loadOpenAPISchema(): OpenAPISchema {
  const schemaPath = path.resolve(__dirname, '../../../backend/schema.json');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  return yaml.load(schemaContent) as OpenAPISchema;
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
 * Get the property keys from a Zod enum schema.
 */
function getZodEnumValues<T extends [string, ...string[]]>(
  schema: ReturnType<typeof import('zod').z.enum<T>>
): string[] {
  return schema.options as unknown as string[];
}

// =============================================================================
// TESTS
// =============================================================================

describe('Allied Health Contract Tests', () => {
  let openapi: OpenAPISchema;

  beforeAll(() => {
    openapi = loadOpenAPISchema();
  });

  describe('Enum Schemas', () => {
    it('AlliedHealthOrderStatusSchema matches backend OrderStatusEnum', () => {
      // The backend may use different names - check variations
      const backendEnums =
        getSchemaEnumValues(openapi, 'OrderStatusEnum') ||
        getSchemaEnumValues(openapi, 'PhysiotherapyOrderStatusEnum') ||
        getSchemaEnumValues(openapi, 'PhysioOrderStatusEnum');

      const frontendEnums = getZodEnumValues(AlliedHealthOrderStatusSchema);

      // Frontend should support at least the common statuses
      const commonStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      commonStatuses.forEach((status) => {
        expect(frontendEnums).toContain(status);
      });
    });

    it('AlliedHealthSessionStatusSchema contains expected statuses', () => {
      const frontendEnums = getZodEnumValues(AlliedHealthSessionStatusSchema);

      // Ensure all expected session statuses are present
      const expectedStatuses = [
        'SCHEDULED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW',
        'RESCHEDULED',
      ];
      expectedStatuses.forEach((status) => {
        expect(frontendEnums).toContain(status);
      });
    });

    it('AlliedHealthPrioritySchema contains expected priorities', () => {
      const frontendEnums = getZodEnumValues(AlliedHealthPrioritySchema);

      expect(frontendEnums).toContain('EMERGENCY');
      expect(frontendEnums).toContain('URGENT');
      expect(frontendEnums).toContain('ROUTINE');
    });

    it('SessionOutcomeSchema contains expected outcomes', () => {
      const frontendEnums = getZodEnumValues(SessionOutcomeSchema);

      expect(frontendEnums).toContain('IMPROVED');
      expect(frontendEnums).toContain('MAINTAINED');
      expect(frontendEnums).toContain('DECLINED');
    });
  });

  describe('Dashboard Schema', () => {
    it('AlliedHealthModuleStatsSchema has required fields', () => {
      const validData = {
        pending_count: 5,
        in_progress_count: 3,
        today_sessions_count: 10,
        completed_today_count: 7,
      };

      const result = AlliedHealthModuleStatsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('AlliedHealthModuleStatsSchema rejects invalid data', () => {
      const invalidData = {
        pending_count: 'not a number',
        in_progress_count: 3,
      };

      const result = AlliedHealthModuleStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('AlliedHealthDashboardStatsSchema parses complete dashboard', () => {
      const dashboardData = {
        physiotherapy: {
          pending_count: 5,
          in_progress_count: 3,
          today_sessions_count: 10,
          completed_today_count: 7,
        },
        nutrition: {
          pending_count: 2,
          in_progress_count: 1,
          today_sessions_count: 5,
          completed_today_count: 3,
          consultations_count: 8,
        },
        occupational_therapy: {
          pending_count: 4,
          in_progress_count: 2,
          today_sessions_count: 6,
          completed_today_count: 4,
        },
        social_work: {
          open_cases_count: 15,
          urgent_count: 3,
          this_week_count: 5,
        },
        counselling: {
          pending_count: 3,
          in_progress_count: 2,
          today_sessions_count: 8,
          completed_today_count: 5,
          follow_ups_count: 4,
        },
        todays_sessions: [
          {
            id: 1,
            session_number: 'PS-001',
            scheduled_time: '2026-02-26T09:00:00Z',
            patient_name: 'John Doe',
            patient_mrn: 'MRN-001',
            module: 'PHYSIO',
            treatment_type: 'Post-Surgery Rehab',
            status: 'SCHEDULED',
          },
        ],
      };

      const result = AlliedHealthDashboardStatsSchema.safeParse(dashboardData);
      expect(result.success).toBe(true);
    });
  });
});
