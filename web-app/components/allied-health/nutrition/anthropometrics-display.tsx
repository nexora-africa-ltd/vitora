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
import type { Anthropometrics, NutritionalCalculations } from '@/lib/types/nutrition';
import { MALNUTRITION_STATUS_CONFIG } from '@/lib/types/nutrition';

interface AnthropometricsDisplayProps {
  anthropometrics: Anthropometrics;
  calculations?: NutritionalCalculations | null;
  /** Show calculated values (BMR, TDEE) alongside measurements */
  showCalculations?: boolean;
  /** Show the BMI visual bar */
  showBmiBar?: boolean;
  className?: string;
}

function MeasurementItem({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  if (value === null) return null;

  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium tabular-nums">
          {value} <span className="text-sm text-muted-foreground">{unit}</span>
        </p>
      </div>
    </div>
  );
}

export function AnthropometricsDisplay({
  anthropometrics,
  calculations,
  showCalculations = true,
  showBmiBar = true,
  className,
}: AnthropometricsDisplayProps) {
  const {
    weight_kg,
    height_cm,
    waist_cm,
    hip_cm,
    muac_cm,
    bmi,
    bmi_classification,
    waist_hip_ratio,
    malnutrition_status,
  } = anthropometrics;

  const hasAnyMeasurement =
    weight_kg !== null ||
    height_cm !== null ||
    waist_cm !== null ||
    hip_cm !== null ||
    muac_cm !== null;

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
        {bmi !== null && (
          <BMIIndicator
            bmi={bmi}
            classification={bmi_classification}
            showBar={showBmiBar}
          />
        )}

        {/* Core measurements grid */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <MeasurementItem
            label="Weight"
            value={weight_kg}
            unit="kg"
            icon={Scale}
          />
          <MeasurementItem
            label="Height"
            value={height_cm}
            unit="cm"
            icon={Ruler}
          />
          <MeasurementItem
            label="Waist"
            value={waist_cm}
            unit="cm"
          />
          <MeasurementItem
            label="Hip"
            value={hip_cm}
            unit="cm"
          />
          {waist_hip_ratio !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Waist-Hip Ratio</p>
              <p className="font-medium tabular-nums">
                {waist_hip_ratio.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* MUAC with malnutrition status */}
        {muac_cm !== null && (
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
            <div>
              <p className="text-xs text-muted-foreground">MUAC</p>
              <p className="font-medium tabular-nums">{muac_cm} cm</p>
            </div>
            {malnutrition_status && (
              <Badge
                variant={
                  MALNUTRITION_STATUS_CONFIG[malnutrition_status]?.variant ||
                  'outline'
                }
              >
                {MALNUTRITION_STATUS_CONFIG[malnutrition_status]?.label}
                <span className="hidden sm:inline ml-1 text-[10px]">
                  ({MALNUTRITION_STATUS_CONFIG[malnutrition_status]?.description})
                </span>
              </Badge>
            )}
          </div>
        )}

        {/* Calculated nutritional values */}
        {showCalculations && calculations && (calculations.bmr || calculations.tdee) && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              Calculated Values
            </p>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
              {calculations.bmr !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">BMR</p>
                  <p className="font-medium tabular-nums">
                    {Math.round(calculations.bmr)}{' '}
                    <span className="text-sm text-muted-foreground">kcal</span>
                  </p>
                </div>
              )}
              {calculations.tdee !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">TDEE</p>
                  <p className="font-medium tabular-nums">
                    {Math.round(calculations.tdee)}{' '}
                    <span className="text-sm text-muted-foreground">kcal</span>
                  </p>
                </div>
              )}
              {calculations.ideal_body_weight !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Ideal Weight</p>
                  <p className="font-medium tabular-nums">
                    {calculations.ideal_body_weight.toFixed(1)}{' '}
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
