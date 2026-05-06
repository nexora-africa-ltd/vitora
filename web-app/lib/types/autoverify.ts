/**
 * Auto-Verification & Delta Check type definitions.
 * Phase L2: Delta Checks & Auto-Verification
 */

// =============================================================================
// Enums
// =============================================================================

export type DeltaCheckType = 'PERCENT' | 'ABSOLUTE' | 'BOTH';
export type DeltaCheckAction = 'FLAG_FOR_REVIEW' | 'BLOCK_RELEASE' | 'ALERT_ONLY';
export type DeltaCheckOutcome = 'PASS' | 'FAIL' | 'NO_PRIOR' | 'SKIPPED';

export type AutoVerifyConditionType =
  | 'IN_REFERENCE_RANGE'
  | 'DELTA_CHECK_PASS'
  | 'QC_IN_CONTROL'
  | 'NO_CRITICAL_FLAG'
  | 'SPECIMEN_AGE_OK'
  | 'NUMERIC_RESULT'
  | 'NOT_AMENDED';

export type AutoVerifyOutcome = 'AUTO_VERIFIED' | 'BLOCKED' | 'SKIPPED' | 'CAP_EXCEEDED';

// =============================================================================
// Delta Check Rule
// =============================================================================

export interface DeltaCheckRule {
  id: number;
  test: number;
  test_name: string;
  test_code: string;
  check_type: DeltaCheckType;
  threshold_percent: number | null;
  threshold_absolute: number | null;
  lookback_hours: number;
  action: DeltaCheckAction;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeltaCheckRuleCreateData {
  test: number;
  check_type: DeltaCheckType;
  threshold_percent?: number | null;
  threshold_absolute?: number | null;
  lookback_hours: number;
  action: DeltaCheckAction;
}

// =============================================================================
// Delta Check Result
// =============================================================================

export interface DeltaCheckResult {
  id: number;
  result: number;
  rule: number;
  patient_name: string;
  test_name: string;
  outcome: DeltaCheckOutcome;
  previous_value: number | null;
  current_value: number | null;
  delta_percent: number | null;
  delta_absolute: number | null;
  action_taken: DeltaCheckAction;
  reviewed_by: number | null;
  reviewed_at: string | null;
  evaluated_at: string;
}

// =============================================================================
// Auto-Verify Rule
// =============================================================================

export interface AutoVerifyRule {
  id: number;
  test: number;
  test_name: string;
  test_code: string;
  condition_type: AutoVerifyConditionType;
  is_active: boolean;
  priority: number;
  parameters: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AutoVerifyRuleCreateData {
  test: number;
  condition_type: AutoVerifyConditionType;
  is_active?: boolean;
  priority?: number;
  parameters?: Record<string, unknown> | null;
}

// =============================================================================
// Auto-Verify Config
// =============================================================================

export interface AutoVerifyConfig {
  id: number;
  is_enabled: boolean;
  max_auto_verify_percent: number;
  max_specimen_age_hours: number;
  excluded_priorities: string[];
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Auto-Verify Log
// =============================================================================

export interface AutoVerifyLog {
  id: number;
  result: number;
  patient_name: string;
  test_name: string;
  outcome: AutoVerifyOutcome;
  rules_evaluated: RuleEvaluation[];
  blocking_rule_id: number | null;
  blocking_rule_condition: string | null;
  auto_verified_by_system: boolean;
  evaluated_at: string;
}

export interface RuleEvaluation {
  rule_id: number;
  condition_type: string;
  passed: boolean;
  detail: string;
}

// =============================================================================
// Stats
// =============================================================================

export interface AutoVerifyStats {
  total_evaluated: number;
  auto_verified: number;
  blocked: number;
  skipped: number;
  cap_exceeded: number;
  auto_verify_rate: number;
  delta_checks_total: number;
  delta_checks_failed: number;
}
