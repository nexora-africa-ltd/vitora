/**
 * VitalsDisplay - Read-only display of vital signs using Item components
 * Used when vitals come from triage and are in view mode
 */
'use client';

import * as React from 'react';
import {
  Thermometer,
  Heart,
  Wind,
  Droplets,
  Scale,
  Ruler,
  Activity,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemDescription,
} from '@/components/ui/item';
import type { VitalsFormValues } from './vitals-schema';
import { getFieldStatus, type VitalAlert } from '@/lib/hooks/use-vital-thresholds';
import { getVitalRangeHint, type AgeGroup } from '@/lib/vitals';
import { calculateBMI, getBMIColorClass } from '@/lib/utils/bmi';
import type { Patient } from '@/lib/types/patient';

interface VitalsDisplayProps {
  /** Vital values to display */
  values: Partial<VitalsFormValues>;
  /** Alerts for highlighting abnormal values */
  alerts: VitalAlert[];
  /** Patient info for BMI calculation */
  patient?: Patient | null;
  /** Age group for paediatric-adjusted normal ranges */
  ageGroup?: AgeGroup | null;
  /** Additional class names */
  className?: string;
}

interface VitalItemProps {
  icon: React.ElementType;
  label: string;
  value: string | number | null | undefined;
  unit: string;
  normalRange?: string;
  status?: 'normal' | 'warning' | 'critical';
}

function VitalItem({
  icon: Icon,
  label,
  value,
  unit,
  normalRange,
  status = 'normal'
}: VitalItemProps) {
  return (
    <Item
      variant="outline"
      size="sm"
      className={cn(
        'flex-col items-start gap-1 p-3',
        status === 'critical' && 'border-destructive bg-destructive/5',
        status === 'warning' && 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
      )}
    >
      <div className="flex items-center gap-2 w-full">
        <ItemMedia variant="default" className="text-muted-foreground">
          <Icon className="h-4 w-4" />
        </ItemMedia>
        <ItemContent className="gap-0">
          <ItemDescription className="text-xs line-clamp-1">
            {label}
          </ItemDescription>
        </ItemContent>
      </div>
      <div className="flex items-baseline gap-1 pl-6">
        <span className={cn(
          'text-xl font-semibold tabular-nums',
          status === 'critical' && 'text-destructive',
          status === 'warning' && 'text-amber-600 dark:text-amber-500'
        )}>
          {value ?? '—'}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {normalRange && (
        <p className="text-xs text-muted-foreground pl-6">{normalRange}</p>
      )}
    </Item>
  );
}

export function VitalsDisplay({ values, alerts, patient, ageGroup, className }: VitalsDisplayProps) {
  // Calculate BMI
  const bmiResult = calculateBMI(
    values.weight ?? null,
    values.height ?? null,
    patient?.date_of_birth,
    patient?.gender
  );

  // Format blood pressure
  const bloodPressureValue =
    values.blood_pressure_systolic && values.blood_pressure_diastolic
      ? `${values.blood_pressure_systolic}/${values.blood_pressure_diastolic}`
      : null;

  return (
    <div className={cn('grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', className)}>
      <VitalItem
        icon={Thermometer}
        label="Temperature"
        value={values.temperature}
        unit="°C"
        normalRange={getVitalRangeHint('temperature', ageGroup)}
        status={getFieldStatus('temperature', alerts)}
      />

      <VitalItem
        icon={Heart}
        label="Pulse"
        value={values.pulse}
        unit="bpm"
        normalRange={getVitalRangeHint('pulse', ageGroup)}
        status={getFieldStatus('pulse', alerts)}
      />

      <VitalItem
        icon={Activity}
        label="Blood Pressure"
        value={bloodPressureValue}
        unit="mmHg"
        normalRange="90/60 - 120/80"
        status={getFieldStatus('blood_pressure', alerts)}
      />

      <VitalItem
        icon={Wind}
        label="Resp. Rate"
        value={values.respiratory_rate}
        unit="/min"
        normalRange={getVitalRangeHint('respiratory_rate', ageGroup)}
        status={getFieldStatus('respiratory_rate', alerts)}
      />

      <VitalItem
        icon={Droplets}
        label="SpO₂"
        value={values.spo2}
        unit="%"
        normalRange={getVitalRangeHint('spo2', ageGroup)}
        status={getFieldStatus('spo2', alerts)}
      />

      <VitalItem
        icon={Scale}
        label="Weight"
        value={values.weight}
        unit="kg"
      />

      <VitalItem
        icon={Ruler}
        label="Height"
        value={values.height}
        unit="cm"
      />

      {/* BMI Display */}
      <Item
        variant="outline"
        size="sm"
        className="flex-col items-start gap-1 p-3"
      >
        <div className="flex items-center gap-2 w-full">
          <ItemMedia variant="default" className="text-muted-foreground">
            <Info className="h-4 w-4" />
          </ItemMedia>
          <ItemContent className="gap-0">
            <ItemDescription className="text-xs line-clamp-1">
              BMI
            </ItemDescription>
          </ItemContent>
        </div>
        <div className="flex items-baseline gap-2 pl-6 w-full">
          {!bmiResult.isAgeAppropriate ? (
            <span className="text-sm text-muted-foreground">N/A (under 2 yrs)</span>
          ) : bmiResult.bmi !== null ? (
            <>
              <span className="text-xl font-semibold tabular-nums">{bmiResult.bmi}</span>
              <Badge
                variant="outline"
                className={cn('text-xs', getBMIColorClass(bmiResult.classification))}
              >
                {bmiResult.classification}
              </Badge>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </Item>
    </div>
  );
}

export default VitalsDisplay;
