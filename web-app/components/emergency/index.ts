/**
 * Emergency Module Components
 *
 * Exports for the Emergency Department module.
 */

export { CriticalAlertBanner, type CriticalPatientInfo } from './critical-alert-banner';
export { CriticalAlertSkeleton } from './critical-alert-skeleton';
export { ZoneCard, ZoneCardSkeleton, type ZoneData } from './zone-card';
export { EmergencyAlertsProvider, useEmergencyAlerts } from './alerts-provider';
export { EscalationDialog } from './escalation-dialog';
export { WaitTimeBreachBanner, BreachBannerSkeleton } from './breach-alert-banner';
