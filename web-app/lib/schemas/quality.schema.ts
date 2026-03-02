/**
 * Zod schemas for Quality Measures & Reporting API response validation
 *
 * ⚠️  These schemas MUST match the backend serializer fields exactly
 *     (hmis/apps/quality/serializers.py) to prevent schema drift.
 *
 * Backend serializers → Zod schemas → TypeScript types
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const QualityMeasureDomainSchema = z.enum([
  'CLINICAL',
  'PATIENT_SAFETY',
  'EFFICIENCY',
  'PATIENT_EXPERIENCE',
  'PUBLIC_HEALTH',
  'CARE_COORDINATION',
]);

export const QualityMeasureStatusSchema = z.enum([
  'ACTIVE',
  'DRAFT',
  'RETIRED',
]);

export const ReportingPeriodSchema = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
]);

export const ExportFormatSchema = z.enum(['csv', 'json', 'qrda']);
export const ImportFormatSchema = z.enum(['csv', 'json']);

// =============================================================================
// QUARTERLY REPORT SCHEMA
// Matches: QuarterlyReportSerializer fields exactly
// =============================================================================

export const QuarterlyReportSchema = z.object({
  id: z.number(),
  clinic: z.number(),
  clinic_name: z.string(),
  year: z.number(),
  quarter: z.number(),
  quarter_display: z.string(),
  months: z.array(z.number()),
  // Visit statistics
  total_visits: z.number(),
  new_visits: z.number(),
  revisits: z.number(),
  // Priority
  priority_red: z.number(),
  priority_orange: z.number(),
  priority_yellow: z.number(),
  priority_green: z.number(),
  priority_blue: z.number(),
  // Demographics
  male_visits: z.number(),
  female_visits: z.number(),
  under_5_visits: z.number(),
  under_18_visits: z.number(),
  adult_visits: z.number(),
  over_60_visits: z.number(),
  // Chronic care
  new_enrollments: z.number(),
  active_enrollments: z.number(),
  defaulters: z.number(),
  // ANC
  anc_first_visits: z.number(),
  anc_revisits: z.number(),
  deliveries: z.number(),
  // Revenue (DecimalField → string in DRF)
  total_revenue: z.string(),
  sha_claims_amount: z.string(),
  cash_amount: z.string(),
  // Source tracking
  monthly_report_ids: z.array(z.number()),
  // DHIS2
  dhis2_submitted: z.boolean(),
  dhis2_submitted_at: z.string().nullable(),
  dhis2_response: z.record(z.unknown()).nullable(),
  // Metadata
  generated_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// ANNUAL REPORT SCHEMA
// Matches: AnnualReportSerializer fields exactly
// =============================================================================

export const AnnualReportSchema = z.object({
  id: z.number(),
  clinic: z.number(),
  clinic_name: z.string(),
  year: z.number(),
  // Visit statistics
  total_visits: z.number(),
  new_visits: z.number(),
  revisits: z.number(),
  // Priority
  priority_red: z.number(),
  priority_orange: z.number(),
  priority_yellow: z.number(),
  priority_green: z.number(),
  priority_blue: z.number(),
  // Demographics
  male_visits: z.number(),
  female_visits: z.number(),
  under_5_visits: z.number(),
  under_18_visits: z.number(),
  adult_visits: z.number(),
  over_60_visits: z.number(),
  // Chronic care
  new_enrollments: z.number(),
  active_enrollments: z.number(),
  defaulters: z.number(),
  // ANC
  anc_first_visits: z.number(),
  anc_revisits: z.number(),
  deliveries: z.number(),
  // Revenue
  total_revenue: z.string(),
  sha_claims_amount: z.string(),
  cash_amount: z.string(),
  // Source tracking
  quarterly_report_ids: z.array(z.number()),
  // DHIS2
  dhis2_submitted: z.boolean(),
  dhis2_submitted_at: z.string().nullable(),
  dhis2_response: z.record(z.unknown()).nullable(),
  // Metadata
  generated_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// QUALITY MEASURE SCHEMA
// Matches: QualityMeasureSerializer fields exactly
// =============================================================================

export const QualityMeasureSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  domain: QualityMeasureDomainSchema,
  domain_display: z.string(),
  status: QualityMeasureStatusSchema,
  status_display: z.string(),
  numerator_logic: z.string(),
  denominator_logic: z.string(),
  exclusion_logic: z.string(),
  target_percentage: z.string().nullable(),
  low_threshold: z.string().nullable(),
  reporting_period: ReportingPeriodSchema,
  reporting_period_display: z.string(),
  dhis2_indicator_id: z.string(),
  reference_url: z.string(),
  applicable_clinic_types: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// QUALITY MEASURE RESULT SCHEMA
// Matches: QualityMeasureResultSerializer fields exactly
// =============================================================================

export const QualityMeasureResultSchema = z.object({
  id: z.number(),
  measure: z.number(),
  measure_code: z.string(),
  measure_name: z.string(),
  clinic: z.number(),
  clinic_name: z.string(),
  year: z.number(),
  period: z.number(),
  period_type: ReportingPeriodSchema,
  period_type_display: z.string(),
  numerator: z.number(),
  denominator: z.number(),
  percentage: z.string(),
  meets_target: z.boolean(),
  calculation_notes: z.string(),
  calculated_at: z.string(),
  calculated_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// IMPORT/EXPORT SCHEMAS
// =============================================================================

export const QualityMeasureImportResultSchema = z.object({
  detail: z.string(),
  created: z.number(),
  updated: z.number(),
});

// =============================================================================
// DASHBOARD SCHEMA
// Matches: QualityDashboardSerializer fields exactly
// =============================================================================

export const QualityDomainSummarySchema = z.object({
  domain: QualityMeasureDomainSchema,
  domain_display: z.string(),
  total_measures: z.number(),
  total_results: z.number(),
  meeting_target: z.number(),
  compliance_rate: z.number(),
});

export const QualityTrendDataPointSchema = z.object({
  period: z.string(),
  total: z.number(),
  meeting_target: z.number(),
  compliance_rate: z.number(),
});

export const QualityDashboardSchema = z.object({
  total_measures: z.number(),
  active_measures: z.number(),
  measures_meeting_target: z.number(),
  measures_below_threshold: z.number(),
  overall_compliance_rate: z.number(),
  domain_summary: z.array(QualityDomainSummarySchema),
  trend_data: z.array(QualityTrendDataPointSchema),
});

// =============================================================================
// PAGINATED RESPONSE SCHEMAS
// =============================================================================

const paginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const PaginatedQuarterlyReportSchema = paginatedResponse(QuarterlyReportSchema);
export const PaginatedAnnualReportSchema = paginatedResponse(AnnualReportSchema);
export const PaginatedQualityMeasureSchema = paginatedResponse(QualityMeasureSchema);
export const PaginatedQualityMeasureResultSchema = paginatedResponse(QualityMeasureResultSchema);

// =============================================================================
// INFERRED TYPES (for use when types file is not needed)
// =============================================================================

export type QuarterlyReportType = z.infer<typeof QuarterlyReportSchema>;
export type AnnualReportType = z.infer<typeof AnnualReportSchema>;
export type QualityMeasureType = z.infer<typeof QualityMeasureSchema>;
export type QualityMeasureResultType = z.infer<typeof QualityMeasureResultSchema>;
export type QualityDashboardType = z.infer<typeof QualityDashboardSchema>;
