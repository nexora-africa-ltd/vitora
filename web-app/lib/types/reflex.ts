/**
 * Reflexive Testing type definitions.
 * Phase L6.1: Reflexive Testing Engine
 */

// =============================================================================
// Enums
// =============================================================================

export type ReflexOperator =
  | 'GT' | 'LT' | 'GTE' | 'LTE' | 'EQ' | 'NEQ'
  | 'IN_RANGE' | 'OUT_OF_RANGE' | 'CONTAINS'
  | 'CRITICAL' | 'ABNORMAL';

export type ReflexAction = 'AUTO_ORDER' | 'SUGGEST';

export type ReflexExecutionStatus =
  | 'TRIGGERED' | 'ORDERED' | 'SUGGESTED'
  | 'APPROVED' | 'REJECTED' | 'CANCELLED';

// =============================================================================
// Reflex Rule
// =============================================================================

export interface ReflexRule {
  id: number;
  name?: string;
  trigger_test: number;
  trigger_test_name: string;
  trigger_test_code: string;
  operator: ReflexOperator;
  threshold_value: number | null;
  threshold_high: number | null;
  threshold_text?: string;
  text_value?: string;
  reflex_test: number;
  reflex_test_name: string;
  reflex_test_code: string;
  action: ReflexAction;
  priority: string;
  is_active: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ReflexRuleCreateData {
  trigger_test: number;
  reflex_test: number;
  operator: ReflexOperator;
  threshold_value?: number | null;
  threshold_high?: number | null;
  text_value?: string;
  action: ReflexAction;
  priority?: string;
  description?: string;
  is_active?: boolean;
}

// =============================================================================
// Reflex Execution
// =============================================================================

export interface ReflexExecution {
  id: number;
  rule: number;
  rule_name: string;
  trigger_result: number;
  trigger_test_name: string;
  trigger_value: string;
  reflex_test_name: string;
  reflex_order: number | null;
  status: ReflexExecutionStatus;
  action: ReflexAction;
  approved_by: number | null;
  approved_by_name: string;
  approved_at: string | null;
  rejected_reason: string;
  created_at: string;
  updated_at: string;
}

export interface ReflexActionData {
  reason?: string;
}
