/**
 * Vitals form components index
 * Re-exports all vitals-related components and types
 */

export { VitalsForm, default } from './vitals-form';
export { VitalInput, BloodPressureInput } from './vital-input';
export { VitalsInputSection } from './vitals-input-section';
export { VitalsDisplay } from './vitals-display';
export { VitalsAlerts } from './vitals-alerts';
export {
  vitalsSchema,
  type VitalsFormValues,
  type VitalAlertSeverity,
  VITAL_RANGES,
} from './vitals-schema';

// Re-export shared threshold hook and types
export {
  useVitalThresholds,
  evaluateVitals,
  getFieldStatus,
  calculateMAP,
  DEFAULT_THRESHOLDS,
  type VitalAlert,
  type VitalValues,
} from '@/lib/hooks/use-vital-thresholds';
