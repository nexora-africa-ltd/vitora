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

export interface NotifiableDiseaseListItem {
  id: number;
  name: string;
  category: NotifiableDiseaseCategory;
  reporting_hours: number;
  is_immediate: boolean;
  is_active: boolean;
}

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

export interface NotifiableCaseDetail {
  id: number;
  disease: number;
  disease_name: string;
  disease_category: NotifiableDiseaseCategory;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  diagnosis: number | null;
  onset_date: string | null;
  severity: NotifiableCaseSeverity;
  outcome: NotifiableCaseOutcome;
  laboratory_confirmed: boolean;
  lab_result_date: string | null;
  notification_status: NotifiableCaseStatus;
  detected_at: string;
  notified_at: string | null;
  notification_deadline: string | null;
  is_overdue: boolean;
  hours_until_deadline: number;
  is_immediate: boolean;
  county: number | null;
  county_name: string | null;
  sub_county: number | null;
  sub_county_name: string | null;
  contact_tracing_initiated: boolean;
  contacts_identified: number;
  investigation_notes: string;
  reported_by: number | null;
  reported_by_name: string | null;
  notified_by: number | null;
  notified_by_name: string | null;
  created_at: string;
  updated_at: string;
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

export interface SurveillanceAlert {
  id: number;
  case: number;
  case_disease_name: string;
  case_patient_mrn: string;
  case_county: string | null;
  alert_type: string;
  message: string;
  is_acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  sent_via_websocket: boolean;
  sent_via_sms: boolean;
  sent_via_email: boolean;
  created_at: string;
}

export interface SurveillanceAlertListItem {
  id: number;
  case: number;
  case_disease_name: string;
  case_patient_mrn: string;
  alert_type: string;
  message: string;
  is_acknowledged: boolean;
  created_at: string;
}

export interface OutbreakThreshold {
  id: number;
  disease: number;
  disease_name: string;
  county: number | null;
  county_name: string | null;
  case_threshold: number;
  period_days: number;
  is_active: boolean;
  threshold_status: {
    is_exceeded: boolean;
    current_count: number;
    threshold: number;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Simplified threshold object returned by the /exceeded/ endpoint.
 * Only includes exceeded thresholds with computed status.
 */
export interface ExceededThreshold {
  id: number;
  disease: string; // Disease name (not ID)
  county: string; // County name or "National"
  threshold: number;
  current_count: number;
  period_days: number;
}

export interface SurveillanceDashboard {
  total_active_cases: number;
  immediate_cases_pending: number;
  overdue_notifications: number;
  cases_today: number;
  cases_this_week: number;
  outbreak_alerts: number;
  top_diseases: Array<{ name: string; count: number }>;
  cases_by_county: Array<{ county: string; count: number }>;
}

export interface CountyReport {
  county_id: number;
  county_name: string;
  period_start: string;
  period_end: string;
  cases_by_disease: Array<{
    disease: string;
    category: string;
    total: number;
    lab_confirmed: number;
  }>;
  total_cases: number;
  pending_notifications: number;
  overdue_notifications: number;
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

// ============================================================================
// IHR (International Health Regulations) Notification Types
// ============================================================================

export type IHRUrgency = 'EMERGENCY' | 'URGENT' | 'ROUTINE';

export type IHRNotificationStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'SUBMITTED_COUNTY'
  | 'ESCALATED_NATIONAL'
  | 'NOTIFIED_WHO'
  | 'ACKNOWLEDGED'
  | 'CLOSED'
  | 'REJECTED';

export interface IHRNotificationListItem {
  id: number;
  disease: number;
  disease_name: string;
  urgency: IHRUrgency;
  status: IHRNotificationStatus;
  notification_reference: string;
  cases_count: number;
  deaths_count: number;
  county_name: string | null;
  report_date: string;
  is_overdue: boolean;
  hours_since_detection: number | null;
  event_date: string;
}

export interface IHRNotificationDetail {
  id: number;
  disease: number;
  disease_name: string;
  disease_category: NotifiableDiseaseCategory;
  case: number | null;
  case_id: number | null;
  patient: number | null;
  patient_name: string | null;
  patient_mrn: string | null;
  event_description: string;
  event_date: string;
  urgency: IHRUrgency;
  annex2_criteria: Record<string, unknown>;
  is_annex2_positive: boolean;
  cases_count: number;
  deaths_count: number;
  affected_area: string;
  county: number | null;
  county_name: string | null;
  sub_county: number | null;
  sub_county_name: string | null;
  status: IHRNotificationStatus;
  notification_reference: string;
  is_escalated: boolean;
  is_who_notified: boolean;
  hours_since_detection: number | null;
  is_overdue: boolean;
  reported_by: number | null;
  reported_by_name: string | null;
  report_date: string;
  county_notified_at: string | null;
  county_reviewed_by: number | null;
  county_reviewed_by_name: string | null;
  county_notes: string;
  national_notified_at: string | null;
  national_reviewed_by: number | null;
  national_reviewed_by_name: string | null;
  national_notes: string;
  who_notified_at: string | null;
  who_reference_number: string;
  who_acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_notes: string;
  risk_assessment: string;
  response_measures: string;
  created_at: string;
  updated_at: string;
}

export interface IHRNotificationListParams {
  search?: string;
  status?: IHRNotificationStatus;
  urgency?: IHRUrgency;
  disease?: number;
  county?: number;
  reported_after?: string;
  reported_before?: string;
  is_annex2_positive?: boolean;
  page?: number;
  page_size?: number;
}

export interface IHRNotificationCreateData {
  disease: number;
  case?: number | null;
  patient?: number | null;
  event_description: string;
  event_date: string;
  urgency: IHRUrgency;
  annex2_criteria?: Record<string, unknown>;
  is_annex2_positive?: boolean;
  cases_count?: number;
  deaths_count?: number;
  affected_area?: string;
  county?: number | null;
  sub_county?: number | null;
  risk_assessment?: string;
  response_measures?: string;
}

export interface IHRDashboard {
  total: number;
  pending: number;
  at_county: number;
  at_national: number;
  notified_who: number;
  closed: number;
  rejected: number;
  overdue: number;
  by_urgency: Array<{ urgency: IHRUrgency; count: number }>;
  by_disease: Array<{ disease: string; count: number }>;
}
