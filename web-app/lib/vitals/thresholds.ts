/**
 * Shared Vital Sign Thresholds
 *
 * Clinical default thresholds for vital sign alerting.
 * Used by both triage and encounter modules.
 *
 * @module lib/vitals/thresholds
 */

import type { VitalType, VitalThreshold, VitalInputThresholds, VitalRanges } from './types';

// =============================================================================
// DEFAULT CLINICAL THRESHOLDS
// =============================================================================

/**
 * Clinical default thresholds matching backend TriageVitalThreshold.get_defaults()
 * Based on standard clinical guidelines
 */
export const DEFAULT_THRESHOLDS: Record<VitalType, VitalThreshold> = {
  SPO2: {
    vital_type: 'SPO2',
    critical_low: 90,
    warning_low: 95,
    warning_high: null,
    critical_high: null,
    is_active: true,
  },
  SYSTOLIC_BP: {
    vital_type: 'SYSTOLIC_BP',
    critical_low: 90,
    warning_low: 100,
    warning_high: 140,
    critical_high: 180,
    is_active: true,
  },
  DIASTOLIC_BP: {
    vital_type: 'DIASTOLIC_BP',
    critical_low: null,
    warning_low: null,
    warning_high: 90,
    critical_high: 120,
    is_active: true,
  },
  HEART_RATE: {
    vital_type: 'HEART_RATE',
    critical_low: 40,
    warning_low: 50,
    warning_high: 100,
    critical_high: 150,
    is_active: true,
  },
  TEMPERATURE: {
    vital_type: 'TEMPERATURE',
    critical_low: 32.0,   // Severe hypothermia (<32°C)
    warning_low: 36.0,    // Mild hypothermia (35-36°C), Moderate (32-35°C)
    warning_high: 37.5,   // Low-grade fever (37.6-38.4°C), Moderate (38.5-39.9°C)
    critical_high: 40.0,  // High fever / Hyperpyrexia (≥40°C)
    is_active: true,
  },
  RESPIRATORY_RATE: {
    vital_type: 'RESPIRATORY_RATE',
    critical_low: 8,
    warning_low: 10,
    warning_high: 24,
    critical_high: 30,
    is_active: true,
  },
  MENTAL_STATUS: {
    vital_type: 'MENTAL_STATUS',
    critical_low: null,
    warning_low: null,
    warning_high: null,
    critical_high: null,
    is_active: false,
  },
  PAIN_SCORE: {
    vital_type: 'PAIN_SCORE',
    critical_low: null,
    warning_low: null,
    warning_high: 7,  // Significant pain threshold
    critical_high: 9, // Severe pain threshold
    is_active: true,
  },
  GENERAL: {
    vital_type: 'GENERAL',
    critical_low: null,
    warning_low: null,
    warning_high: null,
    critical_high: null,
    is_active: false,
  },
};

// =============================================================================
// INPUT THRESHOLDS (for VitalInputWithAlert component)
// =============================================================================

/**
 * Input-level thresholds with display metadata
 * Used by VitalInputWithAlert for inline color-coding
 */
export const INPUT_THRESHOLDS: Record<string, VitalInputThresholds> = {
  temperature: {
    criticalLow: 32,
    criticalHigh: 40,
    warningLow: 36,
    warningHigh: 37.5,
    unit: '°C',
    normalRange: '36-37.5°C',
  },
  heart_rate: {
    criticalLow: 40,
    criticalHigh: 150,
    warningLow: 50,
    warningHigh: 100,
    unit: 'bpm',
    normalRange: '60-100 bpm',
  },
  pulse: {
    criticalLow: 40,
    criticalHigh: 150,
    warningLow: 50,
    warningHigh: 100,
    unit: 'bpm',
    normalRange: '60-100 bpm',
  },
  spo2: {
    emergencyLow: 85,
    criticalLow: 90,
    warningLow: 95,
    unit: '%',
    normalRange: '95-100%',
  },
  systolic_bp: {
    criticalLow: 90,
    criticalHigh: 180,
    warningLow: 100,
    warningHigh: 140,
    unit: 'mmHg',
    normalRange: '90-120 mmHg',
  },
  blood_pressure_systolic: {
    criticalLow: 90,
    criticalHigh: 180,
    warningLow: 100,
    warningHigh: 140,
    unit: 'mmHg',
    normalRange: '90-120 mmHg',
  },
  diastolic_bp: {
    criticalLow: 60,
    criticalHigh: 120,
    warningLow: 70,
    warningHigh: 90,
    unit: 'mmHg',
    normalRange: '60-80 mmHg',
  },
  blood_pressure_diastolic: {
    criticalLow: 60,
    criticalHigh: 120,
    warningLow: 70,
    warningHigh: 90,
    unit: 'mmHg',
    normalRange: '60-80 mmHg',
  },
  respiratory_rate: {
    criticalLow: 8,
    criticalHigh: 30,
    warningLow: 10,
    warningHigh: 24,
    unit: '/min',
    normalRange: '12-20/min',
  },
};

// =============================================================================
// INPUT VALIDATION RANGES
// =============================================================================

/**
 * Clinical ranges for input validation (not alerting)
 * Uses `as const` for type safety when accessing specific fields
 */
export const VITAL_RANGES = {
  temperature: { min: 30, max: 45, normalMin: 36.5, normalMax: 37.5, unit: '°C' },
  pulse: { min: 20, max: 250, normalMin: 60, normalMax: 100, unit: 'bpm' },
  heart_rate: { min: 20, max: 250, normalMin: 60, normalMax: 100, unit: 'bpm' },
  blood_pressure_systolic: { min: 50, max: 300, normalMin: 90, normalMax: 120, unit: 'mmHg' },
  systolic_bp: { min: 50, max: 300, normalMin: 90, normalMax: 120, unit: 'mmHg' },
  blood_pressure_diastolic: { min: 30, max: 200, normalMin: 60, normalMax: 80, unit: 'mmHg' },
  diastolic_bp: { min: 30, max: 200, normalMin: 60, normalMax: 80, unit: 'mmHg' },
  respiratory_rate: { min: 5, max: 60, normalMin: 12, normalMax: 20, unit: '/min' },
  spo2: { min: 50, max: 100, normalMin: 95, normalMax: 100, unit: '%' },
  weight: { min: 0.3, max: 500, unit: 'kg' },
  height: { min: 20, max: 300, unit: 'cm' },
  pain_score: { min: 0, max: 10, unit: '' },
} as const;

// =============================================================================
// AGE-SPECIFIC THRESHOLDS
// =============================================================================

/**
 * Age group classification (mirrors types/triage.ts AgeGroup)
 */
type AgeGroupKey = 'neonate' | 'infant' | 'young_child' | 'school_age' | 'adolescent' | 'adult';

/**
 * Pediatric vital sign thresholds by age group.
 * Heart rate, respiratory rate, and temperature have clinically different
 * normal ranges in children vs adults.
 *
 * Sources: WHO ETAT, Kenya Emergency Triage Assessment (KETA),
 * Nelson Textbook of Pediatrics reference ranges.
 */
const PEDIATRIC_INPUT_THRESHOLDS: Record<string, Record<string, VitalInputThresholds>> = {
  neonate: {
    heart_rate:       { criticalLow: 80,  criticalHigh: 200, warningLow: 100, warningHigh: 160, unit: 'bpm',  normalRange: '100-160 bpm' },
    respiratory_rate: { criticalLow: 20,  criticalHigh: 70,  warningLow: 30,  warningHigh: 60,  unit: '/min', normalRange: '30-60/min' },
    temperature:      { criticalLow: 32,  criticalHigh: 40,  warningLow: 36.5,warningHigh: 37.5,unit: '°C',   normalRange: '36.5-37.5°C' },
  },
  infant: {
    heart_rate:       { criticalLow: 80,  criticalHigh: 190, warningLow: 100, warningHigh: 150, unit: 'bpm',  normalRange: '100-150 bpm' },
    respiratory_rate: { criticalLow: 15,  criticalHigh: 60,  warningLow: 25,  warningHigh: 50,  unit: '/min', normalRange: '25-50/min' },
    temperature:      { criticalLow: 32,  criticalHigh: 40,  warningLow: 36,  warningHigh: 37.5,unit: '°C',   normalRange: '36.0-37.5°C' },
  },
  young_child: {
    heart_rate:       { criticalLow: 60,  criticalHigh: 170, warningLow: 80,  warningHigh: 130, unit: 'bpm',  normalRange: '80-130 bpm' },
    respiratory_rate: { criticalLow: 12,  criticalHigh: 40,  warningLow: 20,  warningHigh: 30,  unit: '/min', normalRange: '20-30/min' },
    temperature:      { criticalLow: 32,  criticalHigh: 40,  warningLow: 36,  warningHigh: 37.5,unit: '°C',   normalRange: '36.0-37.5°C' },
  },
  school_age: {
    heart_rate:       { criticalLow: 50,  criticalHigh: 150, warningLow: 70,  warningHigh: 110, unit: 'bpm',  normalRange: '70-110 bpm' },
    respiratory_rate: { criticalLow: 10,  criticalHigh: 35,  warningLow: 18,  warningHigh: 25,  unit: '/min', normalRange: '18-25/min' },
    temperature:      { criticalLow: 32,  criticalHigh: 40,  warningLow: 36,  warningHigh: 37.5,unit: '°C',   normalRange: '36.0-37.5°C' },
  },
};

/**
 * Get age-adjusted INPUT_THRESHOLDS.
 * Returns standard adult thresholds merged with pediatric overrides for
 * heart_rate, respiratory_rate, and temperature.
 * SpO2 and BP thresholds are the same across all age groups.
 */
export function getAgeAdjustedInputThresholds(ageGroup: string | null): Record<string, VitalInputThresholds> {
  if (!ageGroup || ageGroup === 'adult' || ageGroup === 'adolescent') {
    return INPUT_THRESHOLDS;
  }
  const overrides = PEDIATRIC_INPUT_THRESHOLDS[ageGroup];
  if (!overrides) return INPUT_THRESHOLDS;
  return { ...INPUT_THRESHOLDS, ...overrides };
}

/**
 * Get age-specific normal range hint for a vital sign.
 * Returns a string like "Normal (infant): 100-150 bpm" for pediatric patients,
 * or the standard adult range string for adults/adolescents.
 */
export function getVitalRangeHint(
  vitalKey: string,
  ageGroup?: string | null,
): string {
  const adultThreshold = INPUT_THRESHOLDS[vitalKey];
  if (!ageGroup || ageGroup === 'adult' || ageGroup === 'adolescent') {
    return adultThreshold ? `Normal: ${adultThreshold.normalRange}` : '';
  }
  const override = PEDIATRIC_INPUT_THRESHOLDS[ageGroup]?.[vitalKey];
  if (override) {
    return `Normal (${ageGroup}): ${override.normalRange}`;
  }
  return adultThreshold ? `Normal: ${adultThreshold.normalRange}` : '';
}

/**
 * Age-appropriate placeholder values for vital sign inputs.
 * Returns a typical mid-normal value for the given age group so that
 * input fields show clinically relevant examples.
 *
 * Keys use the standard vital field names:
 * temperature, pulse (heart_rate), respiratory_rate, spo2,
 * blood_pressure_systolic, blood_pressure_diastolic, weight, height
 */
const AGE_PLACEHOLDERS: Record<AgeGroupKey, Record<string, string>> = {
  neonate:     { temperature: '36.8', pulse: '130', respiratory_rate: '40', spo2: '97', blood_pressure_systolic: '70',  blood_pressure_diastolic: '45', weight: '3.5',  height: '50' },
  infant:      { temperature: '37.0', pulse: '120', respiratory_rate: '35', spo2: '97', blood_pressure_systolic: '85',  blood_pressure_diastolic: '55', weight: '8',    height: '70' },
  young_child: { temperature: '37.0', pulse: '100', respiratory_rate: '25', spo2: '98', blood_pressure_systolic: '95',  blood_pressure_diastolic: '60', weight: '15',   height: '95' },
  school_age:  { temperature: '36.8', pulse: '90',  respiratory_rate: '20', spo2: '98', blood_pressure_systolic: '105', blood_pressure_diastolic: '65', weight: '30',   height: '130' },
  adolescent:  { temperature: '36.5', pulse: '75',  respiratory_rate: '16', spo2: '98', blood_pressure_systolic: '115', blood_pressure_diastolic: '70', weight: '55',   height: '165' },
  adult:       { temperature: '36.5', pulse: '72',  respiratory_rate: '16', spo2: '98', blood_pressure_systolic: '120', blood_pressure_diastolic: '80', weight: '70',   height: '170' },
};

/**
 * Alias map for vital field names across modules.
 * Triage uses heart_rate / systolic_bp / diastolic_bp;
 * encounter and inpatient use pulse / blood_pressure_systolic / blood_pressure_diastolic.
 */
const VITAL_KEY_ALIASES: Record<string, string> = {
  heart_rate: 'pulse',
  systolic_bp: 'blood_pressure_systolic',
  diastolic_bp: 'blood_pressure_diastolic',
};

/**
 * Get an age-appropriate placeholder value for a vital sign input field.
 *
 * @param vitalKey - The vital field name (e.g. 'temperature', 'pulse', 'heart_rate', 'respiratory_rate')
 * @param ageGroup - The patient's age group, or null/undefined for adult defaults
 * @returns A placeholder string (e.g. "130" for neonate pulse)
 */
export function getVitalPlaceholder(
  vitalKey: string,
  ageGroup?: string | null,
): string {
  const key = VITAL_KEY_ALIASES[vitalKey] ?? vitalKey;
  const group: AgeGroupKey = (ageGroup as AgeGroupKey) || 'adult';
  const placeholders = AGE_PLACEHOLDERS[group] ?? AGE_PLACEHOLDERS.adult;
  return placeholders[key] ?? AGE_PLACEHOLDERS.adult[key] ?? '';
}
