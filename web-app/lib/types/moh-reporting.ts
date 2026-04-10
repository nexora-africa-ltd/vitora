/**
 * MOH Reporting TypeScript types.
 *
 * Types for MOH 705 (outpatient morbidity), MOH 711 (integrated RH/HIV/
 * Malaria/Nutrition), and MOH 717 (workload) reports.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type MOHReportStatus = 'DRAFT' | 'APPROVED' | 'SUBMITTED' | 'FAILED';

export interface MOHReportBase {
  id: number;
  facility: number;
  facility_name: string;
  period_start: string;
  period_end: string;
  period_label: string;
  status: MOHReportStatus;
  generated_by: number | null;
  generated_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  dhis2_submitted_at: string | null;
  dhis2_import_summary: Record<string, unknown>;
  is_submitted: boolean;
  can_edit: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// MOH 705
// ---------------------------------------------------------------------------

export interface MOH705DiseaseRow {
  id: number;
  icd10_chapter: number;
  category_name: string;
  cases_under_5: number;
  cases_5_and_above: number;
  total_cases: number;
}

export interface MOH705Report extends MOHReportBase {
  dhis2_period: string;
  total_visits: number;
  total_under_5: number;
  total_5_and_above: number;
  new_cases: number;
  revisits: number;
  disease_rows: MOH705DiseaseRow[];
}

export interface MOH705ReportListItem {
  id: number;
  facility: number;
  facility_name: string;
  period_start: string;
  period_end: string;
  period_label: string;
  status: MOHReportStatus;
  total_visits: number;
  total_under_5: number;
  total_5_and_above: number;
  is_submitted: boolean;
  disease_row_count: number;
  generated_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// MOH 711
// ---------------------------------------------------------------------------

export interface MOH711Report extends MOHReportBase {
  dhis2_period: string;
  // RH
  anc_visits: number;
  deliveries_normal: number;
  deliveries_caesarean: number;
  deliveries_total: number;
  live_births: number;
  still_births: number;
  // Malaria
  malaria_cases_under_5: number;
  malaria_cases_5_and_above: number;
  malaria_in_pregnancy: number;
  // Nutrition
  children_underweight: number;
  children_stunted: number;
  children_wasted: number;
  // Immunisation
  bcg_given: number;
  opv_given: number;
  penta_given: number;
  measles_given: number;
  fully_immunised: number;
}

export interface MOH711ReportListItem {
  id: number;
  facility: number;
  facility_name: string;
  period_start: string;
  period_end: string;
  period_label: string;
  status: MOHReportStatus;
  deliveries_total: number;
  malaria_cases_under_5: number;
  malaria_cases_5_and_above: number;
  is_submitted: boolean;
  generated_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// MOH 717
// ---------------------------------------------------------------------------

export interface MOH717Report extends MOHReportBase {
  dhis2_period: string;
  opd_new_visits: number;
  opd_revisits: number;
  opd_total: number;
  admissions_total: number;
  discharges_total: number;
  inpatient_days: number;
  deaths_total: number;
  deliveries_total: number;
  deliveries_caesarean: number;
  surgeries_major: number;
  surgeries_minor: number;
  referrals_in: number;
  referrals_out: number;
  lab_tests_total: number;
  emergency_visits: number;
}

export interface MOH717ReportListItem {
  id: number;
  facility: number;
  facility_name: string;
  period_start: string;
  period_end: string;
  period_label: string;
  status: MOHReportStatus;
  opd_total: number;
  admissions_total: number;
  emergency_visits: number;
  is_submitted: boolean;
  generated_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DHIS2 Preview
// ---------------------------------------------------------------------------

export interface DHIS2DataValue {
  dataElement: string;
  period: string;
  orgUnit: string;
  value: string;
}

export interface DHIS2Payload {
  dataValues: DHIS2DataValue[];
  period: string;
  orgUnit: string;
  completeDate: string;
}

// ---------------------------------------------------------------------------
// API params
// ---------------------------------------------------------------------------

export interface MOHReportGenerateParams {
  year?: number;
  month?: number;
}
