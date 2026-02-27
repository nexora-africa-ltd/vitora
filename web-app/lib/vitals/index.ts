/**
 * Shared Vital Signs Module
 *
 * Unified types, schemas, thresholds, and alert logic for vitals
 * used across triage and encounter modules.
 *
 * @module lib/vitals
 *
 * @example
 * ```tsx
 * import {
 *   evaluateVitals,
 *   generateVitalAlerts,
 *   getFieldStatus,
 *   DEFAULT_THRESHOLDS,
 *   VITAL_RANGES,
 *   vitalsSchema,
 *   type VitalAlert,
 *   type VitalValues,
 * } from '@/lib/vitals';
 *
 * // Get alerts for current vitals
 * const alerts = evaluateVitals(formValues);
 *
 * // Get field styling status
 * const tempStatus = getFieldStatus('temperature', alerts);
 * ```
 */

// Types
export type {
  VitalType,
  AlertSeverity,
  AlertSeverityLower,
  VitalAlert,
  VitalValues,
  FieldStatus,
  VitalThreshold,
  VitalThresholdRecord,
  VitalInputThresholds,
  VitalRange,
  VitalRanges,
} from './types';

// Thresholds
export {
  DEFAULT_THRESHOLDS,
  INPUT_THRESHOLDS,
  VITAL_RANGES,
} from './thresholds';

// Schemas
export {
  vitalsSchema,
  triageVitalsSchema,
  type VitalsFormValues,
  type TriageVitalsFormValues,
} from './schema';

// Alerts
export {
  checkValueAgainstThreshold,
  evaluateVitalSeverity,
  evaluateVitals,
  generateVitalAlerts,
  getFieldStatus,
  calculateMAP,
} from './alerts';
