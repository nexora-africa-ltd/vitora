/**
 * OT Independence Scale (FIM Display)
 *
 * A visual component for displaying and editing Functional Independence Measure (FIM) scores.
 * FIM levels range from 1 (Total Assistance) to 7 (Complete Independence).
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { HelpPopover } from '@/components/shared/help-popover';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FIM_LEVEL_LABELS, type FIMLevel } from '@/lib/types/occupational-therapy';

// =============================================================================
// Types
// =============================================================================

/**
 * FIM assessment areas used in OT
 */
export type FIMArea = 'ADL' | 'IADL' | 'COGNITIVE' | 'MOTOR' | 'SELF_CARE' | 'MOBILITY' | 'COMMUNICATION';

/**
 * FIM area configuration
 */
export interface FIMAreaConfig {
  label: string;
  description: string;
  icon?: string;
}

const FIM_AREA_CONFIG: Record<FIMArea, FIMAreaConfig> = {
  ADL: {
    label: 'Activities of Daily Living',
    description: 'Basic self-care tasks like eating, grooming, bathing, dressing',
  },
  IADL: {
    label: 'Instrumental ADL',
    description: 'Complex tasks like meal prep, housekeeping, medication management',
  },
  COGNITIVE: {
    label: 'Cognitive Function',
    description: 'Memory, problem-solving, comprehension, expression',
  },
  MOTOR: {
    label: 'Motor Function',
    description: 'Physical movement and coordination abilities',
  },
  SELF_CARE: {
    label: 'Self Care',
    description: 'Eating, grooming, bathing, dressing upper/lower body',
  },
  MOBILITY: {
    label: 'Mobility',
    description: 'Transfers, ambulation, wheelchair use, stairs',
  },
  COMMUNICATION: {
    label: 'Communication',
    description: 'Comprehension, expression, social interaction',
  },
};

// =============================================================================
// Color Configuration
// =============================================================================

/**
 * Get color class based on FIM level
 */
function getFIMColorClass(level: FIMLevel | null | undefined): string {
  if (!level) return 'bg-gray-200 text-gray-600';

  if (level <= 2) return 'bg-red-100 text-red-800 border-red-300';
  if (level <= 3) return 'bg-orange-100 text-orange-800 border-orange-300';
  if (level <= 4) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  if (level <= 5) return 'bg-blue-100 text-blue-800 border-blue-300';
  if (level <= 6) return 'bg-green-100 text-green-800 border-green-300';
  return 'bg-emerald-100 text-emerald-800 border-emerald-300';
}

/**
 * Get progress bar color class
 */
function getProgressColorClass(level: FIMLevel | null | undefined): string {
  if (!level) return 'bg-gray-300';

  if (level <= 2) return 'bg-red-500';
  if (level <= 3) return 'bg-orange-500';
  if (level <= 4) return 'bg-yellow-500';
  if (level <= 5) return 'bg-blue-500';
  if (level <= 6) return 'bg-green-500';
  return 'bg-emerald-500';
}

// =============================================================================
// Display Component
// =============================================================================

interface IndependenceScaleDisplayProps {
  /** FIM level (1-7) */
  level: FIMLevel | null | undefined;
  /** Assessment area */
  area?: FIMArea;
  /** Custom label override */
  label?: string;
  /** Show full description */
  showDescription?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * IndependenceScaleDisplay - Read-only display of a FIM level
 */
export function IndependenceScaleDisplay({
  level,
  area,
  label,
  showDescription = false,
  compact = false,
  className,
}: IndependenceScaleDisplayProps) {
  const areaConfig = area ? FIM_AREA_CONFIG[area] : null;
  const levelConfig = level ? FIM_LEVEL_LABELS[level] : null;
  const displayLabel = label || areaConfig?.label || 'Independence Level';

  if (!level) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {!compact && <span className="text-sm font-medium">{displayLabel}:</span>}
        <Badge variant="outline" className="text-muted-foreground">
          Not assessed
        </Badge>
      </div>
    );
  }

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={cn('cursor-help', getFIMColorClass(level))}>
              FIM {level}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[250px]">
            <div className="font-medium">{levelConfig?.label}</div>
            <div className="text-xs text-muted-foreground">{levelConfig?.description}</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{displayLabel}</span>
        <Badge className={getFIMColorClass(level)}>
          Level {level}: {levelConfig?.label}
        </Badge>
      </div>

      {/* Visual progress bar */}
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5, 6, 7] as FIMLevel[]).map((l) => (
          <div
            key={l}
            className={cn(
              'h-2 flex-1 rounded-sm transition-colors',
              l <= level ? getProgressColorClass(level) : 'bg-gray-200'
            )}
          />
        ))}
      </div>

      {showDescription && levelConfig && (
        <p className="text-xs text-muted-foreground">{levelConfig.description}</p>
      )}
    </div>
  );
}

// =============================================================================
// Edit Component
// =============================================================================

interface IndependenceScaleInputProps {
  /** Current FIM level (1-7) */
  value: FIMLevel | null | undefined;
  /** Callback when level changes */
  onChange: (level: FIMLevel | null) => void;
  /** Assessment area */
  area?: FIMArea;
  /** Custom label override */
  label?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * IndependenceScaleInput - Editable FIM level selector
 */
export function IndependenceScaleInput({
  value,
  onChange,
  area,
  label,
  disabled = false,
  className,
}: IndependenceScaleInputProps) {
  const areaConfig = area ? FIM_AREA_CONFIG[area] : null;
  const levelConfig = value ? FIM_LEVEL_LABELS[value] : null;
  const displayLabel = label || areaConfig?.label || 'Independence Level';

  const handleSliderChange = (values: number[]) => {
    const newValue = values[0] as FIMLevel;
    onChange(newValue);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{displayLabel}</Label>
          {areaConfig && (
            <HelpPopover content={areaConfig.description} />
          )}
        </div>
        {value && (
          <Badge className={getFIMColorClass(value)}>
            Level {value}
          </Badge>
        )}
      </div>

      {/* Slider */}
      <Slider
        value={value ? [value] : [4]}
        min={1}
        max={7}
        step={1}
        onValueChange={handleSliderChange}
        disabled={disabled}
        className="w-full"
      />

      {/* Level indicators */}
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
        <span>6</span>
        <span>7</span>
      </div>

      {/* Current level description */}
      {levelConfig && (
        <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
          <div className="font-medium text-sm">{levelConfig.label}</div>
          <p className="text-xs text-muted-foreground">{levelConfig.description}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Multi-Area Assessment Component
// =============================================================================

interface FIMAssessmentScore {
  area: FIMArea;
  baseline?: FIMLevel | null;
  current?: FIMLevel | null;
  target?: FIMLevel | null;
}

interface IndependenceScaleAssessmentProps {
  /** Assessment scores for multiple areas */
  scores: FIMAssessmentScore[];
  /** Show baseline vs current comparison */
  showComparison?: boolean;
  /** Show target scores */
  showTargets?: boolean;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Additional CSS classes */
  className?: string;
}

/**
 * IndependenceScaleAssessment - Display multiple FIM scores with comparison
 */
export function IndependenceScaleAssessment({
  scores,
  showComparison = true,
  showTargets = false,
  orientation = 'vertical',
  className,
}: IndependenceScaleAssessmentProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div className={cn(
      isHorizontal ? 'flex flex-wrap gap-4' : 'space-y-4',
      className
    )}>
      {scores.map((score) => {
        const areaConfig = FIM_AREA_CONFIG[score.area];
        const improvement = score.baseline && score.current
          ? score.current - score.baseline
          : null;

        return (
          <div
            key={score.area}
            className={cn(
              'rounded-lg border p-3 space-y-2',
              isHorizontal && 'flex-1 min-w-[200px]'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{areaConfig.label}</span>
              {improvement !== null && (
                <Badge
                  variant={improvement > 0 ? 'default' : improvement < 0 ? 'destructive' : 'secondary'}
                  className={cn(
                    'text-xs',
                    improvement > 0 && 'bg-green-100 text-green-800',
                    improvement < 0 && 'bg-red-100 text-red-800'
                  )}
                >
                  {improvement > 0 ? '+' : ''}{improvement}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs">
              {showComparison && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Baseline:</span>
                    <Badge variant="outline" className={getFIMColorClass(score.baseline)}>
                      {score.baseline || 'N/A'}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </>
              )}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Current:</span>
                <Badge className={getFIMColorClass(score.current)}>
                  {score.current || 'N/A'}
                </Badge>
              </div>
              {showTargets && score.target && (
                <>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Target:</span>
                    <Badge variant="outline" className="bg-purple-100 text-purple-800">
                      {score.target}
                    </Badge>
                  </div>
                </>
              )}
            </div>

            {/* Mini progress bar */}
            <div className="flex gap-0.5">
              {([1, 2, 3, 4, 5, 6, 7] as FIMLevel[]).map((l) => (
                <div
                  key={l}
                  className={cn(
                    'h-1 flex-1 rounded-sm transition-colors',
                    score.current && l <= score.current
                      ? getProgressColorClass(score.current)
                      : 'bg-gray-200'
                  )}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Legend Component
// =============================================================================

interface IndependenceScaleLegendProps {
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Compact mode */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * IndependenceScaleLegend - Reference legend for FIM levels
 */
export function IndependenceScaleLegend({
  orientation = 'vertical',
  compact = false,
  className,
}: IndependenceScaleLegendProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div className={cn(
      'rounded-lg border p-3',
      isHorizontal ? 'flex flex-wrap gap-3' : 'space-y-2',
      className
    )}>
      {!compact && (
        <div className="text-sm font-medium mb-2">FIM Level Guide</div>
      )}
      {([1, 2, 3, 4, 5, 6, 7] as FIMLevel[]).map((level) => {
        const config = FIM_LEVEL_LABELS[level];
        return (
          <div
            key={level}
            className={cn(
              'flex items-center gap-2',
              isHorizontal && 'min-w-[140px]'
            )}
          >
            <Badge className={cn('w-8 justify-center', getFIMColorClass(level))}>
              {level}
            </Badge>
            <div>
              <span className="text-sm">{config.label}</span>
              {!compact && (
                <p className="text-xs text-muted-foreground">{config.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export { FIM_AREA_CONFIG, getFIMColorClass, getProgressColorClass };
export type { FIMAssessmentScore };
