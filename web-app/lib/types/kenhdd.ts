/**
 * KENHDD (Kenya National Health Data Dictionary) types.
 *
 * DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
 */

export type KENHDDResourceType =
  | 'PATIENT'
  | 'ENCOUNTER'
  | 'DIAGNOSIS'
  | 'FACILITY'
  | 'LAB_RESULT'
  | 'PRESCRIPTION'
  | 'MCH_VISIT';

export type KENHDDRequirementLevel = 'MANDATORY' | 'CONDITIONAL' | 'OPTIONAL';
export type KENHDDDataType = 'STRING' | 'DATE' | 'INTEGER' | 'DECIMAL' | 'CODED' | 'BOOLEAN' | 'IDENTIFIER';
export type KENHDDValidationStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

export interface KENHDDDataElement {
  id: number;
  element_id: string;
  name: string;
  description?: string;
  resource_type: KENHDDResourceType;
  model_field: string;
  requirement_level: KENHDDRequirementLevel;
  data_type: KENHDDDataType;
  coding_system: string;
  max_length?: number | null;
  format_pattern?: string;
  condition_expression?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface KENHDDElementResult {
  element_id: string;
  element_name: string;
  field_name: string;
  status: KENHDDValidationStatus;
  message: string;
  requirement_level: KENHDDRequirementLevel;
  value: string;
}

export interface KENHDDRecordResult {
  record_id: string;
  resource_type: KENHDDResourceType;
  is_compliant: boolean;
  pass_count: number;
  fail_count: number;
  warning_count: number;
  elements: KENHDDElementResult[];
}

export interface KENHDDComplianceScore {
  resource_type: KENHDDResourceType;
  total_records: number;
  compliant_records: number;
  compliance_pct: number;
  mandatory_pass_rate: number;
  total_elements: number;
  violations_by_element: Record<string, number>;
}

export interface KENHDDValidationRun {
  id: number;
  resource_type: KENHDDResourceType;
  records_checked: number;
  records_compliant: number;
  compliance_score: string;
  mandatory_pass_rate: string;
  violations: Record<string, number>;
  run_by: number | null;
  run_by_name: string | null;
  run_at: string;
}

export interface KENHDDComplianceSummaryEntry {
  resource_type: KENHDDResourceType;
  compliance_score: number | null;
  mandatory_pass_rate: number | null;
  records_checked: number;
  records_compliant: number;
  violations: Record<string, number>;
  run_at: string | null;
  run_by: string | null;
}

export interface KENHDDFailedRecord {
  id: number;
  record_id: string;
  is_compliant: boolean;
  pass_count: number;
  fail_count: number;
  warning_count: number;
  violation_details: KENHDDViolationDetail[];
}

export interface KENHDDViolationDetail {
  element_id: string;
  element_name: string;
  field_name: string;
  status: KENHDDValidationStatus;
  message: string;
  requirement_level: KENHDDRequirementLevel;
  value: string;
}

export interface KENHDDValidationRunDetail extends KENHDDValidationRun {
  total_failed: number;
  failed_records: KENHDDFailedRecord[];
}
