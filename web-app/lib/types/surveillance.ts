/**
 * Surveillance and IDSR type definitions for Vitora HMIS.
 */

export type IDSRReportStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'SUBMITTED'
  | 'FAILED';

export type NotifiableDiseaseCategory = 'IMMEDIATE' | 'WEEKLY' | 'MONTHLY';

export type NotifiableCaseSeverity = 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL';

export type NotifiableCaseOutcome =
  | 'ACTIVE'
  | 'RECOVERED'
  | 'REFERRED'
  | 'DECEASED'
  | 'LOST_TO_FOLLOWUP';

export type NotifiableCaseStatus =
  | 'PENDING'
  | 'NOTIFIED'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATED'
  | 'CLOSED';

export interface NotifiableCaseListItem {
  id: number;
  disease: number;
  disease_name: string;
  disease_category: NotifiableDiseaseCategory;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  severity: NotifiableCaseSeverity;
  outcome: NotifiableCaseOutcome;
  notification_status: NotifiableCaseStatus;
  detected_at: string;
  notification_deadline: string | null;
  is_overdue: boolean;
  is_immediate: boolean;
  county_name: string | null;
  laboratory_confirmed: boolean;
}

export interface NotifiableCaseListParams {
  search?: string;
  category?: NotifiableDiseaseCategory;
  notification_status?: NotifiableCaseStatus;
  is_overdue?: boolean;
  detected_after?: string;
  detected_before?: string;
  laboratory_confirmed?: boolean;
  disease?: number;
  patient?: number;
  page?: number;
  page_size?: number;
}

export interface IDSRDiseaseSummary {
  id: number;
  disease: number;
  disease_name: string;
  disease_category: string;
  cases_under_5: number;
  cases_5_and_above: number;
  total_cases: number;
  deaths_under_5: number;
  deaths_5_and_above: number;
  total_deaths: number;
  lab_confirmed: number;
  case_fatality_rate: string | null;
  is_outbreak: boolean;
  notes: string;
}

export interface IDSRWeeklyReport {
  id: number;
  epi_year: number;
  epi_week: number;
  week_label: string;
  week_start_date: string;
  week_end_date: string;
  facility_code: string;
  facility_name: string;
  county: number | null;
  county_name: string | null;
  sub_county: number | null;
  sub_county_name: string | null;
  total_cases: number;
  total_deaths: number;
  immediate_cases: number;
  lab_confirmed_cases: number;
  outbreak_declared: boolean;
  outbreak_diseases: string;
  status: IDSRReportStatus;
  is_submitted: boolean;
  can_edit: boolean;
  generated_at: string;
  generated_by: number | null;
  generated_by_name: string | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  approved_at: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  dhis2_submitted_at: string | null;
  dhis2_import_summary: Record<string, unknown> | null;
  notes: string;
  disease_summaries: IDSRDiseaseSummary[];
  created_at: string;
  updated_at: string;
}

export interface IDSRWeeklyReportListItem {
  id: number;
  epi_year: number;
  epi_week: number;
  week_label: string;
  week_start_date: string;
  week_end_date: string;
  facility_name: string;
  county_name: string | null;
  total_cases: number;
  total_deaths: number;
  outbreak_declared: boolean;
  status: IDSRReportStatus;
  disease_count: number;
  generated_at: string;
}

export interface IDSRListParams {
  epi_year?: number;
  epi_week?: number;
  status?: IDSRReportStatus;
  county?: number;
  outbreak?: boolean;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export interface IDSRDashboardWeek {
  epi_year: number;
  epi_week: number;
  week_start: string;
  week_end: string;
  has_report: boolean;
  report_id: number | null;
  total_cases: number;
  status: IDSRReportStatus | null;
}

export interface IDSRDashboardPreviousWeek {
  epi_year: number;
  epi_week: number;
  week_start: string;
  has_report: boolean;
  total_cases: number;
  status: IDSRReportStatus | null;
}

export interface IDSRDashboard {
  current_week: IDSRDashboardWeek;
  previous_weeks: IDSRDashboardPreviousWeek[];
  total_reports_this_year: number;
  pending_submission: number;
  submitted_this_month: number;
  outbreak_weeks: number;
}

export interface IDSRDHIS2Preview {
  report_id: number;
  week_label: string;
  payload: Record<string, unknown>;
}

export interface IDSRSubmitResponse {
  report: IDSRWeeklyReport;
  dhis2_response: Record<string, unknown>;
}
