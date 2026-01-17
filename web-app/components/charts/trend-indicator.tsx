"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrendDirection = "up" | "down" | "neutral";

export interface TrendIndicatorProps {
  /** Current value */
  value: number;
  /** Previous value to compare against */
  previousValue?: number;
  /** Pre-calculated percentage change (use instead of previousValue) */
  percentageChange?: number;
  /** Force a specific trend direction */
  direction?: TrendDirection;
  /** Show percentage value */
  showPercentage?: boolean;
  /** Show icon */
  showIcon?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Invert colors (e.g., for costs where down is good) */
  invertColors?: boolean;
  /** Additional className */
  className?: string;
  /** Format for displaying percentage */
  percentageFormat?: "decimal" | "integer";
  /** Suffix text (e.g., "vs last month") */
  suffix?: string;
}

/**
 * Calculate trend direction and percentage from two values
 */
export function calculateTrend(
  current: number,
  previous: number
): { direction: TrendDirection; percentage: number } {
  if (previous === 0) {
    return {
      direction: current > 0 ? "up" : current < 0 ? "down" : "neutral",
      percentage: current > 0 ? 100 : 0,
    };
  }

  const change = ((current - previous) / Math.abs(previous)) * 100;

  if (Math.abs(change) < 0.1) {
    return { direction: "neutral", percentage: 0 };
  }

  return {
    direction: change > 0 ? "up" : "down",
    percentage: Math.abs(change),
  };
}

/**
 * Trend Indicator Component
 *
 * Displays a visual indicator showing whether a value has increased,
 * decreased, or stayed the same compared to a previous period.
 *
 * @example
 * ```tsx
 * // Basic usage with values
 * <TrendIndicator value={150} previousValue={120} />
 *
 * // With pre-calculated percentage
 * <TrendIndicator value={150} percentageChange={25} direction="up" />
 *
 * // Inverted colors (for costs where down is good)
 * <TrendIndicator value={80} previousValue={100} invertColors />
 *
 * // With suffix
 * <TrendIndicator value={150} previousValue={120} suffix="vs last month" />
 * ```
 */
export function TrendIndicator({
  value,
  previousValue,
  percentageChange,
  direction: forcedDirection,
  showPercentage = true,
  showIcon = true,
  size = "md",
  invertColors = false,
  className,
  percentageFormat = "decimal",
  suffix,
}: TrendIndicatorProps) {
  // Calculate trend if not provided
  const { direction, percentage } = React.useMemo(() => {
    if (forcedDirection && percentageChange !== undefined) {
      return { direction: forcedDirection, percentage: Math.abs(percentageChange) };
    }
    if (previousValue !== undefined) {
      return calculateTrend(value, previousValue);
    }
    if (percentageChange !== undefined) {
      return {
        direction: percentageChange > 0 ? "up" : percentageChange < 0 ? "down" : "neutral",
        percentage: Math.abs(percentageChange),
      } as { direction: TrendDirection; percentage: number };
    }
    return { direction: "neutral" as TrendDirection, percentage: 0 };
  }, [value, previousValue, percentageChange, forcedDirection]);

  // Determine colors based on direction and inversion
  const colorClasses = React.useMemo(() => {
    const isPositive = invertColors ? direction === "down" : direction === "up";
    const isNegative = invertColors ? direction === "up" : direction === "down";

    if (isPositive) {
      return "text-success";
    }
    if (isNegative) {
      return "text-destructive";
    }
    return "text-muted-foreground";
  }, [direction, invertColors]);

  // Size classes
  const sizeClasses = {
    sm: "text-xs gap-0.5",
    md: "text-sm gap-1",
    lg: "text-base gap-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  // Format percentage
  const formattedPercentage = React.useMemo(() => {
    if (percentageFormat === "integer") {
      return Math.round(percentage);
    }
    return percentage.toFixed(1);
  }, [percentage, percentageFormat]);

  // Icon component
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium",
        sizeClasses[size],
        colorClasses,
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {showPercentage && percentage > 0 && (
        <span>
          {direction === "up" ? "+" : direction === "down" ? "-" : ""}
          {formattedPercentage}%
        </span>
      )}
      {showPercentage && percentage === 0 && direction === "neutral" && (
        <span>0%</span>
      )}
      {suffix && <span className="text-muted-foreground font-normal ml-1">{suffix}</span>}
    </span>
  );
}

TrendIndicator.displayName = "TrendIndicator";

/**
 * Compact trend badge for use in tables/lists
 */
export interface TrendBadgeProps {
  /** Percentage change */
  change: number;
  /** Size variant */
  size?: "sm" | "md";
  /** Invert colors (down is good) */
  invertColors?: boolean;
  /** Additional className */
  className?: string;
}

export function TrendBadge({
  change,
  size = "sm",
  invertColors = false,
  className,
}: TrendBadgeProps) {
  const direction: TrendDirection = change > 0 ? "up" : change < 0 ? "down" : "neutral";
  
  const isPositive = invertColors ? direction === "down" : direction === "up";
  const isNegative = invertColors ? direction === "up" : direction === "down";

  const bgClasses = isPositive
    ? "bg-success/10 text-success"
    : isNegative
    ? "bg-destructive/10 text-destructive"
    : "bg-muted text-muted-foreground";

  const sizeClasses = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        sizeClasses,
        bgClasses,
        className
      )}
    >
      <Icon className={iconSize} />
      <span>
        {change > 0 ? "+" : ""}
        {Math.abs(change).toFixed(1)}%
      </span>
    </span>
  );
}

TrendBadge.displayName = "TrendBadge";
