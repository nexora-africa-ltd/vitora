/**
 * VitalInputWithAlert Component
 *
 * Input field wrapper that displays inline color-coded alerts
 * based on vital sign thresholds.
 *
 * - Normal: Default border
 * - Warning: Amber/orange border and background tint
 * - Critical: Red border and background tint with alert badge
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 */
'use client';

import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Label } from '@/components/ui/label';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

// =============================================================================
// Types
// =============================================================================

export type AlertSeverity = 'normal' | 'warning' | 'critical' | 'emergency' | null;

export interface VitalThresholds {
  emergencyLow?: number;
  emergencyHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  warningLow?: number;
  warningHigh?: number;
  unit: string;
  normalRange: string;
}

export interface VitalInputWithAlertProps {
  /** Field ID */
  id: string;
  /** Field label */
  label: string;
  /** Icon to display next to label */
  icon?: React.ReactNode;
  /** Current value */
  value: number | null | undefined;
  /** Callback when value changes */
  onChange: (value: number | null) => void;
  /** Input placeholder */
  placeholder?: string;
  /** Unit suffix (e.g., "°C", "bpm") */
  unit: string;
  /** Step value for number input */
  step?: number;
  /** Min value */
  min?: number;
  /** Max value */
  max?: number;
  /** Normal range display text */
  normalRange?: string;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Custom threshold configuration */
  thresholds?: VitalThresholds;
  /** Validation error message */
  error?: string;
  /** Additional class names */
  className?: string;
}

// =============================================================================
// Default Thresholds
// =============================================================================

/**
 * Default vital sign thresholds based on clinical guidelines
 */
export const DEFAULT_THRESHOLDS: Record<string, VitalThresholds> = {
  temperature: {
    criticalLow: 32,
    criticalHigh: 40,
    warningLow: 36,  // Mild hypothermia starts at <36°C
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
  diastolic_bp: {
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
// Helper Functions
// =============================================================================

/**
 * Evaluate vital value against thresholds
 * For temperature, uses clinical terminology matching legacy triage form
 */
export function evaluateVitalSeverity(
  value: number | null | undefined,
  thresholds: VitalThresholds,
  vitalType?: string
): { severity: AlertSeverity; message: string | null } {
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
    // Critical: <32°C (severe hypothermia), ≥40°C (hyperpyrexia)
    if (value < 32) {
      return { severity: 'critical', message: `Critical: ${value}${unit} - Severe hypothermia` };
    }
    if (value >= 40) {
      return { severity: 'critical', message: `Critical: ${value}${unit} - High fever / Hyperpyrexia` };
    }
    // Warning high: fever ranges
    if (value >= 38.5) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Moderate fever` };
    }
    if (value > 37.5) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Low-grade fever` };
    }
    // Warning low: hypothermia ranges
    if (value < 35) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Moderate hypothermia` };
    }
    if (value < 36) {
      return { severity: 'warning', message: `Warning: ${value}${unit} - Mild hypothermia` };
    }
    // Normal: 36-37.5°C
    return { severity: 'normal', message: null };
  }

  // Generic threshold checks for other vitals
  // Check critical thresholds
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

  // Check warning thresholds
  if (warningLow !== undefined && value < warningLow) {
    return {
      severity: 'warning',
      message: `Low: ${value}${unit}`,
    };
  }
  if (warningHigh !== undefined && value > warningHigh) {
    return {
      severity: 'warning',
      message: `High: ${value}${unit}`,
    };
  }

  // Normal
  return { severity: 'normal', message: null };
}

// =============================================================================
// Alert Badge Component
// =============================================================================

interface InlineAlertBadgeProps {
  severity: AlertSeverity;
  message: string | null;
}

function InlineAlertBadge({ severity, message }: InlineAlertBadgeProps) {
  if (!severity || severity === 'normal' || !message) {
    return null;
  }

  if (severity === 'emergency') {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-md bg-rose-100 dark:bg-rose-950/70 border-2 border-rose-500 dark:border-rose-600">
        <AlertCircle className="h-4 w-4 text-rose-700 dark:text-rose-300 shrink-0 animate-pulse" />
        <span className="text-xs font-bold text-rose-800 dark:text-rose-200">{message}</span>
      </div>
    );
  }

  if (severity === 'critical') {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-700">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 animate-pulse" />
        <span className="text-xs font-medium text-red-700 dark:text-red-300">{message}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{message}</span>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * VitalInputWithAlert - Input with inline visual alerts
 *
 * Features:
 * - Color-coded border based on value severity
 * - Inline alert badge for critical/warning values
 * - Normal range hint text
 * - Success indicator when value is normal
 *
 * @example
 * ```tsx
 * <VitalInputWithAlert
 *   id="temperature"
 *   label="Temperature"
 *   icon={<Thermometer className="h-4 w-4" />}
 *   value={temperature}
 *   onChange={setTemperature}
 *   unit="°C"
 *   thresholds={DEFAULT_THRESHOLDS.temperature}
 * />
 * ```
 */
export function VitalInputWithAlert({
  id,
  label,
  icon,
  value,
  onChange,
  placeholder,
  unit,
  step = 1,
  min,
  max,
  normalRange,
  disabled = false,
  thresholds,
  error,
  className,
}: VitalInputWithAlertProps) {
  // Evaluate current value
  const evaluation = thresholds
    ? evaluateVitalSeverity(value, thresholds)
    : { severity: null, message: null };

  const { severity, message } = evaluation;

  // Determine input styling based on severity
  const inputClassName = cn(
    // Base styles
    'transition-colors',
    // Error state (from validation)
    error && 'border-destructive',
    // Critical state
    severity === 'critical' && !error &&
      'border-red-500 bg-red-50 dark:bg-red-950/30 focus-within:ring-red-500/30',
    // Warning state
    severity === 'warning' && !error &&
      'border-amber-500 bg-amber-50 dark:bg-amber-950/30 focus-within:ring-amber-500/30',
    // Normal state (value is present and within range)
    severity === 'normal' && !error &&
      'border-green-400 dark:border-green-600'
  );

  // Handle number input
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === '' || inputValue === undefined) {
      onChange(null);
    } else {
      const num = parseFloat(inputValue);
      onChange(isNaN(num) ? null : num);
    }
  };

  return (
    <div className={cn('space-y-2', className)} data-testid={`vital-input-${id}`}>
      {/* Label with icon */}
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {label}
        {/* Status indicator */}
        {severity === 'normal' && value !== null && value !== undefined && (
          <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-1" />
        )}
      </Label>

      {/* Input with unit */}
      <InputGroup className={inputClassName}>
        <InputGroupInput
          id={id}
          type="number"
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={handleChange}
          disabled={disabled}
          aria-invalid={!!error || severity === 'critical'}
          aria-describedby={error ? `${id}-error` : message ? `${id}-alert` : undefined}
        />
        <InputGroupAddon>{unit}</InputGroupAddon>
      </InputGroup>

      {/* Error message (from validation) */}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Inline alert badge */}
      {!error && (
        <div id={`${id}-alert`}>
          <InlineAlertBadge severity={severity} message={message} />
        </div>
      )}

      {/* Normal range hint (when no alert) */}
      {!error && !message && normalRange && (
        <p className="text-xs text-muted-foreground">Normal: {normalRange}</p>
      )}
    </div>
  );
}

export default VitalInputWithAlert;
