/**
 * Shared Vital Thresholds Hook
 *
 * Provides unified vital sign threshold logic for both triage and encounter modules.
 * Fetches thresholds from backend and falls back to clinical defaults.
 *
 * Usage:
 * - Triage module: Real-time alerts during triage assessment
 * - Encounter module: Display warnings on vitals in encounter edit
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { VitalType, TriageVitalThreshold, AlertSeverity } from '@/lib/types/triage';

// =============================================================================
// DEFAULT THRESHOLDS (fallback when backend unavailable)
// =============================================================================

/**
 * Clinical default thresholds matching backend TriageVitalThreshold.get_defaults()
 * Based on standard clinical guidelines
 */
export const DEFAULT_THRESHOLDS: Record<VitalType, Omit<TriageVitalThreshold, 'id' | 'created_at' | 'updated_at'>> = {
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
    critical_low: 35.0,   // Hypothermia
    warning_low: 36.5,    // Below normal (normal starts at 36.5)
    warning_high: 37.5,   // Fever threshold
    critical_high: 40.0,  // Hyperpyrexia
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
};

// =============================================================================
// TYPES
// =============================================================================

export interface VitalAlert {
  field: string;
  vital_type: VitalType;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold?: number;
  clinical_note?: string;
}

export interface VitalValues {
  temperature?: number | null;
  pulse?: number | null;  // Maps to HEART_RATE
  heart_rate?: number | null;
  blood_pressure_systolic?: number | null;
  systolic_bp?: number | null;
  blood_pressure_diastolic?: number | null;
  diastolic_bp?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  weight?: number | null;
  height?: number | null;
}

type FieldStatus = 'normal' | 'warning' | 'critical';

// =============================================================================
// THRESHOLD EVALUATION
// =============================================================================

/**
 * Check a vital value against thresholds
 */
function checkValue(
  value: number | null | undefined,
  threshold: Pick<TriageVitalThreshold, 'critical_low' | 'warning_low' | 'warning_high' | 'critical_high' | 'is_active'>
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
 * Get clinical message for alert
 */
function getAlertMessage(
  vitalType: VitalType,
  value: number,
  status: FieldStatus,
  threshold: Pick<TriageVitalThreshold, 'critical_low' | 'warning_low' | 'warning_high' | 'critical_high'>
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
        message: `Temperature ${value}°C - ${status === 'critical' ? 'Hypothermia' : 'Below normal'}`,
        note: status === 'critical' ? 'Active warming required' : 'Keep warm, monitor',
      },
      high: {
        message: `Temperature ${value}°C - ${status === 'critical' ? 'High fever' : 'Elevated'}`,
        note: status === 'critical' ? 'Consider antipyretics, investigate cause' : 'Monitor for infection',
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
      field: 'blood_pressure',
      vital_type: 'SYSTOLIC_BP', // Using as proxy
      severity: 'CRITICAL',
      message: `MAP ${map} mmHg - Severe hypotension`,
      value: map,
      clinical_note: 'Inadequate organ perfusion - immediate intervention required',
    };
  }

  if (map < WARNING_LOW) {
    return {
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
// ALERT GENERATION
// =============================================================================

/**
 * Generate alerts for vital values using provided thresholds
 * Includes MAP (Mean Arterial Pressure) calculation
 */
export function evaluateVitals(
  values: VitalValues,
  thresholds: Record<VitalType, Pick<TriageVitalThreshold, 'vital_type' | 'critical_low' | 'warning_low' | 'warning_high' | 'critical_high' | 'is_active'>>
): VitalAlert[] {
  const alerts: VitalAlert[] = [];

  // Field mapping from encounter form to vital types (excluding BP - handled separately with MAP)
  const fieldMapping: Array<{ field: string; vitalType: VitalType; getValue: () => number | null | undefined }> = [
    { field: 'spo2', vitalType: 'SPO2', getValue: () => values.spo2 },
    { field: 'temperature', vitalType: 'TEMPERATURE', getValue: () => values.temperature },
    { field: 'pulse', vitalType: 'HEART_RATE', getValue: () => values.pulse ?? values.heart_rate },
    { field: 'respiratory_rate', vitalType: 'RESPIRATORY_RATE', getValue: () => values.respiratory_rate },
  ];

  for (const { field, vitalType, getValue } of fieldMapping) {
    const value = getValue();
    const threshold = thresholds[vitalType];

    if (value === null || value === undefined || !threshold?.is_active) {
      continue;
    }

    const status = checkValue(value, threshold);

    if (status !== 'normal') {
      const { message, clinical_note } = getAlertMessage(vitalType, value, status, threshold);
      alerts.push({
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
 * Get field status for styling
 */
export function getFieldStatus(
  field: string,
  alerts: VitalAlert[]
): FieldStatus {
  // Map field aliases
  const fieldAliases: Record<string, string[]> = {
    blood_pressure: ['blood_pressure_systolic', 'blood_pressure_diastolic', 'systolic_bp', 'diastolic_bp'],
    pulse: ['pulse', 'heart_rate'],
  };

  const fieldsToCheck = fieldAliases[field] ?? [field];

  const alert = alerts.find((a) => fieldsToCheck.includes(a.field));
  if (alert?.severity === 'CRITICAL') return 'critical';
  if (alert?.severity === 'WARNING') return 'warning';
  return 'normal';
}

// =============================================================================
// REACT QUERY HOOK
// =============================================================================

interface UseVitalThresholdsOptions {
  /** Whether to fetch from backend (default: true) */
  enabled?: boolean;
  /** Stale time in ms (default: 5 minutes) */
  staleTime?: number;
}

/**
 * Hook to fetch vital thresholds from backend with fallback to defaults
 *
 * @example
 * ```tsx
 * const { thresholds, getAlerts, getFieldStatus, isLoading } = useVitalThresholds();
 *
 * // Get alerts for current vital values
 * const alerts = getAlerts(formData);
 *
 * // Get status for styling an input
 * const tempStatus = getFieldStatus('temperature', alerts);
 * ```
 */
export function useVitalThresholds(options: UseVitalThresholdsOptions = {}) {
  const { enabled = true, staleTime = 5 * 60 * 1000 } = options;

  const query = useQuery({
    queryKey: ['vital-thresholds'],
    queryFn: async () => {
      const response = await apiClient.get<TriageVitalThreshold[] | { results: TriageVitalThreshold[] }>('/api/triage/vital-thresholds/');
      // Handle both array and paginated response formats
      const data = response.data;
      if (Array.isArray(data)) {
        return data;
      }
      // Paginated response
      if (data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)) {
        return data.results;
      }
      // Fallback to empty array
      return [];
    },
    enabled,
    staleTime,
    // Don't throw on error, we'll fall back to defaults
    retry: 1,
  });

  // Convert array response to record, falling back to defaults
  const thresholds: Record<VitalType, TriageVitalThreshold> = React.useMemo(() => {
    const result = { ...DEFAULT_THRESHOLDS } as Record<VitalType, TriageVitalThreshold>;

    // Safely handle the response data
    const dataArray = query.data;
    if (dataArray && Array.isArray(dataArray)) {
      for (const threshold of dataArray) {
        if (threshold && threshold.is_active && threshold.vital_type) {
          result[threshold.vital_type] = threshold;
        }
      }
    }

    return result;
  }, [query.data]);

  // Helper to get alerts for vital values
  const getAlerts = React.useCallback(
    (values: VitalValues): VitalAlert[] => evaluateVitals(values, thresholds),
    [thresholds]
  );

  // Helper to get field status
  const getStatus = React.useCallback(
    (field: string, alerts: VitalAlert[]): FieldStatus => getFieldStatus(field, alerts),
    []
  );

  return {
    /** Threshold records by vital type */
    thresholds,
    /** Get alerts for vital values */
    getAlerts,
    /** Get field status for styling */
    getFieldStatus: getStatus,
    /** Whether thresholds are loading from backend */
    isLoading: query.isLoading,
    /** Whether backend fetch failed (using defaults) */
    isUsingDefaults: query.isError || !query.data,
    /** Raw query for advanced usage */
    query,
  };
}

// Import React for useMemo/useCallback
import * as React from 'react';

export default useVitalThresholds;
