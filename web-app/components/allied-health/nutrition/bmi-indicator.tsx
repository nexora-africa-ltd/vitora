/**
 * BMI Indicator Component
 * Visual gauge showing BMI value with classification and color coding
 */

'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  BMI_CLASSIFICATION_CONFIG,
  type BMIClassification,
} from '@/lib/types/nutrition';

interface BMIIndicatorProps {
  bmi: number | null;
  classification: BMIClassification | null;
  /** Show the range bar visual */
  showBar?: boolean;
  /** Compact mode for inline use */
  compact?: boolean;
  className?: string;
}

// BMI ranges for the visual bar (WHO classification)
const BMI_RANGES = [
  { min: 0, max: 16, key: 'UNDERWEIGHT_SEVERE' as BMIClassification, color: 'bg-red-500' },
  { min: 16, max: 17, key: 'UNDERWEIGHT_MODERATE' as BMIClassification, color: 'bg-orange-400' },
  { min: 17, max: 18.5, key: 'UNDERWEIGHT_MILD' as BMIClassification, color: 'bg-yellow-400' },
  { min: 18.5, max: 25, key: 'NORMAL' as BMIClassification, color: 'bg-green-500' },
  { min: 25, max: 30, key: 'OVERWEIGHT' as BMIClassification, color: 'bg-yellow-500' },
  { min: 30, max: 35, key: 'OBESE_CLASS_I' as BMIClassification, color: 'bg-orange-500' },
  { min: 35, max: 40, key: 'OBESE_CLASS_II' as BMIClassification, color: 'bg-red-400' },
  { min: 40, max: 60, key: 'OBESE_CLASS_III' as BMIClassification, color: 'bg-red-600' },
];

/**
 * Calculate the position percentage for the BMI marker on the bar.
 * The bar spans from BMI 10 to 50 (visual range).
 */
function getBmiPosition(bmi: number): number {
  const minBmi = 10;
  const maxBmi = 50;
  const clamped = Math.max(minBmi, Math.min(maxBmi, bmi));
  return ((clamped - minBmi) / (maxBmi - minBmi)) * 100;
}

export function BMIIndicator({
  bmi,
  classification,
  showBar = true,
  compact = false,
  className,
}: BMIIndicatorProps) {
  if (bmi === null) {
    return (
      <span className="text-sm text-muted-foreground">No BMI data</span>
    );
  }

  const config = classification
    ? BMI_CLASSIFICATION_CONFIG[classification]
    : null;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <span className={cn('font-semibold tabular-nums', config?.color)}>
          {bmi.toFixed(1)}
        </span>
        {config && (
          <Badge variant="outline" className={cn('text-xs', config.color)}>
            {config.label}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">BMI</span>
          <HelpPopover content="Body Mass Index calculated from weight and height. WHO classification: Underweight < 18.5, Normal 18.5-24.9, Overweight 25-29.9, Obese >= 30." />
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xl font-bold tabular-nums', config?.color)}>
            {bmi.toFixed(1)}
          </span>
          {config && (
            <Badge variant="outline" className={cn(config.color)}>
              {config.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Visual Bar */}
      {showBar && (
        <div className="relative">
          {/* Color gradient bar */}
          <div className="flex h-3 rounded-full overflow-hidden">
            {BMI_RANGES.map((range) => (
              <div
                key={range.key}
                className={cn(range.color, 'flex-1')}
                title={`${BMI_CLASSIFICATION_CONFIG[range.key].label} (${range.min}-${range.max})`}
              />
            ))}
          </div>

          {/* Marker */}
          <div
            className="absolute top-0 -mt-1 w-0 h-0"
            style={{ left: `${getBmiPosition(bmi)}%` }}
          >
            <div className="relative -left-1.5">
              <div className="w-3 h-5 border-2 border-foreground rounded-sm bg-background" />
            </div>
          </div>

          {/* Range labels */}
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">10</span>
            <span className="text-[10px] text-muted-foreground">18.5</span>
            <span className="text-[10px] text-muted-foreground">25</span>
            <span className="text-[10px] text-muted-foreground">30</span>
            <span className="text-[10px] text-muted-foreground">40+</span>
          </div>
        </div>
      )}

      {/* Classification range */}
      {config && (
        <p className="text-xs text-muted-foreground">
          {config.label}: BMI {config.range}
        </p>
      )}
    </div>
  );
}
