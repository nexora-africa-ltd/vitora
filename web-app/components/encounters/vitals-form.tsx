/**
 * VitalsForm - Re-export from new modular location
 * @deprecated Import from '@/components/encounters/vitals' instead
 */
'use client';

// Re-export everything from the new modular location
export { 
  VitalsForm, 
  default,
  VitalInput,
  BloodPressureInput,
  VitalsDisplay,
  VitalsAlerts,
  vitalsSchema,
  type VitalsFormValues,
  type VitalAlert,
  useVitalThresholds,
  evaluateVitals,
  getFieldStatus,
  VITAL_RANGES,
} from './vitals';
