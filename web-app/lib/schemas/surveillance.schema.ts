/**
 * Zod schemas for Surveillance API response validation.
 */
import { z } from 'zod';

export const NotifiableDiseaseCategorySchema = z.enum([
  'IMMEDIATE',
  'WEEKLY',
  'MONTHLY',
]);

export const NotifiableCaseSeveritySchema = z.enum([
  'MILD',
  'MODERATE',
  'SEVERE',
  'CRITICAL',
]);

export const NotifiableCaseOutcomeSchema = z.enum([
  'ACTIVE',
  'RECOVERED',
  'REFERRED',
  'DECEASED',
  'LOST_TO_FOLLOWUP',
]);

export const NotifiableCaseStatusSchema = z.enum([
  'PENDING',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'INVESTIGATED',
  'CLOSED',
]);

export const NotifiableCaseListSchema = z.object({
  id: z.number(),
  disease: z.number(),
  disease_name: z.string(),
  disease_category: NotifiableDiseaseCategorySchema,
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  severity: NotifiableCaseSeveritySchema,
  outcome: NotifiableCaseOutcomeSchema,
  notification_status: NotifiableCaseStatusSchema,
  detected_at: z.string(),
  notification_deadline: z.string().nullable(),
  is_overdue: z.boolean(),
  is_immediate: z.boolean(),
  county_name: z.string().nullable(),
  laboratory_confirmed: z.boolean(),
});

export const PaginatedNotifiableCaseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(NotifiableCaseListSchema),
});

export const IDSRReportStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'SUBMITTED',
  'FAILED',
]);

export const IDSRDiseaseSummarySchema = z.object({
  id: z.number(),
  disease: z.number(),
  disease_name: z.string(),
  disease_category: z.string(),
  cases_under_5: z.number(),
  cases_5_and_above: z.number(),
  total_cases: z.number(),
  deaths_under_5: z.number(),
  deaths_5_and_above: z.number(),
  total_deaths: z.number(),
  lab_confirmed: z.number(),
  case_fatality_rate: z.string().nullable(),
  is_outbreak: z.boolean(),
  notes: z.string(),
});

export const IDSRWeeklyReportSchema = z.object({
  id: z.number(),
  epi_year: z.number(),
  epi_week: z.number(),
  week_label: z.string(),
  week_start_date: z.string(),
  week_end_date: z.string(),
  facility_code: z.string(),
  facility_name: z.string(),
  county: z.number().nullable(),
  county_name: z.string().nullable(),
  sub_county: z.number().nullable(),
  sub_county_name: z.string().nullable(),
  total_cases: z.number(),
  total_deaths: z.number(),
  immediate_cases: z.number(),
  lab_confirmed_cases: z.number(),
  outbreak_declared: z.boolean(),
  outbreak_diseases: z.string(),
  status: IDSRReportStatusSchema,
  is_submitted: z.boolean(),
  can_edit: z.boolean(),
  generated_at: z.string(),
  generated_by: z.number().nullable(),
  generated_by_name: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  reviewed_by: z.number().nullable(),
  reviewed_by_name: z.string().nullable(),
  approved_at: z.string().nullable(),
  approved_by: z.number().nullable(),
  approved_by_name: z.string().nullable(),
  dhis2_submitted_at: z.string().nullable(),
  dhis2_import_summary: z.record(z.unknown()).nullable(),
  notes: z.string(),
  disease_summaries: z.array(IDSRDiseaseSummarySchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const IDSRWeeklyReportListSchema = z.object({
  id: z.number(),
  epi_year: z.number(),
  epi_week: z.number(),
  week_label: z.string(),
  week_start_date: z.string(),
  week_end_date: z.string(),
  facility_name: z.string(),
  county_name: z.string().nullable(),
  total_cases: z.number(),
  total_deaths: z.number(),
  outbreak_declared: z.boolean(),
  status: IDSRReportStatusSchema,
  disease_count: z.number(),
  generated_at: z.string(),
});

export const PaginatedIDSRWeeklyReportSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(IDSRWeeklyReportListSchema),
});

const IDSRDashboardWeekSchema = z.object({
  epi_year: z.number(),
  epi_week: z.number(),
  week_start: z.string(),
  week_end: z.string(),
  has_report: z.boolean(),
  report_id: z.number().nullable(),
  total_cases: z.number(),
  status: IDSRReportStatusSchema.nullable(),
});

const IDSRDashboardPreviousWeekSchema = z.object({
  epi_year: z.number(),
  epi_week: z.number(),
  week_start: z.string(),
  has_report: z.boolean(),
  total_cases: z.number(),
  status: IDSRReportStatusSchema.nullable(),
});

export const IDSRDashboardSchema = z.object({
  current_week: IDSRDashboardWeekSchema,
  previous_weeks: z.array(IDSRDashboardPreviousWeekSchema),
  total_reports_this_year: z.number(),
  pending_submission: z.number(),
  submitted_this_month: z.number(),
  outbreak_weeks: z.number(),
});

export const IDSRDHIS2PreviewSchema = z.object({
  report_id: z.number(),
  week_label: z.string(),
  payload: z.record(z.unknown()),
});

export const IDSRSubmitResponseSchema = z.object({
  report: IDSRWeeklyReportSchema,
  dhis2_response: z.record(z.unknown()),
});

export type NotifiableCaseListSchemaType = z.infer<typeof NotifiableCaseListSchema>;
export type PaginatedNotifiableCaseSchemaType = z.infer<typeof PaginatedNotifiableCaseSchema>;
export type IDSRWeeklyReportSchemaType = z.infer<typeof IDSRWeeklyReportSchema>;
export type IDSRWeeklyReportListSchemaType = z.infer<typeof IDSRWeeklyReportListSchema>;
export type IDSRDashboardSchemaType = z.infer<typeof IDSRDashboardSchema>;
export type IDSRDHIS2PreviewSchemaType = z.infer<typeof IDSRDHIS2PreviewSchema>;
export type IDSRSubmitResponseSchemaType = z.infer<typeof IDSRSubmitResponseSchema>;
