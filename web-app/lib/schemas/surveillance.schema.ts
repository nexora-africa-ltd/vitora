/**
 * Zod schemas for Surveillance API response validation.
 */
import { z } from 'zod';

export const NotifiableDiseaseCategorySchema = z.enum([
  'IMMEDIATE',
  'WEEKLY',
  'MONTHLY',
]);

export const NotifiableDiseaseListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: NotifiableDiseaseCategorySchema,
  reporting_hours: z.number(),
  is_immediate: z.boolean(),
  is_active: z.boolean(),
});

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

export const NotifiableCaseDetailSchema = z.object({
  id: z.number(),
  disease: z.number(),
  disease_name: z.string(),
  disease_category: NotifiableDiseaseCategorySchema,
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().nullable(),
  diagnosis: z.number().nullable(),
  onset_date: z.string().nullable(),
  severity: NotifiableCaseSeveritySchema,
  outcome: NotifiableCaseOutcomeSchema,
  laboratory_confirmed: z.boolean(),
  lab_result_date: z.string().nullable(),
  notification_status: NotifiableCaseStatusSchema,
  detected_at: z.string(),
  notified_at: z.string().nullable(),
  notification_deadline: z.string().nullable(),
  is_overdue: z.boolean(),
  hours_until_deadline: z.number(),
  is_immediate: z.boolean(),
  county: z.number().nullable(),
  county_name: z.string().nullable(),
  sub_county: z.number().nullable(),
  sub_county_name: z.string().nullable(),
  contact_tracing_initiated: z.boolean(),
  contacts_identified: z.number(),
  investigation_notes: z.string(),
  reported_by: z.number().nullable(),
  reported_by_name: z.string().nullable(),
  notified_by: z.number().nullable(),
  notified_by_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedNotifiableCaseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(NotifiableCaseListSchema),
});


export const SurveillanceAlertTypeSchema = z.enum([
  'NEW_CASE',
  'OVERDUE',
  'OUTBREAK',
  'CASE_UPDATE',
]);

export const SurveillanceAlertListSchema = z.object({
  id: z.number(),
  case: z.number(),
  case_disease_name: z.string(),
  case_patient_mrn: z.string(),
  alert_type: SurveillanceAlertTypeSchema,
  message: z.string(),
  is_acknowledged: z.boolean(),
  created_at: z.string(),
});

export const PaginatedSurveillanceAlertSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SurveillanceAlertListSchema),
});

/**
 * Array of alerts (used by /unacknowledged/ endpoint which returns a plain array).
 */
export const SurveillanceAlertListArraySchema = z.array(SurveillanceAlertListSchema);

export const SurveillanceDashboardSchema = z.object({
  total_active_cases: z.number(),
  immediate_cases_pending: z.number(),
  overdue_notifications: z.number(),
  cases_today: z.number(),
  cases_this_week: z.number(),
  outbreak_alerts: z.number(),
  top_diseases: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
  cases_by_county: z.array(
    z.object({
      county: z.string(),
      count: z.number(),
    })
  ),
});

export const OutbreakThresholdSchema = z.object({
  id: z.number(),
  disease: z.number(),
  disease_name: z.string(),
  county: z.number().nullable(),
  county_name: z.string().nullable(),
  case_threshold: z.number(),
  period_days: z.number(),
  is_active: z.boolean(),
  threshold_status: z.object({
    is_exceeded: z.boolean(),
    current_count: z.number(),
    threshold: z.number(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedOutbreakThresholdSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(OutbreakThresholdSchema),
});

/**
 * Simplified threshold object returned by the /exceeded/ endpoint.
 */
export const ExceededThresholdSchema = z.object({
  id: z.number(),
  disease: z.string(),
  county: z.string(),
  threshold: z.number(),
  current_count: z.number(),
  period_days: z.number(),
});

export const ExceededThresholdListSchema = z.array(ExceededThresholdSchema);

export const CountyReportSchema = z.object({
  county_id: z.number(),
  county_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  cases_by_disease: z.array(
    z.object({
      disease: z.string(),
      category: z.string(),
      total: z.number(),
      lab_confirmed: z.number(),
    })
  ),
  total_cases: z.number(),
  pending_notifications: z.number(),
  overdue_notifications: z.number(),
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

// ============================================================================
// IHR (International Health Regulations) Notification Schemas
// ============================================================================

export const IHRUrgencySchema = z.enum(['EMERGENCY', 'URGENT', 'ROUTINE']);

export const IHRNotificationStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'SUBMITTED_COUNTY',
  'ESCALATED_NATIONAL',
  'NOTIFIED_WHO',
  'ACKNOWLEDGED',
  'CLOSED',
  'REJECTED',
]);

export const IHRNotificationListSchema = z.object({
  id: z.number(),
  disease: z.number(),
  disease_name: z.string(),
  urgency: IHRUrgencySchema,
  status: IHRNotificationStatusSchema,
  notification_reference: z.string(),
  cases_count: z.number(),
  deaths_count: z.number(),
  county_name: z.string().nullable(),
  report_date: z.string(),
  is_overdue: z.boolean(),
  hours_since_detection: z.number().nullable(),
  event_date: z.string(),
});

export const IHRNotificationDetailSchema = z.object({
  id: z.number(),
  disease: z.number(),
  disease_name: z.string(),
  disease_category: NotifiableDiseaseCategorySchema,
  case: z.number().nullable(),
  case_id: z.number().nullable(),
  patient: z.number().nullable(),
  patient_name: z.string().nullable(),
  patient_mrn: z.string().nullable(),
  event_description: z.string(),
  event_date: z.string(),
  urgency: IHRUrgencySchema,
  annex2_criteria: z.record(z.unknown()),
  is_annex2_positive: z.boolean(),
  cases_count: z.number(),
  deaths_count: z.number(),
  affected_area: z.string(),
  county: z.number().nullable(),
  county_name: z.string().nullable(),
  sub_county: z.number().nullable(),
  sub_county_name: z.string().nullable(),
  status: IHRNotificationStatusSchema,
  notification_reference: z.string(),
  is_escalated: z.boolean(),
  is_who_notified: z.boolean(),
  hours_since_detection: z.number().nullable(),
  is_overdue: z.boolean(),
  reported_by: z.number().nullable(),
  reported_by_name: z.string().nullable(),
  report_date: z.string(),
  county_notified_at: z.string().nullable(),
  county_reviewed_by: z.number().nullable(),
  county_reviewed_by_name: z.string().nullable(),
  county_notes: z.string(),
  national_notified_at: z.string().nullable(),
  national_reviewed_by: z.number().nullable(),
  national_reviewed_by_name: z.string().nullable(),
  national_notes: z.string(),
  who_notified_at: z.string().nullable(),
  who_reference_number: z.string(),
  who_acknowledged_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  resolution_notes: z.string(),
  risk_assessment: z.string(),
  response_measures: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedIHRNotificationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(IHRNotificationListSchema),
});

export const IHRDashboardSchema = z.object({
  total: z.number(),
  pending: z.number(),
  at_county: z.number(),
  at_national: z.number(),
  notified_who: z.number(),
  closed: z.number(),
  rejected: z.number(),
  overdue: z.number(),
  by_urgency: z.array(
    z.object({
      urgency: IHRUrgencySchema,
      count: z.number(),
    })
  ),
  by_disease: z.array(
    z.object({
      disease: z.string(),
      count: z.number(),
    })
  ),
});

export type NotifiableCaseListSchemaType = z.infer<typeof NotifiableCaseListSchema>;
export type NotifiableCaseDetailSchemaType = z.infer<typeof NotifiableCaseDetailSchema>;
export type PaginatedNotifiableCaseSchemaType = z.infer<typeof PaginatedNotifiableCaseSchema>;
export type SurveillanceAlertListSchemaType = z.infer<typeof SurveillanceAlertListSchema>;
export type PaginatedSurveillanceAlertSchemaType = z.infer<typeof PaginatedSurveillanceAlertSchema>;
export type OutbreakThresholdSchemaType = z.infer<typeof OutbreakThresholdSchema>;
export type PaginatedOutbreakThresholdSchemaType = z.infer<typeof PaginatedOutbreakThresholdSchema>;
export type SurveillanceDashboardSchemaType = z.infer<typeof SurveillanceDashboardSchema>;
export type CountyReportSchemaType = z.infer<typeof CountyReportSchema>;
export type IDSRWeeklyReportSchemaType = z.infer<typeof IDSRWeeklyReportSchema>;
export type IDSRWeeklyReportListSchemaType = z.infer<typeof IDSRWeeklyReportListSchema>;
export type IDSRDashboardSchemaType = z.infer<typeof IDSRDashboardSchema>;
export type IDSRDHIS2PreviewSchemaType = z.infer<typeof IDSRDHIS2PreviewSchema>;
export type IDSRSubmitResponseSchemaType = z.infer<typeof IDSRSubmitResponseSchema>;
export type IHRNotificationListSchemaType = z.infer<typeof IHRNotificationListSchema>;
export type IHRNotificationDetailSchemaType = z.infer<typeof IHRNotificationDetailSchema>;
export type PaginatedIHRNotificationSchemaType = z.infer<typeof PaginatedIHRNotificationSchema>;
export type IHRDashboardSchemaType = z.infer<typeof IHRDashboardSchema>;
