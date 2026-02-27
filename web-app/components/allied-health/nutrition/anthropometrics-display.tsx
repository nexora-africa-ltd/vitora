/**
 * Anthropometrics Display Component
 * Shows patient anthropometric measurements in a structured card view
 */

'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Scale, Ruler, Activity } from 'lucide-react';
import { HelpPopover } from '@/components/shared/help-popover';
import { BMIIndicator } from './bmi-indicator';
import type { Anthropometrics, NutritionalCalculations, MalnutritionStatus } from '@/lib/types/nutrition';
import { MALNUTRITION_STATUS_CONFIG } from '@/lib/types/nutrition';

interface AnthropometricsDisplayProps {
  anthropometrics: Anthropometrics;
  calculations?: NutritionalCalculations | null;
  muacClassification?: string | null;
  /** Show calculated values (BMR, TDEE) alongside measurements */
  showCalculations?: boolean;
  /** Show the BMI visual bar */
  showBmiBar?: boolean;
  className?: string;
}

function parseNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? null : num;
}

function MeasurementItem({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: number | string | null;
  unit: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const numValue = parseNumber(value);
  if (numValue === null) return null;

  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium tabular-nums">
          {numValue} <span className="text-sm text-muted-foreground">{unit}</span>
        </p>
      </div>
    </div>
  );
}

export function AnthropometricsDisplay({
  anthropometrics,
  calculations,
  muacClassification,
  showCalculations = true,
  showBmiBar = true,
  className,
}: AnthropometricsDisplayProps) {
  const {
    weight,
    height,
    waist_circumference,
    hip_circumference,
    mid_upper_arm_circumference,
    bmi,
    bmi_classification,
    waist_hip_ratio,
  } = anthropometrics;

  const hasAnyMeasurement =
    parseNumber(weight) !== null ||
    parseNumber(height) !== null ||
    parseNumber(waist_circumference) !== null ||
    parseNumber(hip_circumference) !== null ||
    parseNumber(mid_upper_arm_circumference) !== null;

  if (!hasAnyMeasurement) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-5 w-5" />
            Anthropometrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No anthropometric measurements recorded
          </p>
        </CardContent>
      </Card>
    );
  }

  const bmiNum = parseNumber(bmi);
  const whrNum = parseNumber(waist_hip_ratio);
  const muacNum = parseNumber(mid_upper_arm_circumference);
  const isMalnutritionStatus = (s: string | null | undefined): s is MalnutritionStatus =>
    s === 'NORMAL' || s === 'MAM' || s === 'SAM';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-5 w-5" />
          Anthropometrics
          <HelpPopover content="Body measurements used to assess nutritional status. Weight, height, waist, hip circumference, and MUAC (Mid-Upper Arm Circumference) for malnutrition screening." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* BMI Indicator */}
        {bmiNum !== null && (
          <BMIIndicator
            bmi={bmiNum}
            classification={bmi_classification}
            showBar={showBmiBar}
          />
        )}

        {/* Core measurements grid */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <MeasurementItem
            label="Weight"
            value={weight}
            unit="kg"
            icon={Scale}
          />
          <MeasurementItem
            label="Height"
            value={height}
            unit="cm"
            icon={Ruler}
          />
          <MeasurementItem
            label="Waist"
            value={waist_circumference}
            unit="cm"
          />
          <MeasurementItem
            label="Hip"
            value={hip_circumference}
            unit="cm"
          />
          {whrNum !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Waist-Hip Ratio</p>
              <p className="font-medium tabular-nums">
                {whrNum.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* MUAC with malnutrition status */}
        {muacNum !== null && (
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
            <div>
              <p className="text-xs text-muted-foreground">MUAC</p>
              <p className="font-medium tabular-nums">{muacNum} cm</p>
            </div>
            {isMalnutritionStatus(muacClassification) && (
              <Badge
                variant={
                  MALNUTRITION_STATUS_CONFIG[muacClassification]?.variant ||
                  'outline'
                }
              >
                {MALNUTRITION_STATUS_CONFIG[muacClassification]?.label}
                <span className="hidden sm:inline ml-1 text-[10px]">
                  ({MALNUTRITION_STATUS_CONFIG[muacClassification]?.description})
                </span>
              </Badge>
            )}
          </div>
        )}

        {/* Calculated nutritional values */}
        {showCalculations && calculations && (calculations.basal_metabolic_rate || calculations.total_daily_energy_expenditure) && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              Calculated Values
            </p>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
              {parseNumber(calculations.basal_metabolic_rate) !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">BMR</p>
                  <p className="font-medium tabular-nums">
                    {Math.round(parseNumber(calculations.basal_metabolic_rate)!)}{' '}
                    <span className="text-sm text-muted-foreground">kcal</span>
                  </p>
                </div>
              )}
              {parseNumber(calculations.total_daily_energy_expenditure) !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">TDEE</p>
                  <p className="font-medium tabular-nums">
                    {Math.round(parseNumber(calculations.total_daily_energy_expenditure)!)}{' '}
                    <span className="text-sm text-muted-foreground">kcal</span>
                  </p>
                </div>
              )}
              {parseNumber(calculations.ideal_body_weight) !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Ideal Weight</p>
                  <p className="font-medium tabular-nums">
                    {parseNumber(calculations.ideal_body_weight)!.toFixed(1)}{' '}
                    <span className="text-sm text-muted-foreground">kg</span>
                  </p>
                </div>
              )}
              {calculations.activity_level && (
                <div>
                  <p className="text-xs text-muted-foreground">Activity</p>
                  <Badge variant="outline" className="capitalize text-xs">
                    {calculations.activity_level.toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
