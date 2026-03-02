/**
 * CDS (Clinical Decision Support) TypeScript Types
 *
 * Types for CDS rules, alerts, and dashboard statistics.
 */

// ──────────────────────────── Enums / Unions ────────────────────────────

export type CDSRuleCategory =
  | 'DRUG_ALLERGY'
  | 'DRUG_DRUG'
  | 'CRITICAL_LAB'
  | 'VITAL_SIGN'
  | 'GUIDELINE'
  | 'PREVENTIVE'
  | 'DOSAGE';

export type CDSRulePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type CDSEvidenceLevel = 'A' | 'B' | 'C' | 'D';

export type CDSRuleStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'RETIRED';

export type CDSAlertStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'ACCEPTED'
  | 'OVERRIDDEN'
  | 'DISMISSED'
  | 'AUTO_RESOLVED';

export type CDSActionType =
  | 'ALERT'
  | 'CONTRAINDICATE'
  | 'WARN'
  | 'SUGGEST'
  | 'REQUIRE'
  | 'INFORM';

// ──────────────────────────── Rule Types ────────────────────────────

export interface CDSRuleListItem {
  id: number;
  code: string;
  name: string;
  category: string;
  priority: string;
  evidence_level: string;
  status: string;
  action_type: string;
  is_active: boolean;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface CDSRuleDetail extends CDSRuleListItem {
  description: string;
  condition: Record<string, unknown>;
  action_message: string;
  suggestion: string;
  references: string[];
  metadata: Record<string, unknown>;
  override_rate: number | null;
  created_by: number | null;
  created_by_name: string;
  approved_by: number | null;
  approved_by_name: string;
  approved_at: string | null;
}

export interface CDSRuleCreateData {
  code: string;
  name: string;
  description?: string;
  category: string;
  priority: string;
  evidence_level?: string;
  condition: Record<string, unknown>;
  action_type: string;
  action_message: string;
  suggestion?: string;
  references?: string[];
  metadata?: Record<string, unknown>;
}

// ──────────────────────────── Alert Types ────────────────────────────

export interface CDSAlertListItem {
  id: number;
  rule: number;
  rule_code: string;
  rule_name: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  priority: string;
  status: string;
  message: string;
  suggestion: string;
  category: string;
  is_pending: boolean;
  is_critical: boolean;
  created_at: string;
}

export interface CDSAlertDetail extends CDSAlertListItem {
  suggestion: string;
  details: Record<string, unknown>;
  evidence_level: string;
  action_type: string;
  override_reason: string;
  is_resolved: boolean;
  age_hours: number | null;
  resolved_by: number | null;
  resolved_by_name: string;
  resolved_at: string | null;
  triggered_by: number | null;
  updated_at: string;
}

// ──────────────────────────── Dashboard ────────────────────────────

export interface CDSDashboard {
  total_rules: number;
  active_rules: number;
  draft_rules: number;
  total_alerts: number;
  pending_alerts: number;
  critical_pending: number;
  alerts_today: number;
  override_rate: number | null;
  alerts_by_category: Array<{ rule__category: string; count: number }>;
  alerts_by_priority: Array<{ priority: string; count: number }>;
}

// ──────────────────────────── Evaluation ────────────────────────────

export interface CDSEvaluationResult {
  rule_code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface CDSRuleEvaluateResponse {
  rule: CDSRuleDetail;
  triggered: boolean;
  results: CDSEvaluationResult[];
}

export interface CDSEncounterEvaluateResponse {
  encounter_id: number;
  rules_evaluated: number;
  rules_triggered: number;
  alerts_created: number;
  results: CDSEvaluationResult[];
}

// ──────────────────────────── List Params ────────────────────────────

export interface CDSRuleListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  priority?: string;
  status?: string;
  ordering?: string;
}

export interface CDSAlertListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  priority?: string;
  patient?: number;
  encounter?: number;
  rule?: number;
  category?: string;
  ordering?: string;
}
