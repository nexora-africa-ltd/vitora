/**
 * Zod validation schema for vital signs
 *
 * Re-exports from shared @/lib/vitals module for backward compatibility.
 * Schema and validation logic now centralized in lib/vitals.
 */

// Re-export everything from shared vitals module
export {
  vitalsSchema,
  VITAL_RANGES,
  DEFAULT_THRESHOLDS,
  evaluateVitals,
  getFieldStatus,
  type VitalsFormValues,
  type VitalAlert,
  type VitalValues,
  type FieldStatus,
  type AlertSeverity,
} from '@/lib/vitals';

// Re-export hook from hooks module
export { useVitalThresholds } from '@/lib/hooks/use-vital-thresholds';

// Re-export alert severity type for compatibility
export type VitalAlertSeverity = 'critical' | 'warning' | 'info';
