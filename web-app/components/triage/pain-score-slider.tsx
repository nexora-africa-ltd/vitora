/**
 * PainScoreSlider Component
 *
 * Color-coded pain score slider (0-10) with visual gradient from
 * green (no pain) through yellow (moderate) to red (severe).
 *
 * Based on the Wong-Baker FACES Pain Rating Scale coloring.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

// =============================================================================
// Types
// =============================================================================

export interface PainScoreSliderProps {
  /** Current pain score value (0-10) */
  value: number | null;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Whether the slider is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

interface PainSeverity {
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red' | 'gray';
  emoji: string;
  bgClass: string;
  textClass: string;
}

/**
 * Get pain severity info based on score (0-10)
 * Based on Wong-Baker FACES Pain Rating Scale
 */
export function getPainSeverity(score: number | null | undefined): PainSeverity {
  if (score === null || score === undefined) {
    return {
      label: 'Not assessed',
      color: 'gray',
      emoji: '❓',
      bgClass: 'bg-gray-100 dark:bg-gray-800',
      textClass: 'text-gray-600 dark:text-gray-400',
    };
  }
  if (score === 0) {
    return {
      label: 'No Pain',
      color: 'green',
      emoji: '😊',
      bgClass: 'bg-green-500',
      textClass: 'text-white',
    };
  }
  if (score <= 2) {
    return {
      label: 'Mild',
      color: 'green',
      emoji: '🙂',
      bgClass: 'bg-green-400',
      textClass: 'text-white',
    };
  }
  if (score <= 4) {
    return {
      label: 'Moderate',
      color: 'yellow',
      emoji: '😐',
      bgClass: 'bg-yellow-500',
      textClass: 'text-gray-900',
    };
  }
  if (score <= 6) {
    return {
      label: 'Moderate-Severe',
      color: 'orange',
      emoji: '😣',
      bgClass: 'bg-orange-500',
      textClass: 'text-white',
    };
  }
  if (score <= 8) {
    return {
      label: 'Severe',
      color: 'red',
      emoji: '😢',
      bgClass: 'bg-red-500',
      textClass: 'text-white',
    };
  }
  return {
    label: 'Worst Pain',
    color: 'red',
    emoji: '😭',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
  };
}

/**
 * Get thumb color class based on score position
 */
function getThumbColorClass(score: number): string {
  if (score <= 2) return 'bg-green-500';
  if (score <= 4) return 'bg-yellow-500';
  if (score <= 6) return 'bg-orange-500';
  return 'bg-red-500';
}

// =============================================================================
// Component
// =============================================================================

/**
 * PainScoreSlider - Visual pain scale with color gradient
 *
 * Features:
 * - Green → Yellow → Orange → Red gradient track
 * - Dynamic thumb color matching position
 * - Severity badge with emoji indicator
 * - Number scale markers (0-10)
 * - Accessible with ARIA labels
 *
 * @example
 * ```tsx
 * <PainScoreSlider
 *   value={painScore}
 *   onChange={(score) => setPainScore(score)}
 * />
 * ```
 */
export function PainScoreSlider({
  value,
  onChange,
  disabled = false,
  className,
}: PainScoreSliderProps) {
  const currentScore = value ?? 0;
  const severity = getPainSeverity(value);

  return (
    <div className={cn('space-y-3', className)} data-testid="pain-score-slider">
      {/* Header with label and severity badge */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Pain Score (0-10)</Label>
        <Badge
          className={cn(
            severity.bgClass,
            severity.textClass,
            'transition-colors duration-200'
          )}
        >
          <span className="mr-1">{severity.emoji}</span>
          {severity.label}
        </Badge>
      </div>

      {/* Slider container */}
      <div className="relative">
        {/* Number scale markers */}
        <div className="flex justify-between px-1 mb-2">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <span
              key={num}
              className={cn(
                'text-xs font-medium w-4 text-center',
                currentScore === num
                  ? 'text-foreground font-bold'
                  : 'text-muted-foreground'
              )}
            >
              {num}
            </span>
          ))}
        </div>

        {/* Slider with gradient track */}
        <div className="relative h-8 flex items-center">
          {/* Gradient background track */}
          <div className="absolute inset-x-0 h-3 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 via-50% to-red-500 shadow-inner" />

          {/* Actual input slider */}
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={currentScore}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            disabled={disabled}
            aria-label={`Pain score: ${severity.label} (${currentScore} out of 10)`}
            className={cn(
              'relative w-full h-3 appearance-none bg-transparent cursor-pointer z-10',
              // Thumb styling - uses webkit and moz prefixes
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:w-6',
              '[&::-webkit-slider-thumb]:h-6',
              '[&::-webkit-slider-thumb]:rounded-full',
              '[&::-webkit-slider-thumb]:shadow-lg',
              '[&::-webkit-slider-thumb]:border-2',
              '[&::-webkit-slider-thumb]:border-white',
              '[&::-webkit-slider-thumb]:cursor-grab',
              '[&::-webkit-slider-thumb]:active:cursor-grabbing',
              '[&::-webkit-slider-thumb]:transition-transform',
              '[&::-webkit-slider-thumb]:hover:scale-110',
              // Firefox thumb
              '[&::-moz-range-thumb]:appearance-none',
              '[&::-moz-range-thumb]:w-6',
              '[&::-moz-range-thumb]:h-6',
              '[&::-moz-range-thumb]:rounded-full',
              '[&::-moz-range-thumb]:shadow-lg',
              '[&::-moz-range-thumb]:border-2',
              '[&::-moz-range-thumb]:border-white',
              '[&::-moz-range-thumb]:cursor-grab',
              '[&::-moz-range-thumb]:active:cursor-grabbing',
              // Dynamic thumb color based on position
              currentScore <= 2 && '[&::-webkit-slider-thumb]:bg-green-500 [&::-moz-range-thumb]:bg-green-500',
              currentScore > 2 && currentScore <= 4 && '[&::-webkit-slider-thumb]:bg-yellow-500 [&::-moz-range-thumb]:bg-yellow-500',
              currentScore > 4 && currentScore <= 6 && '[&::-webkit-slider-thumb]:bg-orange-500 [&::-moz-range-thumb]:bg-orange-500',
              currentScore > 6 && '[&::-webkit-slider-thumb]:bg-red-500 [&::-moz-range-thumb]:bg-red-500',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          />
        </div>

        {/* Labels under the slider */}
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-green-600 dark:text-green-400">No Pain</span>
          <span className="text-yellow-600 dark:text-yellow-400">Moderate</span>
          <span className="text-red-600 dark:text-red-400">Worst Pain</span>
        </div>
      </div>

      {/* Current value display */}
      <div className="text-center text-sm text-muted-foreground">
        Current: <span className="font-medium text-foreground">{currentScore}</span> — {severity.label}
      </div>
    </div>
  );
}

export default PainScoreSlider;
