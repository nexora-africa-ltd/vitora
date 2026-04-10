/**
 * MOH Reporting Zod schemas.
 *
 * Validates API responses from /api/moh-reports/ endpoints.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const MOHReportStatusSchema = z.enum(['DRAFT', 'APPROVED', 'SUBMITTED', 'FAILED']);

// ---------------------------------------------------------------------------
// MOH 705
// ---------------------------------------------------------------------------

export const MOH705DiseaseRowSchema = z.object({
  id: z.number(),
  icd10_chapter: z.number(),
  category_name: z.string(),
  cases_under_5: z.number(),
  cases_5_and_above: z.number(),
  total_cases: z.number(),
});

export const MOH705ReportSchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  period_label: z.string(),
  dhis2_period: z.string(),
  status: MOHReportStatusSchema,
  total_visits: z.number(),
  total_under_5: z.number(),
  total_5_and_above: z.number(),
  new_cases: z.number(),
  revisits: z.number(),
  generated_by: z.number().nullable(),
  generated_at: z.string().nullable(),
  approved_by: z.number().nullable(),
  approved_at: z.string().nullable(),
  dhis2_submitted_at: z.string().nullable(),
  dhis2_import_summary: z.record(z.unknown()),
  is_submitted: z.boolean(),
  can_edit: z.boolean(),
  notes: z.string(),
  disease_rows: z.array(MOH705DiseaseRowSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const MOH705ReportListItemSchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  period_label: z.string(),
  status: MOHReportStatusSchema,
  total_visits: z.number(),
  total_under_5: z.number(),
  total_5_and_above: z.number(),
  is_submitted: z.boolean(),
  disease_row_count: z.number(),
  generated_at: z.string().nullable(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// MOH 711
// ---------------------------------------------------------------------------

export const MOH711ReportSchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  period_label: z.string(),
  dhis2_period: z.string(),
  status: MOHReportStatusSchema,
  anc_visits: z.number(),
  deliveries_normal: z.number(),
  deliveries_caesarean: z.number(),
  deliveries_total: z.number(),
  live_births: z.number(),
  still_births: z.number(),
  malaria_cases_under_5: z.number(),
  malaria_cases_5_and_above: z.number(),
  malaria_in_pregnancy: z.number(),
  children_underweight: z.number(),
  children_stunted: z.number(),
  children_wasted: z.number(),
  bcg_given: z.number(),
  opv_given: z.number(),
  penta_given: z.number(),
  measles_given: z.number(),
  fully_immunised: z.number(),
  generated_by: z.number().nullable(),
  generated_at: z.string().nullable(),
  approved_by: z.number().nullable(),
  approved_at: z.string().nullable(),
  dhis2_submitted_at: z.string().nullable(),
  dhis2_import_summary: z.record(z.unknown()),
  is_submitted: z.boolean(),
  can_edit: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const MOH711ReportListItemSchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  period_label: z.string(),
  status: MOHReportStatusSchema,
  deliveries_total: z.number(),
  malaria_cases_under_5: z.number(),
  malaria_cases_5_and_above: z.number(),
  is_submitted: z.boolean(),
  generated_at: z.string().nullable(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// MOH 717
// ---------------------------------------------------------------------------

export const MOH717ReportSchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  period_label: z.string(),
  dhis2_period: z.string(),
  status: MOHReportStatusSchema,
  opd_new_visits: z.number(),
  opd_revisits: z.number(),
  opd_total: z.number(),
  admissions_total: z.number(),
  discharges_total: z.number(),
  inpatient_days: z.number(),
  deaths_total: z.number(),
  deliveries_total: z.number(),
  deliveries_caesarean: z.number(),
  surgeries_major: z.number(),
  surgeries_minor: z.number(),
  referrals_in: z.number(),
  referrals_out: z.number(),
  lab_tests_total: z.number(),
  emergency_visits: z.number(),
  generated_by: z.number().nullable(),
  generated_at: z.string().nullable(),
  approved_by: z.number().nullable(),
  approved_at: z.string().nullable(),
  dhis2_submitted_at: z.string().nullable(),
  dhis2_import_summary: z.record(z.unknown()),
  is_submitted: z.boolean(),
  can_edit: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const MOH717ReportListItemSchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  period_label: z.string(),
  status: MOHReportStatusSchema,
  opd_total: z.number(),
  admissions_total: z.number(),
  emergency_visits: z.number(),
  is_submitted: z.boolean(),
  generated_at: z.string().nullable(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// DHIS2 Preview
// ---------------------------------------------------------------------------

export const DHIS2PayloadSchema = z.object({
  dataValues: z.array(
    z.object({
      dataElement: z.string(),
      period: z.string(),
      orgUnit: z.string(),
      value: z.string(),
    })
  ),
  period: z.string(),
  orgUnit: z.string(),
  completeDate: z.string(),
});

// ---------------------------------------------------------------------------
// Paginated responses
// ---------------------------------------------------------------------------

const paginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const PaginatedMOH705ListSchema = paginatedResponse(MOH705ReportListItemSchema);
export const PaginatedMOH711ListSchema = paginatedResponse(MOH711ReportListItemSchema);
export const PaginatedMOH717ListSchema = paginatedResponse(MOH717ReportListItemSchema);
