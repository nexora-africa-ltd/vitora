/**
 * Zod schemas for Reflexive Testing API responses.
 * Phase L6.1
 */

import { z } from 'zod';

const coerceDecimal = z.preprocess(
  (val) => (val === null || val === undefined ? null : Number(val)),
  z.number().nullable()
);

// =============================================================================
// Enums
// =============================================================================

export const ReflexOperatorSchema = z.enum([
  'GT', 'LT', 'GTE', 'LTE', 'EQ', 'NEQ',
  'IN_RANGE', 'OUT_OF_RANGE', 'CONTAINS',
  'CRITICAL', 'ABNORMAL',
]);

export const ReflexActionSchema = z.enum(['AUTO_ORDER', 'SUGGEST']);

export const ReflexExecutionStatusSchema = z.enum([
  'TRIGGERED', 'ORDERED', 'SUGGESTED',
  'APPROVED', 'REJECTED', 'CANCELLED',
]);

// =============================================================================
// Reflex Rule
// =============================================================================

export const ReflexRuleSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  trigger_test: z.number(),
  trigger_test_name: z.string(),
  trigger_test_code: z.string(),
  operator: ReflexOperatorSchema,
  threshold_value: coerceDecimal,
  threshold_high: coerceDecimal,
  threshold_text: z.string().optional(),
  text_value: z.string().optional(),
  reflex_test: z.number(),
  reflex_test_name: z.string(),
  reflex_test_code: z.string(),
  action: ReflexActionSchema,
  priority: z.string(),
  is_active: z.boolean(),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedReflexRuleSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ReflexRuleSchema),
});

// =============================================================================
// Reflex Execution
// =============================================================================

export const ReflexExecutionSchema = z.object({
  id: z.number(),
  rule: z.number(),
  rule_name: z.string(),
  trigger_result: z.number(),
  trigger_test_name: z.string(),
  trigger_value: z.string(),
  reflex_test_name: z.string(),
  reflex_order: z.number().nullable(),
  status: ReflexExecutionStatusSchema,
  action: ReflexActionSchema,
  approved_by: z.number().nullable(),
  approved_by_name: z.string(),
  approved_at: z.string().nullable(),
  rejected_reason: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedReflexExecutionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ReflexExecutionSchema),
});
