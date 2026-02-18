/**
 * Triage Module Components
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @module components/triage
 */

export { TriageCategoryBadge, triageBadgeVariants } from './triage-category-badge';
export type { TriageCategoryBadgeProps, BadgeCategory } from './triage-category-badge';

export { VitalAlertsPanel } from './vital-alerts-panel';
export type { VitalAlertsPanelProps, AlertItemProps } from './vital-alerts-panel';

export { TriageAssessmentForm } from './triage-assessment-form';
export type { TriageAssessmentFormProps } from './triage-assessment-form';

export { TriageQueueDashboard } from './triage-queue-dashboard';
export type { TriageQueueDashboardProps } from './triage-queue-dashboard';

export { TriageReportsPage } from './triage-reports-page';
export type { TriageReportsPageProps, DateRangePreset, ReportFilters } from './triage-reports-page';

export { TriageThresholdsSettings } from './triage-thresholds-settings';
export type { TriageThresholdsSettingsProps } from './triage-thresholds-settings';

export { RouteToClinicDialog } from './route-to-clinic-dialog';

export { AlreadyTriagedWarning } from './already-triaged-warning';
export type { AlreadyTriagedWarningProps } from './already-triaged-warning';
