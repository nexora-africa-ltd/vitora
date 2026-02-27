/**
 * Shared Vital Signs Types
 *
 * Unified type definitions for vitals used across triage and encounter modules.
 * This is the single source of truth for vital-related types.
 *
 * @module lib/vitals/types
 */

// =============================================================================
// VITAL TYPES
// =============================================================================

/**
 * Supported vital sign types for threshold evaluation and alerting
 */
export type VitalType =
  | 'SPO2'
  | 'SYSTOLIC_BP'
  | 'DIASTOLIC_BP'
  | 'HEART_RATE'
  | 'TEMPERATURE'
  | 'RESPIRATORY_RATE'
  | 'MENTAL_STATUS'
  | 'PAIN_SCORE'
  | 'GENERAL';

/**
 * Alert severity levels for vital sign abnormalities
 */
export type AlertSeverity = 'CRITICAL' | 'WARNING';

/**
 * Lowercase alert severity (for component flexibility)
 */
export type AlertSeverityLower = 'critical' | 'warning';

/**
 * Vital sign alert structure
 */
export interface VitalAlert {
  /** Unique identifier for the alert */
  id?: string;
  /** Form field identifier */
  field: string;
  /** Type of vital sign */
  vital_type: VitalType;
  /** Alert severity level */
  severity: AlertSeverity;
  /** Human-readable alert message */
  message: string;
  /** The actual vital value that triggered the alert */
  value: number;
  /** The threshold that was crossed */
  threshold?: number | null;
  /** Clinical guidance note */
  clinical_note?: string | null;
  /** Suggested actions */
  actions?: string[] | null;
}

/**
 * Input values for vital evaluation
 * Supports both encounter and triage field naming conventions
 */
export interface VitalValues {
  temperature?: number | null;
  pulse?: number | null;  // Encounter form uses 'pulse'
  heart_rate?: number | null;  // Triage uses 'heart_rate'
  blood_pressure_systolic?: number | null;  // Encounter form
  systolic_bp?: number | null;  // Triage
  blood_pressure_diastolic?: number | null;  // Encounter form
  diastolic_bp?: number | null;  // Triage
  respiratory_rate?: number | null;
  spo2?: number | null;
  weight?: number | null;
  height?: number | null;
  pain_score?: number | null;
}

/**
 * Field status for input styling
 */
export type FieldStatus = 'normal' | 'warning' | 'critical';

// =============================================================================
// THRESHOLD TYPES
// =============================================================================

/**
 * Threshold configuration for a vital sign
 */
export interface VitalThreshold {
  vital_type: VitalType;
  critical_low: number | null;
  warning_low: number | null;
  warning_high: number | null;
  critical_high: number | null;
  is_active: boolean;
}

/**
 * Full threshold record from backend
 */
export interface VitalThresholdRecord extends VitalThreshold {
  id: number;
  created_at: string;
  updated_at: string;
}

/**
 * Input-level threshold config (for VitalInput component)
 */
export interface VitalInputThresholds {
  emergencyLow?: number;
  emergencyHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  warningLow?: number;
  warningHigh?: number;
  unit: string;
  normalRange: string;
}

// =============================================================================
// CLINICAL RANGES
// =============================================================================

/**
 * Clinical range configuration for input validation
 */
export interface VitalRange {
  min: number;
  max: number;
  normalMin?: number;
  normalMax?: number;
  unit: string;
}

/**
 * All vital ranges for input validation
 */
export type VitalRanges = Record<string, VitalRange>;
