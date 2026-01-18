/**
 * Chart Utilities for Vitora HMIS
 *
 * Helper functions for formatting, calculating, and transforming chart data.
 */

import { format, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, eachMonthOfInterval } from "date-fns";

/**
 * Format a number for display in charts
 */
export function formatChartNumber(
  value: number,
  options: {
    type?: "number" | "currency" | "percent" | "compact";
    decimals?: number;
    currency?: string;
  } = {}
): string {
  const { type = "number", decimals = 0, currency = "KES" } = options;

  switch (type) {
    case "currency":
      return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    case "percent":
      return `${value.toFixed(decimals)}%`;
    case "compact":
      return new Intl.NumberFormat("en-KE", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    default:
      return value.toLocaleString("en-KE", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
  }
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Calculate trend direction
 */
export type TrendDirection = "up" | "down" | "neutral";

export function getTrendDirection(current: number, previous: number, threshold = 0.1): TrendDirection {
  const change = calculatePercentageChange(current, previous);
  if (Math.abs(change) < threshold) return "neutral";
  return change > 0 ? "up" : "down";
}

/**
 * Generate date labels for a time range
 */
export function generateDateLabels(
  range: "7d" | "30d" | "90d" | "12m" | "custom",
  options?: { start?: Date; end?: Date; format?: string }
): string[] {
  const now = new Date();
  const formatStr = options?.format;

  switch (range) {
    case "7d": {
      const days = eachDayOfInterval({
        start: subDays(now, 6),
        end: now,
      });
      return days.map((d) => format(d, formatStr ?? "EEE"));
    }
    case "30d": {
      const days = eachDayOfInterval({
        start: subDays(now, 29),
        end: now,
      });
      return days.map((d) => format(d, formatStr ?? "MMM d"));
    }
    case "90d": {
      // Weekly labels for 90 days
      const labels: string[] = [];
      for (let i = 12; i >= 0; i--) {
        const weekStart = subDays(now, i * 7);
        labels.push(format(weekStart, formatStr ?? "MMM d"));
      }
      return labels;
    }
    case "12m": {
      const months = eachMonthOfInterval({
        start: subMonths(now, 11),
        end: now,
      });
      return months.map((m) => format(m, formatStr ?? "MMM"));
    }
    case "custom": {
      if (!options?.start || !options?.end) {
        throw new Error("Custom range requires start and end dates");
      }
      const days = eachDayOfInterval({
        start: options.start,
        end: options.end,
      });
      return days.map((d) => format(d, formatStr ?? "MMM d"));
    }
    default:
      return [];
  }
}

/**
 * Aggregate data by time period
 */
export type AggregationType = "sum" | "average" | "count" | "min" | "max";

export function aggregateByPeriod<T extends Record<string, unknown>>(
  data: T[],
  dateKey: keyof T,
  valueKey: keyof T,
  period: "day" | "week" | "month",
  aggregation: AggregationType = "sum"
): Array<{ period: string; value: number }> {
  const groups = new Map<string, number[]>();

  data.forEach((item) => {
    const date = new Date(item[dateKey] as string | number | Date);
    let key: string;

    switch (period) {
      case "day":
        key = format(date, "yyyy-MM-dd");
        break;
      case "week":
        key = format(date, "yyyy-'W'ww");
        break;
      case "month":
        key = format(date, "yyyy-MM");
        break;
    }

    const values = groups.get(key) || [];
    values.push(Number(item[valueKey]));
    groups.set(key, values);
  });

  const result: Array<{ period: string; value: number }> = [];

  groups.forEach((values, period) => {
    let value: number;

    switch (aggregation) {
      case "sum":
        value = values.reduce((a, b) => a + b, 0);
        break;
      case "average":
        value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case "count":
        value = values.length;
        break;
      case "min":
        value = Math.min(...values);
        break;
      case "max":
        value = Math.max(...values);
        break;
    }

    result.push({ period, value });
  });

  return result.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Fill missing dates in time series data
 */
export function fillMissingDates<T extends Record<string, unknown>>(
  data: T[],
  dateKey: keyof T,
  startDate: Date,
  endDate: Date,
  defaultValues: Partial<T>
): T[] {
  const dateMap = new Map<string, T>();

  data.forEach((item) => {
    const dateStr = format(new Date(item[dateKey] as string | number | Date), "yyyy-MM-dd");
    dateMap.set(dateStr, item);
  });

  const allDates = eachDayOfInterval({ start: startDate, end: endDate });

  return allDates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const existing = dateMap.get(dateStr);

    if (existing) return existing;

    return {
      ...defaultValues,
      [dateKey]: dateStr,
    } as T;
  });
}

/**
 * Calculate moving average
 */
export function calculateMovingAverage(
  values: number[],
  windowSize: number
): number[] {
  if (windowSize <= 0 || windowSize > values.length) {
    return values;
  }

  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < windowSize - 1) {
      // Not enough data points yet, use available data
      const slice = values.slice(0, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    } else {
      const slice = values.slice(i - windowSize + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / windowSize);
    }
  }

  return result;
}

/**
 * Normalize data to percentage of total
 */
export function normalizeToPercentage<T extends Record<string, number>>(
  data: T[],
  valueKeys: (keyof T)[]
): Array<T & { _total: number }> {
  return data.map((item) => {
    const total = valueKeys.reduce((sum, key) => sum + (item[key] || 0), 0);
    const normalized = { ...item, _total: total } as T & { _total: number };

    valueKeys.forEach((key) => {
      if (total > 0) {
        (normalized as Record<string, number>)[`${String(key)}_pct`] = ((item[key] || 0) / total) * 100;
      } else {
        (normalized as Record<string, number>)[`${String(key)}_pct`] = 0;
      }
    });

    return normalized;
  });
}

/**
 * Get color for a value based on thresholds
 */
export function getColorForValue(
  value: number,
  thresholds: { warning: number; critical: number },
  options?: { invertScale?: boolean }
): "success" | "warning" | "critical" {
  const { invertScale = false } = options || {};

  if (invertScale) {
    // Lower is worse (e.g., SpO2)
    if (value <= thresholds.critical) return "critical";
    if (value <= thresholds.warning) return "warning";
    return "success";
  } else {
    // Higher is worse (e.g., temperature)
    if (value >= thresholds.critical) return "critical";
    if (value >= thresholds.warning) return "warning";
    return "success";
  }
}

/**
 * Generate chart-ready data for a pie/donut chart from counts
 */
export function generatePieData<T extends string>(
  counts: Record<T, number>,
  labels?: Partial<Record<T, string>>
): Array<{ name: T; value: number; label: string }> {
  return Object.entries(counts).map(([key, value]) => ({
    name: key as T,
    value: value as number,
    label: labels?.[key as T] || key,
  }));
}

/**
 * Calculate summary statistics for a dataset
 */
export interface DataSummary {
  count: number;
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
}

export function calculateSummary(values: number[]): DataSummary {
  if (values.length === 0) {
    return { count: 0, sum: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const min = sorted[0]!;
  const max = sorted[count - 1]!;

  // Median
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  // Standard deviation
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
  const stdDev = Math.sqrt(variance);

  return { count, sum, mean, median, min, max, stdDev };
}

/**
 * Format axis tick values for large numbers
 */
export function formatAxisTick(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

/**
 * Generate a color scale for heat maps or gradients
 */
export function generateColorScale(
  steps: number,
  startColor: string = "hsl(var(--chart-2))",
  endColor: string = "hsl(var(--chart-1))"
): string[] {
  // For now, return predefined chart colors
  const chartColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  if (steps <= chartColors.length) {
    return chartColors.slice(0, steps);
  }

  // Repeat colors if more steps needed
  const result: string[] = [];
  for (let i = 0; i < steps; i++) {
    result.push(chartColors[i % chartColors.length]!);
  }
  return result;
}

/**
 * Convert time range string to date bounds
 */
export function getDateRangeBounds(
  range: "today" | "7d" | "30d" | "90d" | "12m" | "ytd" | "all"
): { start: Date; end: Date } {
  const now = new Date();
  const end = now;

  switch (range) {
    case "today":
      return { start: new Date(now.setHours(0, 0, 0, 0)), end: new Date() };
    case "7d":
      return { start: subDays(now, 7), end };
    case "30d":
      return { start: subDays(now, 30), end };
    case "90d":
      return { start: subDays(now, 90), end };
    case "12m":
      return { start: subMonths(now, 12), end };
    case "ytd":
      return { start: new Date(now.getFullYear(), 0, 1), end };
    case "all":
      return { start: new Date(2020, 0, 1), end }; // Arbitrary start
    default:
      return { start: subDays(now, 30), end };
  }
}
