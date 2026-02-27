/**
 * Shared Vital Signs Zod Schema
 *
 * Unified validation schema for vitals used across triage and encounter modules.
 *
 * @module lib/vitals/schema
 */

import { z } from 'zod';
import { VITAL_RANGES } from './thresholds';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create nullable number field with validation
 */
const nullableNumber = (min: number, max: number, fieldName: string) =>
  z.union([
    z.number()
      .min(min, `${fieldName} must be at least ${min}`)
      .max(max, `${fieldName} must be at most ${max}`),
    z.null(),
  ]).optional().default(null);

// =============================================================================
// VITALS SCHEMA (Encounter Form)
// =============================================================================

/**
 * Vitals form schema for encounter module
 * Uses pulse as field name (not heart_rate)
 */
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

// =============================================================================
// TRIAGE VITALS SCHEMA
// =============================================================================

/**
 * Triage vitals schema
 * Uses heart_rate as field name (not pulse) for consistency with triage API
 */
export const triageVitalsSchema = z.object({
  temperature: z.union([
    z.literal(null),
    z.number().min(30, 'Must be 30-45°C').max(45, 'Must be 30-45°C'),
  ]).nullable().optional(),
  heart_rate: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-300').max(300, 'Must be 0-300'),
  ]).nullable().optional(),
  systolic_bp: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-300').max(300, 'Must be 0-300'),
  ]).nullable().optional(),
  diastolic_bp: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-200').max(200, 'Must be 0-200'),
  ]).nullable().optional(),
  spo2: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-100%').max(100, 'Must be 0-100%'),
  ]).nullable().optional(),
  respiratory_rate: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-60').max(60, 'Must be 0-60'),
  ]).nullable().optional(),
  weight: z.union([
    z.literal(null),
    z.number().min(0, 'Must be positive').max(500, 'Must be < 500kg'),
  ]).nullable().optional(),
  height: z.union([
    z.literal(null),
    z.number().min(0, 'Must be positive').max(300, 'Must be < 300cm'),
  ]).nullable().optional(),
});

export type TriageVitalsFormValues = z.infer<typeof triageVitalsSchema>;
