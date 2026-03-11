import { z } from 'zod';

// ──────────────────── CDS Alert Schemas ────────────────────

export const CDSSuggestedActionSchema = z.object({
  action_type: z.string(),
  target_field: z.string(),
  value: z.unknown().optional(),
  confidence: z.number(),
  reason: z.string(),
});

export const CDSAlertSchema = z.object({
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
  suggested_actions: z.array(CDSSuggestedActionSchema).default([]),
  category: z.string(),
  is_pending: z.boolean(),
  is_critical: z.boolean(),
  created_at: z.string(),
});

export const PaginatedCDSAlertSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CDSAlertSchema),
});

export const CDSAlertActionResponseSchema = z.object({
  id: z.number(),
  status: z.string(),
  message: z.string().optional(),
});

export const CDSEvaluateResponseSchema = z.object({
  alerts_generated: z.number(),
  alerts: z.array(CDSAlertSchema),
});
