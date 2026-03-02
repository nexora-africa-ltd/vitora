/**
 * CDS (Clinical Decision Support) Zod Schemas
 *
 * Runtime validation schemas for CDS API responses.
 */

import { z } from 'zod';

// ──────────────────────────── Rule Schemas ────────────────────────────

export const CDSRuleListItemSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  priority: z.string(),
  evidence_level: z.string(),
  status: z.string(),
  action_type: z.string(),
  is_active: z.boolean(),
  trigger_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedCDSRuleSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CDSRuleListItemSchema),
});

export const CDSRuleDetailSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  priority: z.string(),
  evidence_level: z.string(),
  status: z.string(),
  condition: z.record(z.unknown()),
  action_type: z.string(),
  action_message: z.string(),
  suggestion: z.string(),
  references: z.array(z.string()),
  metadata: z.record(z.unknown()),
  is_active: z.boolean(),
  trigger_count: z.number(),
  override_rate: z.number().nullable(),
  created_by: z.number().nullable(),
  created_by_name: z.string(),
  approved_by: z.number().nullable(),
  approved_by_name: z.string(),
  approved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ──────────────────────────── Alert Schemas ────────────────────────────

export const CDSAlertListItemSchema = z.object({
  id: z.number(),
  rule: z.number(),
  rule_code: z.string(),
  rule_name: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  priority: z.string(),
  status: z.string(),
  message: z.string(),
  category: z.string(),
  is_pending: z.boolean(),
  is_critical: z.boolean(),
  created_at: z.string(),
});

export const PaginatedCDSAlertSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CDSAlertListItemSchema),
});

export const CDSAlertDetailSchema = z.object({
  id: z.number(),
  rule: z.number(),
  rule_code: z.string(),
  rule_name: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  priority: z.string(),
  status: z.string(),
  message: z.string(),
  suggestion: z.string(),
  details: z.record(z.unknown()),
  category: z.string(),
  evidence_level: z.string(),
  action_type: z.string(),
  override_reason: z.string(),
  is_pending: z.boolean(),
  is_resolved: z.boolean(),
  is_critical: z.boolean(),
  age_hours: z.number().nullable(),
  resolved_by: z.number().nullable(),
  resolved_by_name: z.string(),
  resolved_at: z.string().nullable(),
  triggered_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ──────────────────────────── Dashboard Schema ────────────────────────────

export const CDSDashboardSchema = z.object({
  total_rules: z.number(),
  active_rules: z.number(),
  draft_rules: z.number(),
  total_alerts: z.number(),
  pending_alerts: z.number(),
  critical_pending: z.number(),
  alerts_today: z.number(),
  override_rate: z.number().nullable(),
  alerts_by_category: z.array(z.object({ rule__category: z.string(), count: z.number() })),
  alerts_by_priority: z.array(z.object({ priority: z.string(), count: z.number() })),
});

// ──────────────────────────── Evaluation Schemas ────────────────────────────

export const CDSEvaluationResultSchema = z.object({
  rule_code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()),
});

export const CDSRuleEvaluateResponseSchema = z.object({
  rule: CDSRuleDetailSchema,
  triggered: z.boolean(),
  results: z.array(CDSEvaluationResultSchema),
});

export const CDSEncounterEvaluateResponseSchema = z.object({
  encounter_id: z.number(),
  rules_evaluated: z.number(),
  rules_triggered: z.number(),
  alerts_created: z.number(),
  results: z.array(CDSEvaluationResultSchema),
});
