/**
 * Zod validation schema for vital signs
 * Includes clinical ranges and validation messages
 *
 * NOTE: Alert thresholds are now managed by useVitalThresholds hook
 * which fetches from backend with fallback to defaults.
 */
import { z } from 'zod';

// Re-export from shared hook for convenience
export {
  useVitalThresholds,
  evaluateVitals,
  getFieldStatus,
  DEFAULT_THRESHOLDS,
  type VitalAlert,
  type VitalValues,
} from '@/lib/hooks/use-vital-thresholds';

// Clinical normal ranges for reference (input validation, not alerting)
export const VITAL_RANGES = {
  temperature: { min: 30, max: 45, normalMin: 36.1, normalMax: 37.2, unit: '°C' },
  pulse: { min: 20, max: 250, normalMin: 60, normalMax: 100, unit: 'bpm' },
  blood_pressure_systolic: { min: 50, max: 300, normalMin: 90, normalMax: 120, unit: 'mmHg' },
  blood_pressure_diastolic: { min: 30, max: 200, normalMin: 60, normalMax: 80, unit: 'mmHg' },
  respiratory_rate: { min: 5, max: 60, normalMin: 12, normalMax: 20, unit: '/min' },
  spo2: { min: 50, max: 100, normalMin: 95, normalMax: 100, unit: '%' },
  weight: { min: 0.3, max: 500, unit: 'kg' },
  height: { min: 20, max: 300, unit: 'cm' },
} as const;

// Nullable number helper
const nullableNumber = (min: number, max: number, fieldName: string) =>
  z.union([
    z.number()
      .min(min, `${fieldName} must be at least ${min}`)
      .max(max, `${fieldName} must be at most ${max}`),
    z.null(),
  ]).optional().default(null);

// Vitals form schema
export const vitalsSchema = z.object({
  temperature: nullableNumber(
    VITAL_RANGES.temperature.min,
    VITAL_RANGES.temperature.max,
    'Temperature'
  ),
  pulse: nullableNumber(
    VITAL_RANGES.pulse.min,
    VITAL_RANGES.pulse.max,
    'Pulse'
  ),
  blood_pressure_systolic: nullableNumber(
    VITAL_RANGES.blood_pressure_systolic.min,
    VITAL_RANGES.blood_pressure_systolic.max,
    'Systolic BP'
  ),
  blood_pressure_diastolic: nullableNumber(
    VITAL_RANGES.blood_pressure_diastolic.min,
    VITAL_RANGES.blood_pressure_diastolic.max,
    'Diastolic BP'
  ),
  respiratory_rate: nullableNumber(
    VITAL_RANGES.respiratory_rate.min,
    VITAL_RANGES.respiratory_rate.max,
    'Respiratory rate'
  ),
  spo2: nullableNumber(
    VITAL_RANGES.spo2.min,
    VITAL_RANGES.spo2.max,
    'SpO₂'
  ),
  weight: nullableNumber(
    VITAL_RANGES.weight.min,
    VITAL_RANGES.weight.max,
    'Weight'
  ),
  height: nullableNumber(
    VITAL_RANGES.height.min,
    VITAL_RANGES.height.max,
    'Height'
  ),
}).refine(
  (data) => {
    // If systolic is provided, diastolic should be too (and vice versa)
    if (data.blood_pressure_systolic !== null && data.blood_pressure_diastolic === null) {
      return false;
    }
    if (data.blood_pressure_diastolic !== null && data.blood_pressure_systolic === null) {
      return false;
    }
    return true;
  },
  {
    message: 'Both systolic and diastolic blood pressure are required together',
    path: ['blood_pressure_systolic'],
  }
).refine(
  (data) => {
    // Systolic should be greater than diastolic
    if (data.blood_pressure_systolic !== null && data.blood_pressure_diastolic !== null) {
      return data.blood_pressure_systolic > data.blood_pressure_diastolic;
    }
    return true;
  },
  {
    message: 'Systolic must be greater than diastolic',
    path: ['blood_pressure_systolic'],
  }
);

export type VitalsFormValues = z.infer<typeof vitalsSchema>;

// Re-export alert severity type for compatibility
export type VitalAlertSeverity = 'critical' | 'warning' | 'info';
