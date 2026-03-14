/**
 * KENHDD Zod schemas.
 *
 * DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
 */

import { z } from 'zod';

export const KENHDDDataElementSchema = z.object({
  id: z.number(),
  element_id: z.string(),
  name: z.string(),
  resource_type: z.string(),
  model_field: z.string(),
  requirement_level: z.string(),
  data_type: z.string(),
  coding_system: z.string(),
  is_active: z.boolean(),
});

export const KENHDDDataElementDetailSchema = KENHDDDataElementSchema.extend({
  description: z.string().optional().default(''),
  max_length: z.number().nullable().optional(),
  format_pattern: z.string().optional().default(''),
  condition_expression: z.string().optional().default(''),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const KENHDDElementResultSchema = z.object({
  element_id: z.string(),
  element_name: z.string(),
  field_name: z.string(),
  status: z.string(),
  message: z.string(),
  requirement_level: z.string(),
  value: z.string(),
});

export const KENHDDRecordResultSchema = z.object({
  record_id: z.union([z.string(), z.number()]).transform(String),
  resource_type: z.string(),
  is_compliant: z.boolean(),
  pass_count: z.number(),
  fail_count: z.number(),
  warning_count: z.number(),
  elements: z.array(KENHDDElementResultSchema),
});

export const KENHDDComplianceScoreSchema = z.object({
  resource_type: z.string(),
  total_records: z.number(),
  compliant_records: z.number(),
  compliance_pct: z.number(),
  mandatory_pass_rate: z.number(),
  total_elements: z.number(),
  violations_by_element: z.record(z.string(), z.number()),
});

export const KENHDDValidationRunSchema = z.object({
  id: z.number(),
  resource_type: z.string(),
  records_checked: z.number(),
  records_compliant: z.number(),
  compliance_score: z.string(),
  mandatory_pass_rate: z.string(),
  violations: z.record(z.string(), z.number()),
  run_by: z.number().nullable(),
  run_by_name: z.string().nullable(),
  run_at: z.string(),
});

export const KENHDDComplianceSummaryEntrySchema = z.object({
  resource_type: z.string(),
  compliance_score: z.number().nullable(),
  mandatory_pass_rate: z.number().nullable(),
  records_checked: z.number(),
  records_compliant: z.number(),
  violations: z.record(z.string(), z.number()),
  run_at: z.string().nullable(),
  run_by: z.string().nullable(),
});

export const KENHDDViolationDetailSchema = z.object({
  element_id: z.string(),
  element_name: z.string(),
  field_name: z.string(),
  status: z.string(),
  message: z.string(),
  requirement_level: z.string(),
  value: z.string(),
});

export const KENHDDFailedRecordSchema = z.object({
  id: z.number(),
  record_id: z.union([z.string(), z.number()]).transform(String),
  is_compliant: z.boolean(),
  pass_count: z.number(),
  fail_count: z.number(),
  warning_count: z.number(),
  violation_details: z.array(KENHDDViolationDetailSchema),
});

export const KENHDDValidationRunDetailSchema = KENHDDValidationRunSchema.extend({
  total_failed: z.number(),
  failed_records: z.array(KENHDDFailedRecordSchema),
});

// Paginated list response
export const KENHDDDataElementListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(KENHDDDataElementSchema),
});
