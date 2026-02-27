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
