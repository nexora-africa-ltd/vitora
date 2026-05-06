/**
 * Zod schemas for QC (Quality Control) API responses.
 */

import { z } from 'zod';

// ============================================================================
// QC Material
// ============================================================================

export const QCMaterialSchema = z.object({
  id: z.number(),
  name: z.string(),
  manufacturer: z.string(),
  catalog_number: z.string(),
  description: z.string().optional(),
  storage_conditions: z.string(),
  is_active: z.boolean(),
  lot_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const QCMaterialArraySchema = z.array(QCMaterialSchema);

export const PaginatedQCMaterialSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(QCMaterialSchema),
});

// ============================================================================
// QC Lot
// ============================================================================

export const QCLotStatusEnum = z.enum(['ACTIVE', 'EXPIRED', 'EXHAUSTED', 'CLOSED']);

export const QCLotSchema = z.object({
  id: z.number(),
  material: z.number(),
  material_name: z.string(),
  lot_number: z.string(),
  status: QCLotStatusEnum,
  open_date: z.string().nullable(),
  expiry_date: z.string(),
  is_expired: z.boolean(),
  days_until_expiry: z.number(),
  storage_conditions: z.string(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const QCLotDetailSchema = QCLotSchema.extend({
  manufacturer: z.string(),
  target_count: z.number(),
  result_count: z.number(),
});

export const QCLotArraySchema = z.array(QCLotSchema);

export const PaginatedQCLotSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(QCLotSchema),
});

// ============================================================================
// QC Target
// ============================================================================

export const QCTargetSchema = z.object({
  id: z.number(),
  lot: z.number(),
  test: z.number(),
  test_name: z.string(),
  test_code: z.string(),
  instrument: z.number().nullable(),
  instrument_name: z.string().nullable(),
  mean: z.string(),
  sd: z.string(),
  cv_percent: z.string().nullable(),
  unit: z.string(),
  n_values: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const QCTargetArraySchema = z.array(QCTargetSchema);

export const PaginatedQCTargetSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(QCTargetSchema),
});

// ============================================================================
// QC Rule & Violation
// ============================================================================

export const QCRuleTypeEnum = z.enum(['1_2S', '1_3S', '2_2S', 'R_4S', '4_1S', '10X', 'CUSTOM']);
export const QCRuleSeverityEnum = z.enum(['WARNING', 'REJECT']);

export const QCRuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  rule_type: QCRuleTypeEnum,
  severity: QCRuleSeverityEnum,
  description: z.string(),
  custom_expression: z.string(),
  is_active: z.boolean(),
  applies_to_test: z.number().nullable(),
  test_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const QCRuleArraySchema = z.array(QCRuleSchema);

export const QCRuleViolationSchema = z.object({
  id: z.number(),
  rule: z.number(),
  rule_name: z.string(),
  rule_type: QCRuleTypeEnum,
  severity: QCRuleSeverityEnum,
  description: z.string(),
  acknowledged: z.boolean(),
  acknowledged_by: z.number().nullable(),
  acknowledged_at: z.string().nullable(),
  corrective_action: z.string(),
  created_at: z.string(),
});

export const QCRuleViolationArraySchema = z.array(QCRuleViolationSchema);

// ============================================================================
// QC Result
// ============================================================================

export const QCResultSchema = z.object({
  id: z.number(),
  lot: z.number(),
  lot_number: z.string(),
  test: z.number(),
  test_name: z.string(),
  test_code: z.string(),
  instrument: z.number().nullable(),
  instrument_name: z.string().nullable(),
  value: z.string(),
  run_date: z.string(),
  operator: z.number().nullable(),
  operator_name: z.string().nullable(),
  accepted: z.boolean(),
  z_score: z.number().nullable(),
  violation_count: z.number(),
  comment: z.string(),
  created_at: z.string(),
});

export const QCResultDetailSchema = QCResultSchema.extend({
  material_name: z.string(),
  reviewed_by: z.number().nullable(),
  reviewed_at: z.string().nullable(),
  violations: z.array(QCRuleViolationSchema),
  updated_at: z.string(),
});

export const PaginatedQCResultSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(QCResultSchema),
});

// ============================================================================
// Levey-Jennings Chart
// ============================================================================

export const LeveyJenningsPointSchema = z.object({
  id: z.number(),
  value: z.string(),
  run_date: z.string(),
  z_score: z.number().nullable(),
  accepted: z.boolean(),
  operator_name: z.string().nullable(),
});

export const LeveyJenningsDataSchema = z.object({
  lot_id: z.number(),
  lot_number: z.string(),
  test_id: z.number(),
  test_name: z.string(),
  mean: z.string(),
  sd: z.string(),
  unit: z.string(),
  data_points: z.array(LeveyJenningsPointSchema),
});

// ============================================================================
// EQA
// ============================================================================

export const EQASurveyStatusEnum = z.enum([
  'PENDING', 'IN_PROGRESS', 'SUBMITTED', 'RESULTS_RECEIVED', 'CLOSED',
]);
export const EQAPerformanceEnum = z.enum(['ACCEPTABLE', 'WARNING', 'UNACCEPTABLE', 'PENDING']);

export const EQASampleSchema = z.object({
  id: z.number(),
  survey: z.number(),
  sample_id: z.string(),
  test: z.number(),
  test_name: z.string(),
  test_code: z.string(),
  expected_value: z.string(),
  expected_unit: z.string(),
  acceptable_range_low: z.string().nullable(),
  acceptable_range_high: z.string().nullable(),
  submission_count: z.number(),
  created_at: z.string(),
});

export const EQASampleArraySchema = z.array(EQASampleSchema);

export const EQASubmissionSchema = z.object({
  id: z.number(),
  sample: z.number(),
  sample_id_display: z.string(),
  test_name: z.string(),
  instrument: z.number().nullable(),
  instrument_name: z.string().nullable(),
  submitted_value: z.string(),
  submitted_unit: z.string(),
  method: z.string(),
  submitted_by: z.number().nullable(),
  submitted_at: z.string().nullable(),
  z_score: z.string().nullable(),
  bias_percent: z.string().nullable(),
  performance: EQAPerformanceEnum,
  peer_group_mean: z.string().nullable(),
  peer_group_sd: z.string().nullable(),
  peer_group_n: z.number().nullable(),
  is_acceptable: z.boolean(),
  comments: z.string(),
  created_at: z.string(),
});

export const EQASubmissionArraySchema = z.array(EQASubmissionSchema);

export const EQASurveySchema = z.object({
  id: z.number(),
  provider: z.string(),
  survey_id: z.string(),
  name: z.string(),
  category: z.string(),
  status: EQASurveyStatusEnum,
  received_date: z.string().nullable(),
  due_date: z.string(),
  submitted_date: z.string().nullable(),
  results_received_date: z.string().nullable(),
  overall_score: z.string().nullable(),
  is_overdue: z.boolean(),
  sample_count: z.number(),
  acceptable_rate: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const EQASurveyDetailSchema = EQASurveySchema.extend({
  samples: z.array(EQASampleSchema),
  notes: z.string(),
});

export const PaginatedEQASurveySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(EQASurveySchema),
});
