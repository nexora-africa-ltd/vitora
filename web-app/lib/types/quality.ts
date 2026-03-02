/**
 * Quality Measures & Reporting Type Definitions
 *
 * Types for quarterly/annual reports, quality measures (CQM),
 * measure results, import/export, and quality dashboard.
 *
 * ⚠️  MUST match backend serializer fields exactly (hmis/apps/quality/serializers.py)
 */

// =============================================================================
// ENUMS
// =============================================================================

/** Quality measure domain categories */
export type QualityMeasureDomain =
  | 'CLINICAL'
  | 'PATIENT_SAFETY'
  | 'EFFICIENCY'
  | 'PATIENT_EXPERIENCE'
  | 'PUBLIC_HEALTH'
  | 'CARE_COORDINATION';

/** Quality measure status */
export type QualityMeasureStatus = 'ACTIVE' | 'DRAFT' | 'RETIRED';

/** Reporting period type */
export type ReportingPeriod = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

/** Export format */
export type ExportFormat = 'csv' | 'json' | 'qrda';

/** Import format */
export type ImportFormat = 'csv' | 'json';

// =============================================================================
// QUARTERLY REPORT
// =============================================================================

export interface QuarterlyReport {
  id: number;
  clinic: number;
  clinic_name: string;
  year: number;
  quarter: number;
  quarter_display: string;
  months: number[];
  // Visit statistics
  total_visits: number;
  new_visits: number;
  revisits: number;
  // Priority
  priority_red: number;
  priority_orange: number;
  priority_yellow: number;
  priority_green: number;
  priority_blue: number;
  // Demographics
  male_visits: number;
  female_visits: number;
  under_5_visits: number;
  under_18_visits: number;
  adult_visits: number;
  over_60_visits: number;
  // Chronic care
  new_enrollments: number;
  active_enrollments: number;
  defaulters: number;
  // ANC
  anc_first_visits: number;
  anc_revisits: number;
  deliveries: number;
  // Revenue
  total_revenue: string;
  sha_claims_amount: string;
  cash_amount: string;
  // Source tracking
  monthly_report_ids: number[];
  // DHIS2
  dhis2_submitted: boolean;
  dhis2_submitted_at: string | null;
  dhis2_response: Record<string, unknown> | null;
  // Metadata
  generated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuarterlyReportGenerateData {
  clinic_id: number;
  year: number;
  quarter: number;
}

export interface QuarterlyReportListParams {
  clinic?: number;
  year?: number;
  quarter?: number;
  dhis2_submitted?: boolean;
  ordering?: string;
  page?: number;
}

// =============================================================================
// ANNUAL REPORT
// =============================================================================

export interface AnnualReport {
  id: number;
  clinic: number;
  clinic_name: string;
  year: number;
  // Visit statistics
  total_visits: number;
  new_visits: number;
  revisits: number;
  // Priority
  priority_red: number;
  priority_orange: number;
  priority_yellow: number;
  priority_green: number;
  priority_blue: number;
  // Demographics
  male_visits: number;
  female_visits: number;
  under_5_visits: number;
  under_18_visits: number;
  adult_visits: number;
  over_60_visits: number;
  // Chronic care
  new_enrollments: number;
  active_enrollments: number;
  defaulters: number;
  // ANC
  anc_first_visits: number;
  anc_revisits: number;
  deliveries: number;
  // Revenue
  total_revenue: string;
  sha_claims_amount: string;
  cash_amount: string;
  // Source tracking
  quarterly_report_ids: number[];
  // DHIS2
  dhis2_submitted: boolean;
  dhis2_submitted_at: string | null;
  dhis2_response: Record<string, unknown> | null;
  // Metadata
  generated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualReportGenerateData {
  clinic_id: number;
  year: number;
}

export interface AnnualReportListParams {
  clinic?: number;
  year?: number;
  dhis2_submitted?: boolean;
  ordering?: string;
  page?: number;
}

// =============================================================================
// QUALITY MEASURE
// =============================================================================

export interface QualityMeasure {
  id: number;
  code: string;
  name: string;
  description: string;
  domain: QualityMeasureDomain;
  domain_display: string;
  status: QualityMeasureStatus;
  status_display: string;
  numerator_logic: string;
  denominator_logic: string;
  exclusion_logic: string;
  target_percentage: string | null;
  low_threshold: string | null;
  reporting_period: ReportingPeriod;
  reporting_period_display: string;
  dhis2_indicator_id: string;
  reference_url: string;
  applicable_clinic_types: string[];
  created_at: string;
  updated_at: string;
}

export interface QualityMeasureCreateData {
  code: string;
  name: string;
  description?: string;
  domain?: QualityMeasureDomain;
  status?: QualityMeasureStatus;
  numerator_logic: string;
  denominator_logic: string;
  exclusion_logic?: string;
  target_percentage?: string | null;
  low_threshold?: string | null;
  reporting_period?: ReportingPeriod;
  dhis2_indicator_id?: string;
  reference_url?: string;
  applicable_clinic_types?: string[];
}

export interface QualityMeasureListParams {
  domain?: QualityMeasureDomain;
  status?: QualityMeasureStatus;
  reporting_period?: ReportingPeriod;
  search?: string;
  ordering?: string;
  page?: number;
}

// =============================================================================
// QUALITY MEASURE RESULT
// =============================================================================

export interface QualityMeasureResult {
  id: number;
  measure: number;
  measure_code: string;
  measure_name: string;
  clinic: number;
  clinic_name: string;
  year: number;
  period: number;
  period_type: ReportingPeriod;
  period_type_display: string;
  numerator: number;
  denominator: number;
  percentage: string;
  meets_target: boolean;
  calculation_notes: string;
  calculated_at: string;
  calculated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface QualityMeasureResultCreateData {
  measure: number;
  clinic: number;
  year: number;
  period: number;
  period_type: ReportingPeriod;
  numerator: number;
  denominator: number;
  calculation_notes?: string;
}

export interface QualityMeasureResultListParams {
  measure?: number;
  clinic?: number;
  year?: number;
  period_type?: ReportingPeriod;
  meets_target?: boolean;
  ordering?: string;
  page?: number;
}

export interface QualityMeasureResultTrendParams {
  measure_id: number;
  clinic_id?: number;
  year?: number;
}

// =============================================================================
// IMPORT / EXPORT
// =============================================================================

export interface QualityMeasureImportResult {
  detail: string;
  created: number;
  updated: number;
}

export interface QualityMeasureExportData {
  format: ExportFormat;
  measures?: number[];
}

// =============================================================================
// QUALITY DASHBOARD
// =============================================================================

export interface QualityDomainSummary {
  domain: QualityMeasureDomain;
  domain_display: string;
  total_measures: number;
  total_results: number;
  meeting_target: number;
  compliance_rate: number;
}

export interface QualityTrendDataPoint {
  period: string;
  total: number;
  meeting_target: number;
  compliance_rate: number;
}

export interface QualityDashboardData {
  total_measures: number;
  active_measures: number;
  measures_meeting_target: number;
  measures_below_threshold: number;
  overall_compliance_rate: number;
  domain_summary: QualityDomainSummary[];
  trend_data: QualityTrendDataPoint[];
}

export interface QualityDashboardParams {
  year?: number;
  clinic_id?: number;
}
