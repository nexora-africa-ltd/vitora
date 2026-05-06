/**
 * QC (Quality Control) types for Laboratory module.
 * Phase L1: Materials, Lots, Targets, Results, Rules, Violations, EQA.
 */

// ============================================================================
// QC Material & Lot
// ============================================================================

export interface QCMaterial {
  id: number;
  name: string;
  manufacturer: string;
  catalog_number: string;
  description?: string;
  storage_conditions: string;
  is_active: boolean;
  lot_count: number;
  created_at: string;
  updated_at: string;
}

export interface QCMaterialCreateData {
  name: string;
  manufacturer: string;
  catalog_number?: string;
  description?: string;
  storage_conditions?: string;
  is_active?: boolean;
}

export type QCLotStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'CLOSED';

export interface QCLot {
  id: number;
  material: number;
  material_name: string;
  lot_number: string;
  status: QCLotStatus;
  open_date: string | null;
  expiry_date: string;
  is_expired: boolean;
  days_until_expiry: number;
  storage_conditions: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface QCLotDetail extends QCLot {
  manufacturer: string;
  target_count: number;
  result_count: number;
}

export interface QCLotCreateData {
  material: number;
  lot_number: string;
  status?: QCLotStatus;
  open_date?: string;
  expiry_date: string;
  storage_conditions?: string;
  notes?: string;
}

// ============================================================================
// QC Target
// ============================================================================

export interface QCTarget {
  id: number;
  lot: number;
  test: number;
  test_name: string;
  test_code: string;
  instrument: number | null;
  instrument_name: string | null;
  mean: string;
  sd: string;
  cv_percent: string | null;
  unit: string;
  n_values: number;
  created_at: string;
  updated_at: string;
}

export interface QCTargetCreateData {
  lot: number;
  test: number;
  instrument?: number | null;
  mean: string;
  sd: string;
  cv_percent?: string;
  unit: string;
  n_values?: number;
}

// ============================================================================
// QC Result
// ============================================================================

export interface QCResult {
  id: number;
  lot: number;
  lot_number: string;
  test: number;
  test_name: string;
  test_code: string;
  instrument: number | null;
  instrument_name: string | null;
  value: string;
  run_date: string;
  operator: number | null;
  operator_name: string | null;
  accepted: boolean;
  z_score: number | null;
  violation_count: number;
  comment: string;
  created_at: string;
}

export interface QCResultDetail extends QCResult {
  material_name: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  violations: QCRuleViolation[];
  updated_at: string;
}

export interface QCResultCreateData {
  lot: number;
  test: number;
  instrument?: number | null;
  value: string;
  run_date?: string;
  comment?: string;
}

// ============================================================================
// QC Rule & Violation
// ============================================================================

export type QCRuleType = '1_2S' | '1_3S' | '2_2S' | 'R_4S' | '4_1S' | '10X' | 'CUSTOM';
export type QCRuleSeverity = 'WARNING' | 'REJECT';

export interface QCRule {
  id: number;
  name: string;
  rule_type: QCRuleType;
  severity: QCRuleSeverity;
  description: string;
  custom_expression: string;
  is_active: boolean;
  applies_to_test: number | null;
  test_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface QCRuleCreateData {
  name: string;
  rule_type: QCRuleType;
  severity: QCRuleSeverity;
  description?: string;
  custom_expression?: string;
  is_active?: boolean;
  applies_to_test?: number | null;
}

export interface QCRuleViolation {
  id: number;
  rule: number;
  rule_name: string;
  rule_type: QCRuleType;
  severity: QCRuleSeverity;
  description: string;
  acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  corrective_action: string;
  created_at: string;
}

// ============================================================================
// Levey-Jennings Chart Data
// ============================================================================

export interface LeveyJenningsPoint {
  id: number;
  value: string;
  run_date: string;
  z_score: number | null;
  accepted: boolean;
  operator_name: string | null;
}

export interface LeveyJenningsData {
  lot_id: number;
  lot_number: string;
  test_id: number;
  test_name: string;
  mean: string;
  sd: string;
  unit: string;
  data_points: LeveyJenningsPoint[];
}

// ============================================================================
// EQA / Proficiency Testing
// ============================================================================

export type EQASurveyStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'RESULTS_RECEIVED' | 'CLOSED';
export type EQAPerformance = 'ACCEPTABLE' | 'WARNING' | 'UNACCEPTABLE' | 'PENDING';

export interface EQASurvey {
  id: number;
  provider: string;
  survey_id: string;
  name: string;
  category: string;
  status: EQASurveyStatus;
  received_date: string | null;
  due_date: string;
  submitted_date: string | null;
  results_received_date: string | null;
  overall_score: string | null;
  is_overdue: boolean;
  sample_count: number;
  acceptable_rate: number | null;
  created_at: string;
  updated_at: string;
}

export interface EQASurveyDetail extends EQASurvey {
  samples: EQASample[];
  notes: string;
}

export interface EQASurveyCreateData {
  provider: string;
  survey_id: string;
  name: string;
  category?: string;
  status?: EQASurveyStatus;
  received_date?: string;
  due_date: string;
  notes?: string;
}

export interface EQASample {
  id: number;
  survey: number;
  sample_id: string;
  test: number;
  test_name: string;
  test_code: string;
  expected_value: string;
  expected_unit: string;
  acceptable_range_low: string | null;
  acceptable_range_high: string | null;
  submission_count: number;
  created_at: string;
}

export interface EQASampleCreateData {
  survey: number;
  sample_id: string;
  test: number;
  expected_value?: string;
  expected_unit?: string;
  acceptable_range_low?: string;
  acceptable_range_high?: string;
}

export interface EQASubmission {
  id: number;
  sample: number;
  sample_id_display: string;
  test_name: string;
  instrument: number | null;
  instrument_name: string | null;
  submitted_value: string;
  submitted_unit: string;
  method: string;
  submitted_by: number | null;
  submitted_at: string | null;
  z_score: string | null;
  bias_percent: string | null;
  performance: EQAPerformance;
  peer_group_mean: string | null;
  peer_group_sd: string | null;
  peer_group_n: number | null;
  is_acceptable: boolean;
  comments: string;
  created_at: string;
}

export interface EQASubmissionCreateData {
  sample: number;
  instrument?: number | null;
  submitted_value: string;
  submitted_unit?: string;
  method?: string;
  comments?: string;
}

export interface EQAUpdateScoreData {
  z_score: string;
  bias_percent?: string | null;
  peer_group_mean?: string | null;
  peer_group_sd?: string | null;
  peer_group_n?: number | null;
}

// ============================================================================
// Query Params
// ============================================================================

export interface QCResultListParams {
  lot?: number;
  test?: number;
  instrument?: number;
  accepted?: boolean;
  run_date_from?: string;
  run_date_to?: string;
  page?: number;
}

export interface QCLotListParams {
  material?: number;
  status?: QCLotStatus;
  expiring_within_days?: number;
  page?: number;
}

export interface EQASurveyListParams {
  provider?: string;
  status?: EQASurveyStatus;
  category?: string;
  due_after?: string;
  due_before?: string;
  page?: number;
}
