/**
 * VitalInput - Reusable input component for vital signs
 * Provides consistent styling, units, and status indicators
 */
'use client';

import * as React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { cn } from '@/lib/utils/cn';
import { Label } from '@/components/ui/label';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { FormItem, FormMessage } from '@/components/ui/form';
import type { VitalsFormValues } from './vitals-schema';
import { VITAL_RANGES } from './vitals-schema';

type VitalFieldName = keyof VitalsFormValues;

interface VitalInputProps {
  /** Field name (must match schema) */
  name: VitalFieldName;
  /** Label text */
  label: string;
  /** Icon component */
  icon: React.ElementType;
  /** Placeholder value */
  placeholder?: string;
  /** Normal range description */
  normalRange?: string;
  /** Field status for styling */
  status?: 'normal' | 'warning' | 'critical';
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Step for number input */
  step?: string;
  /** Additional class names */
  className?: string;
}

export function VitalInput({
  name,
  label,
  icon: Icon,
  placeholder,
  normalRange,
  status = 'normal',
  disabled = false,
  step = '1',
  className,
}: VitalInputProps) {
  const { control } = useFormContext<VitalsFormValues>();
  const range = VITAL_RANGES[name];

  const inputStatusClassName = cn(
    status === 'critical' && 'border-destructive bg-destructive/5 focus-within:ring-destructive/30',
    status === 'warning' && 'border-amber-500 bg-amber-50 dark:bg-amber-950/20 focus-within:ring-amber-500/30'
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={cn('space-y-2', className)}>
          <Label htmlFor={name} className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {label}
          </Label>
          <InputGroup
            data-disabled={disabled}
            className={cn(inputStatusClassName, fieldState.error && 'border-destructive')}
          >
            <InputGroupInput
              id={name}
              type="number"
              step={step}
              min={range?.min}
              max={range?.max}
              placeholder={placeholder}
              value={field.value ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                field.onChange(val === '' ? null : parseFloat(val));
              }}
              disabled={disabled}
            />
            <InputGroupAddon align="inline-end">{range?.unit}</InputGroupAddon>
          </InputGroup>
          {fieldState.error ? (
            <FormMessage>{fieldState.error.message}</FormMessage>
          ) : normalRange ? (
            <p className="text-xs text-muted-foreground">Normal: {normalRange}</p>
          ) : null}
        </FormItem>
      )}
    />
  );
}

/**
 * Blood Pressure Input - Special dual input for systolic/diastolic
 */
interface BloodPressureInputProps {
  /** Field status for styling */
  status?: 'normal' | 'warning' | 'critical';
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

export function BloodPressureInput({
  status = 'normal',
  disabled = false,
  className,
}: BloodPressureInputProps) {
  const { control, formState } = useFormContext<VitalsFormValues>();

  const inputStatusClassName = cn(
    status === 'critical' && 'border-destructive bg-destructive/5 focus-within:ring-destructive/30',
    status === 'warning' && 'border-amber-500 bg-amber-50 dark:bg-amber-950/20 focus-within:ring-amber-500/30'
  );

  const systolicError = formState.errors.blood_pressure_systolic;
  const diastolicError = formState.errors.blood_pressure_diastolic;
  const hasError = systolicError || diastolicError;

  return (
    <FormItem className={cn('space-y-2', className)}>
      <Label className="flex items-center gap-2">
        Blood Pressure
      </Label>
      <InputGroup
        data-disabled={disabled}
        className={cn(inputStatusClassName, hasError && 'border-destructive')}
      >
        <Controller
          control={control}
          name="blood_pressure_systolic"
          render={({ field }) => (
            <InputGroupInput
              type="number"
              min={VITAL_RANGES.blood_pressure_systolic.min}
              max={VITAL_RANGES.blood_pressure_systolic.max}
              placeholder="120"
              value={field.value ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                field.onChange(val === '' ? null : parseInt(val));
              }}
              className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              disabled={disabled}
            />
          )}
        />
        <span className="px-1 text-muted-foreground">/</span>
        <Controller
          control={control}
          name="blood_pressure_diastolic"
          render={({ field }) => (
            <InputGroupInput
              type="number"
              min={VITAL_RANGES.blood_pressure_diastolic.min}
              max={VITAL_RANGES.blood_pressure_diastolic.max}
              placeholder="80"
              value={field.value ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                field.onChange(val === '' ? null : parseInt(val));
              }}
              className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              disabled={disabled}
            />
          )}
        />
        <InputGroupAddon align="inline-end">mmHg</InputGroupAddon>
      </InputGroup>
      {hasError ? (
        <FormMessage>{systolicError?.message || diastolicError?.message}</FormMessage>
      ) : (
        <p className="text-xs text-muted-foreground">Normal: 90/60 - 120/80</p>
      )}
    </FormItem>
  );
}

export default VitalInput;
