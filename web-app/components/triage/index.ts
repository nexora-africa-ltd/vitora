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

export { AIRiskAssessmentPanel } from './ai-risk-assessment-panel';
export type { AIRiskAssessmentPanelProps } from './ai-risk-assessment-panel';

export { TriageAssessmentEditForm } from './triage-assessment-edit-form';
export type { TriageEditPermissions } from './triage-assessment-edit-form';

export { TriageQueueDashboard } from './triage-queue-dashboard';
export type { TriageQueueDashboardProps } from './triage-queue-dashboard';

export { TriageReportsPage } from './triage-reports-page';
export type { TriageReportsPageProps, DateRangePreset, ReportFilters } from './triage-reports-page';

export { TriageThresholdsSettings } from './triage-thresholds-settings';
export type { TriageThresholdsSettingsProps } from './triage-thresholds-settings';

export { RouteToClinicDialog } from './route-to-clinic-dialog';

export { RouteToEmergencyDialog } from './route-to-emergency-dialog';

export { AlreadyTriagedWarning } from './already-triaged-warning';
export type { AlreadyTriagedWarningProps } from './already-triaged-warning';

export { TriageInProgressWarning } from './triage-in-progress-warning';
export type { TriageInProgressWarningProps } from './triage-in-progress-warning';

export { TriageAssessTabs } from './triage-assess-tabs';

// Enhanced triage UI components (Sprint 1.6)
export { PainScoreSlider, getPainSeverity } from './pain-score-slider';
export type { PainScoreSliderProps } from './pain-score-slider';

export { AVPUCardGroup } from './avpu-card-group';
export type { AVPUCardGroupProps } from './avpu-card-group';

export {
  VitalInputWithAlert,
  evaluateVitalSeverity,
  DEFAULT_THRESHOLDS,
} from './vital-input-with-alert';
export type {
  VitalInputWithAlertProps,
  VitalThresholds,
  AlertSeverity,
} from './vital-input-with-alert';

export { TriageDashboardStats } from './triage-dashboard-stats';
