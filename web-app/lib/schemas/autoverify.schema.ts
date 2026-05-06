/**
 * Zod schemas for Auto-Verification & Delta Check API responses.
 * Phase L2: Delta Checks & Auto-Verification
 */

import { z } from 'zod';

// Helper: coerce string decimals from Django to numbers, preserving null
const coerceDecimal = z.preprocess(
  (val) => (val === null || val === undefined ? null : Number(val)),
  z.number().nullable()
);

// =============================================================================
// Enums
// =============================================================================

export const DeltaCheckTypeSchema = z.enum(['PERCENT', 'ABSOLUTE', 'BOTH']);
export const DeltaCheckActionSchema = z.enum(['FLAG_FOR_REVIEW', 'BLOCK_RELEASE', 'ALERT_ONLY']);
export const DeltaCheckOutcomeSchema = z.enum(['PASS', 'FAIL', 'NO_PRIOR', 'SKIPPED']);

export const AutoVerifyConditionTypeSchema = z.enum([
  'IN_REFERENCE_RANGE',
  'DELTA_CHECK_PASS',
  'QC_IN_CONTROL',
  'NO_CRITICAL_FLAG',
  'SPECIMEN_AGE_OK',
  'NUMERIC_RESULT',
  'NOT_AMENDED',
]);

export const AutoVerifyOutcomeSchema = z.enum(['AUTO_VERIFIED', 'BLOCKED', 'SKIPPED', 'CAP_EXCEEDED']);

// =============================================================================
// Delta Check Rule
// =============================================================================

export const DeltaCheckRuleSchema = z.object({
  id: z.number(),
  test: z.number(),
  test_name: z.string(),
  test_code: z.string(),
  check_type: DeltaCheckTypeSchema,
  threshold_percent: coerceDecimal,
  threshold_absolute: coerceDecimal,
  lookback_hours: z.number(),
  action: DeltaCheckActionSchema,
  is_active: z.boolean(),
  description: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedDeltaCheckRuleSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DeltaCheckRuleSchema),
});

// =============================================================================
// Delta Check Result
// =============================================================================

export const DeltaCheckResultSchema = z.object({
  id: z.number(),
  result: z.number(),
  rule: z.number(),
  patient_name: z.string(),
  test_name: z.string(),
  outcome: DeltaCheckOutcomeSchema,
  previous_value: coerceDecimal,
  current_value: coerceDecimal,
  delta_percent: coerceDecimal,
  delta_absolute: coerceDecimal,
  action_taken: DeltaCheckActionSchema,
  reviewed_by: z.number().nullable(),
  reviewed_at: z.string().nullable(),
  evaluated_at: z.string(),
});

export const PaginatedDeltaCheckResultSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DeltaCheckResultSchema),
});

// =============================================================================
// Auto-Verify Rule
// =============================================================================

export const AutoVerifyRuleSchema = z.object({
  id: z.number(),
  test: z.number(),
  test_name: z.string(),
  test_code: z.string(),
  condition_type: AutoVerifyConditionTypeSchema,
  is_active: z.boolean(),
  priority: z.number(),
  parameters: z.record(z.unknown()).nullable(),
  description: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedAutoVerifyRuleSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(AutoVerifyRuleSchema),
});

// =============================================================================
// Auto-Verify Config
// =============================================================================

export const AutoVerifyConfigSchema = z.object({
  id: z.number(),
  is_enabled: z.boolean(),
  max_auto_verify_percent: z.number(),
  max_specimen_age_hours: z.number(),
  excluded_priorities: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// Auto-Verify Log
// =============================================================================

export const RuleEvaluationSchema = z.object({
  rule_id: z.number(),
  condition_type: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});

export const AutoVerifyLogSchema = z.object({
  id: z.number(),
  result: z.number(),
  patient_name: z.string(),
  test_name: z.string(),
  outcome: AutoVerifyOutcomeSchema,
  rules_evaluated: z.array(RuleEvaluationSchema),
  blocking_rule_id: z.number().nullable(),
  blocking_rule_condition: z.string().nullable(),
  auto_verified_by_system: z.boolean(),
  evaluated_at: z.string(),
});

export const PaginatedAutoVerifyLogSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(AutoVerifyLogSchema),
});

// =============================================================================
// Stats
// =============================================================================

export const AutoVerifyStatsSchema = z.object({
  total_evaluated: z.number(),
  auto_verified: z.number(),
  blocked: z.number(),
  skipped: z.number(),
  cap_exceeded: z.number(),
  auto_verify_rate: z.number(),
  delta_checks_total: z.number(),
  delta_checks_failed: z.number(),
});
