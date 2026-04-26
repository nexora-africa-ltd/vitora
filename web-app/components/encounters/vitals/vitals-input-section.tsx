/**
 * VitalsInputSection - Standalone vitals input grid
 * Can be used by both encounter forms and triage assessment forms
 * Does not include Card wrapper - just the input grid
 */
'use client';

import * as React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import {
  Thermometer,
  Heart,
  Wind,
  Droplets,
  Scale,
  Ruler,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Label } from '@/components/ui/label';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { FormItem, FormMessage } from '@/components/ui/form';
import { VITAL_RANGES } from './vitals-schema';
import type { VitalAlert } from '@/lib/hooks/use-vital-thresholds';
import { getVitalRangeHint, getVitalPlaceholder, type AgeGroup } from '@/lib/vitals';

type FieldStatus = 'normal' | 'warning' | 'critical';

interface VitalsInputSectionProps {
  /** Get status for a field based on alerts */
  getFieldStatus: (field: string, alerts: VitalAlert[]) => FieldStatus;
  /** Current alerts */
  alerts: VitalAlert[];
  /** Whether inputs are disabled */
  disabled?: boolean;
  /** Whether to show weight/height fields */
  showWeightHeight?: boolean;
  /** Age group for paediatric-adjusted normal range hints */
  ageGroup?: AgeGroup | null;
  /** Additional class names for the grid */
  className?: string;
}

/**
 * Standalone vitals input grid for use in forms
 * Requires a FormProvider parent with vitals fields
 */
export function VitalsInputSection({
  getFieldStatus,
  alerts,
  disabled = false,
  showWeightHeight = true,
  ageGroup,
  className,
}: VitalsInputSectionProps) {
  const { control, formState } = useFormContext();

  const getInputClassName = (field: string) => {
    const status = getFieldStatus(field, alerts);
    return cn(
      status === 'critical' && 'border-destructive bg-destructive/5 focus-within:ring-destructive/30',
      status === 'warning' && 'border-amber-500 bg-amber-50 dark:bg-amber-950/20 focus-within:ring-amber-500/30'
    );
  };

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {/* Temperature */}
      <Controller
        control={control}
        name="temperature"
        render={({ field, fieldState }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="temperature" className="flex items-center gap-2">
              <Thermometer className="h-4 w-4" />
              Temperature
            </Label>
            <InputGroup
              data-disabled={disabled}
              className={cn(getInputClassName('temperature'), fieldState.error && 'border-destructive')}
            >
              <InputGroupInput
                id="temperature"
                type="number"
                step="0.1"
                min={VITAL_RANGES.temperature.min}
                max={VITAL_RANGES.temperature.max}
                placeholder={getVitalPlaceholder('temperature', ageGroup)}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">°C</InputGroupAddon>
            </InputGroup>
            {fieldState.error ? (
              <FormMessage>{fieldState.error.message}</FormMessage>
            ) : (
              <p className="text-xs text-muted-foreground">{getVitalRangeHint('temperature', ageGroup)}</p>
            )}
          </FormItem>
        )}
      />

      {/* Heart Rate / Pulse */}
      <Controller
        control={control}
        name="heart_rate"
        render={({ field, fieldState }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="heart_rate" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Heart Rate
            </Label>
            <InputGroup
              data-disabled={disabled}
              className={cn(getInputClassName('pulse'), fieldState.error && 'border-destructive')}
            >
              <InputGroupInput
                id="heart_rate"
                type="number"
                min={VITAL_RANGES.pulse.min}
                max={VITAL_RANGES.pulse.max}
                placeholder={getVitalPlaceholder('pulse', ageGroup)}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : parseInt(e.target.value))}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">bpm</InputGroupAddon>
            </InputGroup>
            {fieldState.error ? (
              <FormMessage>{fieldState.error.message}</FormMessage>
            ) : (
              <p className="text-xs text-muted-foreground">{getVitalRangeHint('pulse', ageGroup)}</p>
            )}
          </FormItem>
        )}
      />

      {/* Blood Pressure */}
      <FormItem className="space-y-2">
        <Label className="flex items-center gap-2">
          Blood Pressure
        </Label>
        <InputGroup
          data-disabled={disabled}
          className={cn(
            getInputClassName('blood_pressure'),
            (formState.errors.systolic_bp || formState.errors.diastolic_bp) && 'border-destructive'
          )}
        >
          <Controller
            control={control}
            name="systolic_bp"
            render={({ field }) => (
              <InputGroupInput
                type="number"
                min={VITAL_RANGES.blood_pressure_systolic.min}
                max={VITAL_RANGES.blood_pressure_systolic.max}
                placeholder={getVitalPlaceholder('blood_pressure_systolic', ageGroup)}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : parseInt(e.target.value))}
                className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={disabled}
              />
            )}
          />
          <span className="px-1 text-muted-foreground">/</span>
          <Controller
            control={control}
            name="diastolic_bp"
            render={({ field }) => (
              <InputGroupInput
                type="number"
                min={VITAL_RANGES.blood_pressure_diastolic.min}
                max={VITAL_RANGES.blood_pressure_diastolic.max}
                placeholder={getVitalPlaceholder('blood_pressure_diastolic', ageGroup)}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : parseInt(e.target.value))}
                className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={disabled}
              />
            )}
          />
          <InputGroupAddon align="inline-end">mmHg</InputGroupAddon>
        </InputGroup>
        {formState.errors.systolic_bp ? (
          <FormMessage>{String(formState.errors.systolic_bp.message)}</FormMessage>
        ) : formState.errors.diastolic_bp ? (
          <FormMessage>{String(formState.errors.diastolic_bp.message)}</FormMessage>
        ) : (
          <p className="text-xs text-muted-foreground">Normal: 90/60 - 120/80</p>
        )}
      </FormItem>

      {/* Respiratory Rate */}
      <Controller
        control={control}
        name="respiratory_rate"
        render={({ field, fieldState }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="respiratory_rate" className="flex items-center gap-2">
              <Wind className="h-4 w-4" />
              Respiratory Rate
            </Label>
            <InputGroup
              data-disabled={disabled}
              className={cn(getInputClassName('respiratory_rate'), fieldState.error && 'border-destructive')}
            >
              <InputGroupInput
                id="respiratory_rate"
                type="number"
                min={VITAL_RANGES.respiratory_rate.min}
                max={VITAL_RANGES.respiratory_rate.max}
                placeholder={getVitalPlaceholder('respiratory_rate', ageGroup)}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : parseInt(e.target.value))}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">/min</InputGroupAddon>
            </InputGroup>
            {fieldState.error ? (
              <FormMessage>{fieldState.error.message}</FormMessage>
            ) : (
              <p className="text-xs text-muted-foreground">{getVitalRangeHint('respiratory_rate', ageGroup)}</p>
            )}
          </FormItem>
        )}
      />

      {/* SpO2 */}
      <Controller
        control={control}
        name="spo2"
        render={({ field, fieldState }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="spo2" className="flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              SpO₂
            </Label>
            <InputGroup
              data-disabled={disabled}
              className={cn(getInputClassName('spo2'), fieldState.error && 'border-destructive')}
            >
              <InputGroupInput
                id="spo2"
                type="number"
                min={VITAL_RANGES.spo2.min}
                max={VITAL_RANGES.spo2.max}
                placeholder={getVitalPlaceholder('spo2', ageGroup)}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">%</InputGroupAddon>
            </InputGroup>
            {fieldState.error ? (
              <FormMessage>{fieldState.error.message}</FormMessage>
            ) : (
              <p className="text-xs text-muted-foreground">{getVitalRangeHint('spo2', ageGroup)}</p>
            )}
          </FormItem>
        )}
      />

      {/* Weight */}
      {showWeightHeight && (
        <Controller
          control={control}
          name="weight"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="weight" className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Weight
              </Label>
              <InputGroup data-disabled={disabled}>
                <InputGroupInput
                  id="weight"
                  type="number"
                  step="0.1"
                  min={VITAL_RANGES.weight.min}
                  max={VITAL_RANGES.weight.max}
                  placeholder={getVitalPlaceholder('weight', ageGroup)}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                  disabled={disabled}
                />
                <InputGroupAddon align="inline-end">kg</InputGroupAddon>
              </InputGroup>
              {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
            </FormItem>
          )}
        />
      )}

      {/* Height - only show if weight/height enabled */}
      {showWeightHeight && (
        <Controller
          control={control}
          name="height"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="height" className="flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Height
              </Label>
              <InputGroup data-disabled={disabled}>
                <InputGroupInput
                  id="height"
                  type="number"
                  step="0.1"
                  min={VITAL_RANGES.height.min}
                  max={VITAL_RANGES.height.max}
                  placeholder={getVitalPlaceholder('height', ageGroup)}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                  disabled={disabled}
                />
                <InputGroupAddon align="inline-end">cm</InputGroupAddon>
              </InputGroup>
              {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

export default VitalsInputSection;
