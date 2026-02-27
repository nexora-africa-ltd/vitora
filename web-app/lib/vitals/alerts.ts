/**
 * Shared Vital Sign Alert Generation
 *
 * Unified alert evaluation logic for vitals used across triage and encounter modules.
 *
 * @module lib/vitals/alerts
 */

import type {
  VitalType,
  VitalThreshold,
  VitalValues,
  VitalAlert,
  FieldStatus,
  VitalInputThresholds,
  AlertSeverity,
} from './types';
import { DEFAULT_THRESHOLDS } from './thresholds';

// =============================================================================
// THRESHOLD EVALUATION
// =============================================================================

/**
 * Check a vital value against thresholds
 */
export function checkValueAgainstThreshold(
  value: number | null | undefined,
  threshold: Pick<VitalThreshold, 'critical_low' | 'warning_low' | 'warning_high' | 'critical_high' | 'is_active'>
): FieldStatus {
  if (value === null || value === undefined || !threshold.is_active) {
    return 'normal';
  }

  // Check critical thresholds first
  if (threshold.critical_low !== null && value < threshold.critical_low) {
    return 'critical';
  }
  if (threshold.critical_high !== null && value > threshold.critical_high) {
    return 'critical';
  }

  // Check warning thresholds
  if (threshold.warning_low !== null && value < threshold.warning_low) {
    return 'warning';
  }
  if (threshold.warning_high !== null && value > threshold.warning_high) {
    return 'warning';
  }

  return 'normal';
}

/**
 * Evaluate vital severity for input-level thresholds
 * Used by VitalInputWithAlert for inline color-coding
 */
export function evaluateVitalSeverity(
  value: number | null | undefined,
  thresholds: VitalInputThresholds,
  vitalType?: string
): { severity: 'normal' | 'warning' | 'critical' | 'emergency' | null; message: string | null } {
  if (value === null || value === undefined) {
    return { severity: null, message: null };
  }

  const { emergencyLow, emergencyHigh, criticalLow, criticalHigh, warningLow, warningHigh, unit } = thresholds;

  // Check emergency thresholds first (SpO2 ≤85 = severe hypoxemia)
  if (emergencyLow !== undefined && value <= emergencyLow) {
    return {
      severity: 'emergency',
      message: `EMERGENCY: ${value}${unit} - Severe hypoxemia`,
    };
  }
  if (emergencyHigh !== undefined && value >= emergencyHigh) {
    return {
      severity: 'emergency',
      message: `EMERGENCY: ${value}${unit} - Dangerously high`,
    };
  }

  // Special handling for temperature with clinical terminology
  if (vitalType === 'temperature') {
    if (value < 32) {
      return { severity: 'critical', message: `Critical: ${value}${unit} - Severe hypothermia` };
    }
    if (value >= 40) {
      return { severity: 'critical', message: `Critical: ${value}${unit} - High fever / Hyperpyrexia` };
    }
    if (value >= 38.5) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Moderate fever` };
    }
    if (value > 37.5) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Low-grade fever` };
    }
    if (value < 35) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Moderate hypothermia` };
    }
    if (value < 36) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Mild hypothermia` };
    }
    return { severity: 'normal', message: null };
  }

  // Generic threshold checks for other vitals
  if (criticalLow !== undefined && value < criticalLow) {
    return {
      severity: 'critical',
      message: `Critical: ${value}${unit} (< ${criticalLow})`,
    };
  }
  if (criticalHigh !== undefined && value > criticalHigh) {
    return {
      severity: 'critical',
      message: `Critical: ${value}${unit} (> ${criticalHigh})`,
    };
  }
  if (warningLow !== undefined && value < warningLow) {
    return {
      severity: 'warning',
      message: `Warning: ${value}${unit} (< ${warningLow})`,
    };
  }
  if (warningHigh !== undefined && value > warningHigh) {
    return {
      severity: 'warning',
      message: `Warning: ${value}${unit} (> ${warningHigh})`,
    };
  }

  return { severity: 'normal', message: null };
}

// =============================================================================
// CLINICAL ALERT MESSAGES
// =============================================================================

/**
 * Get clinical message for alert
 */
function getAlertMessage(
  vitalType: VitalType,
  value: number,
  status: FieldStatus,
  threshold: Pick<VitalThreshold, 'critical_low' | 'warning_low' | 'warning_high' | 'critical_high'>
): { message: string; clinical_note?: string } {
  const messages: Record<VitalType, { low: { message: string; note?: string }; high: { message: string; note?: string } }> = {
    SPO2: {
      low: {
        message: `SpO₂ ${value}% - ${status === 'critical' ? 'Severe hypoxemia' : 'Below normal'}`,
        note: status === 'critical' ? 'Requires immediate oxygen therapy' : 'Consider supplemental oxygen',
      },
      high: { message: `SpO₂ ${value}%`, note: undefined },
    },
    SYSTOLIC_BP: {
      low: {
        message: `Systolic BP ${value} mmHg - ${status === 'critical' ? 'Severe hypotension' : 'Low'}`,
        note: status === 'critical' ? 'Check for shock, sepsis, or bleeding' : 'Monitor closely',
      },
      high: {
        message: `Systolic BP ${value} mmHg - ${status === 'critical' ? 'Hypertensive crisis' : 'Elevated'}`,
        note: status === 'critical' ? 'Immediate intervention required' : 'Monitor and reassess',
      },
    },
    DIASTOLIC_BP: {
      low: { message: `Diastolic BP ${value} mmHg - Low`, note: undefined },
      high: {
        message: `Diastolic BP ${value} mmHg - ${status === 'critical' ? 'Dangerously elevated' : 'Elevated'}`,
        note: status === 'critical' ? 'Risk of end-organ damage' : undefined,
      },
    },
    HEART_RATE: {
      low: {
        message: `Pulse ${value} bpm - ${status === 'critical' ? 'Severe bradycardia' : 'Bradycardia'}`,
        note: status === 'critical' ? 'Check cardiac rhythm, consider atropine' : 'Monitor for symptoms',
      },
      high: {
        message: `Pulse ${value} bpm - ${status === 'critical' ? 'Severe tachycardia' : 'Tachycardia'}`,
        note: status === 'critical' ? 'Assess for underlying cause' : 'Monitor closely',
      },
    },
    TEMPERATURE: {
      low: {
        message: `Temperature ${value}°C - ${status === 'critical' ? 'Severe hypothermia' : value >= 35 ? 'Mild hypothermia' : 'Moderate hypothermia'}`,
        note: status === 'critical' ? 'Life-threatening; risk of cardiac arrest' : value >= 35 ? 'Usually mild, monitor closely' : 'Symptoms: shivering, confusion, slurred speech',
      },
      high: {
        message: `Temperature ${value}°C - ${status === 'critical' ? 'High fever / Hyperpyrexia' : value >= 38.5 ? 'Moderate fever' : 'Low-grade fever'}`,
        note: status === 'critical' ? 'Potentially life-threatening; urgent evaluation needed' : value >= 38.5 ? 'Clinical attention may be required' : 'Usually mild, often infection-related',
      },
    },
    RESPIRATORY_RATE: {
      low: {
        message: `Respiratory rate ${value}/min - ${status === 'critical' ? 'Respiratory depression' : 'Low'}`,
        note: status === 'critical' ? 'Assess airway, consider reversal agents' : 'Monitor closely',
      },
      high: {
        message: `Respiratory rate ${value}/min - ${status === 'critical' ? 'Respiratory distress' : 'Elevated'}`,
        note: status === 'critical' ? 'Assess for hypoxia, consider oxygen' : 'Investigate cause',
      },
    },
    MENTAL_STATUS: {
      low: { message: 'Altered mental status', note: 'Assess neurological status' },
      high: { message: 'Altered mental status', note: undefined },
    },
    PAIN_SCORE: {
      low: { message: 'Pain assessment', note: undefined },
      high: { message: `Pain score ${value}/10 - ${status === 'critical' ? 'Severe pain' : 'Significant pain'}`, note: status === 'critical' ? 'Consider immediate analgesia' : 'Pain management needed' },
    },
    GENERAL: {
      low: { message: 'Clinical alert', note: undefined },
      high: { message: 'Clinical alert', note: undefined },
    },
  };

  // Determine if low or high
  const isLow = (threshold.critical_low !== null && value < threshold.critical_low) ||
                (threshold.warning_low !== null && value < threshold.warning_low);

  const msgConfig = isLow ? messages[vitalType].low : messages[vitalType].high;
  return {
    message: msgConfig.message,
    clinical_note: msgConfig.note,
  };
}

// =============================================================================
// MAP CALCULATION
// =============================================================================

/**
 * Calculate Mean Arterial Pressure (MAP)
 * MAP = (SBP + 2 × DBP) / 3
 *
 * Normal adult MAP: 70-100 mmHg
 * Critical low: <65 mmHg (inadequate organ perfusion)
 * Critical high: >105 mmHg (hypertensive)
 */
export function calculateMAP(systolic: number | null | undefined, diastolic: number | null | undefined): number | null {
  if (systolic == null || diastolic == null) return null;
  return Math.round((systolic + 2 * diastolic) / 3);
}

/**
 * Get MAP status and alert
 */
function getMAPAlert(
  systolic: number | null | undefined,
  diastolic: number | null | undefined
): VitalAlert | null {
  const map = calculateMAP(systolic, diastolic);
  if (map === null) return null;

  // MAP thresholds (adult defaults)
  const CRITICAL_LOW = 65;
  const WARNING_LOW = 70;
  const WARNING_HIGH = 100;
  const CRITICAL_HIGH = 105;

  if (map < CRITICAL_LOW) {
    return {
      id: 'map-critical-low',
      field: 'blood_pressure',
      vital_type: 'SYSTOLIC_BP',
      severity: 'CRITICAL',
      message: `MAP ${map} mmHg - Severe hypotension`,
      value: map,
      clinical_note: 'Inadequate organ perfusion - immediate intervention required',
    };
  }

  if (map < WARNING_LOW) {
    return {
      id: 'map-warning-low',
      field: 'blood_pressure',
      vital_type: 'SYSTOLIC_BP',
      severity: 'WARNING',
      message: `MAP ${map} mmHg - Low`,
      value: map,
      clinical_note: 'Monitor closely for signs of hypoperfusion',
    };
  }

  if (map > CRITICAL_HIGH) {
    return {
      id: 'map-critical-high',
      field: 'blood_pressure',
      vital_type: 'SYSTOLIC_BP',
      severity: 'CRITICAL',
      message: `MAP ${map} mmHg - Hypertensive emergency`,
      value: map,
      clinical_note: 'Risk of end-organ damage - immediate treatment needed',
    };
  }

  if (map > WARNING_HIGH) {
    return {
      id: 'map-warning-high',
      field: 'blood_pressure',
      vital_type: 'SYSTOLIC_BP',
      severity: 'WARNING',
      message: `MAP ${map} mmHg - Elevated`,
      value: map,
      clinical_note: 'Monitor and reassess',
    };
  }

  return null;
}

// =============================================================================
// MAIN ALERT GENERATION
// =============================================================================

/**
 * Generate alerts for vital values using provided thresholds
 * Includes MAP (Mean Arterial Pressure) calculation
 */
export function evaluateVitals(
  values: VitalValues,
  thresholds: Record<VitalType, Pick<VitalThreshold, 'vital_type' | 'critical_low' | 'warning_low' | 'warning_high' | 'critical_high' | 'is_active'>> = DEFAULT_THRESHOLDS
): VitalAlert[] {
  const alerts: VitalAlert[] = [];

  // Field mapping from form fields to vital types
  const fieldMapping: Array<{ field: string; vitalType: VitalType; getValue: () => number | null | undefined }> = [
    { field: 'spo2', vitalType: 'SPO2', getValue: () => values.spo2 },
    { field: 'temperature', vitalType: 'TEMPERATURE', getValue: () => values.temperature },
    { field: 'pulse', vitalType: 'HEART_RATE', getValue: () => values.pulse ?? values.heart_rate },
    { field: 'respiratory_rate', vitalType: 'RESPIRATORY_RATE', getValue: () => values.respiratory_rate },
    { field: 'pain_score', vitalType: 'PAIN_SCORE', getValue: () => values.pain_score },
  ];

  for (const { field, vitalType, getValue } of fieldMapping) {
    const value = getValue();
    const threshold = thresholds[vitalType];

    if (value === null || value === undefined || !threshold?.is_active) {
      continue;
    }

    const status = checkValueAgainstThreshold(value, threshold);

    if (status !== 'normal') {
      const { message, clinical_note } = getAlertMessage(vitalType, value, status, threshold);
      alerts.push({
        id: `${field}-${status}`,
        field,
        vital_type: vitalType,
        severity: status === 'critical' ? 'CRITICAL' : 'WARNING',
        message,
        value,
        clinical_note,
      });
    }
  }

  // Check MAP (Mean Arterial Pressure) for blood pressure
  const systolic = values.blood_pressure_systolic ?? values.systolic_bp;
  const diastolic = values.blood_pressure_diastolic ?? values.diastolic_bp;
  const mapAlert = getMAPAlert(systolic, diastolic);
  if (mapAlert) {
    alerts.push(mapAlert);
  }

  return alerts;
}

/**
 * Generate simple alerts for triage vitals page
 * Returns TriageAlert-compatible format
 */
export function generateVitalAlerts(vitals: VitalValues): VitalAlert[] {
  return evaluateVitals(vitals, DEFAULT_THRESHOLDS);
}

// =============================================================================
// FIELD STATUS HELPER
// =============================================================================

/**
 * Get field status for styling
 */
export function getFieldStatus(
  field: string,
  alerts: VitalAlert[]
): FieldStatus {
  // Map field aliases
  const fieldAliases: Record<string, string[]> = {
    blood_pressure: ['blood_pressure_systolic', 'blood_pressure_diastolic', 'systolic_bp', 'diastolic_bp', 'blood_pressure'],
    pulse: ['pulse', 'heart_rate'],
  };

  const fieldsToCheck = fieldAliases[field] ?? [field];

  const alert = alerts.find((a) => fieldsToCheck.includes(a.field));
  if (alert?.severity === 'CRITICAL') return 'critical';
  if (alert?.severity === 'WARNING') return 'warning';
  return 'normal';
}
