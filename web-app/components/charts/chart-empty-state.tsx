"use client";

import * as React from "react";
import {
  BarChart3,
  PieChart,
  TrendingUp,
  LineChart as LineChartIcon,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { cn } from "@/lib/utils";

export type ChartType = "bar" | "pie" | "donut" | "line" | "area" | "generic";

export interface ChartEmptyStateProps {
  /** Type of chart to show appropriate icon */
  chartType?: ChartType;
  /** Custom icon (overrides chartType icon) */
  icon?: LucideIcon;
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Action element (button, link, etc.) */
  action?: React.ReactNode;
  /** Minimum height for the empty state container */
  minHeight?: string;
  /** Additional className */
  className?: string;
}

const chartTypeIcons: Record<ChartType, LucideIcon> = {
  bar: BarChart3,
  pie: PieChart,
  donut: PieChart,
  line: LineChartIcon,
  area: Activity,
  generic: TrendingUp,
};

const defaultTitles: Record<ChartType, string> = {
  bar: "No bar chart data",
  pie: "No pie chart data",
  donut: "No chart data",
  line: "No trend data",
  area: "No area data",
  generic: "No data available",
};

const defaultDescriptions: Record<ChartType, string> = {
  bar: "There's no data to display in this bar chart. Data will appear here once it's available.",
  pie: "There's no data to display in this pie chart. Data will appear here once it's available.",
  donut: "There's no data to display in this chart. Data will appear here once it's available.",
  line: "There's no trend data to display. Data will appear here once it's available.",
  area: "There's no data to display in this area chart. Data will appear here once it's available.",
  generic: "There's no data to display in this chart yet. Data will appear here once it's available.",
};

/**
 * ChartEmptyState - A consistent empty state component for charts
 *
 * Uses the Empty primitive components to display a visually appealing
 * empty state when chart data is not available.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ChartEmptyState chartType="bar" />
 *
 * // Custom content
 * <ChartEmptyState
 *   chartType="pie"
 *   title="No revenue data"
 *   description="Revenue data will appear once transactions are recorded."
 * />
 *
 * // With action
 * <ChartEmptyState
 *   chartType="line"
 *   title="No trend data"
 *   action={<Button size="sm">Add Data</Button>}
 * />
 * ```
 */
export function ChartEmptyState({
  chartType = "generic",
  icon,
  title,
  description,
  action,
  minHeight = "200px",
  className,
}: ChartEmptyStateProps) {
  const Icon = icon ?? chartTypeIcons[chartType];
  const displayTitle = title ?? defaultTitles[chartType];
  const displayDescription = description ?? defaultDescriptions[chartType];

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-lg p-6 text-center md:p-12",
        className
      )}
      style={{ minHeight }}
    >
      {/* Watermark logo */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <VitoraLogo
          variant="icon"
          tone="teal"
          alt=""
          className="w-28 sm:w-32 opacity-[0.045] dark:opacity-[0.06]"
          imageClassName="pointer-events-none select-none"
        />
      </div>
      {/* Foreground content */}
      <div className="relative z-10 flex max-w-sm flex-col items-center gap-2 text-center">
        <Icon className="mb-1 h-10 w-10 text-muted-foreground/60" />
        <div className="text-base font-medium tracking-tight">{displayTitle}</div>
        <p className="text-muted-foreground text-sm/relaxed">{displayDescription}</p>
      </div>
      {action && <div className="relative z-10 mt-2">{action}</div>}
    </div>
  );
}

ChartEmptyState.displayName = "ChartEmptyState";

/**
 * HOC to wrap chart components with empty state handling
 */
export function withChartEmptyState<T extends { data: unknown[] }>(
  WrappedChart: React.ComponentType<T>,
  emptyStateProps?: Omit<ChartEmptyStateProps, "className">
) {
  function ChartWithEmptyState(props: T & { emptyStateProps?: ChartEmptyStateProps }) {
    const { data, emptyStateProps: overrideProps, ...rest } = props;

    if (!data || data.length === 0) {
      return <ChartEmptyState {...emptyStateProps} {...overrideProps} />;
    }

    return <WrappedChart {...({ data, ...rest } as T)} />;
  }

  ChartWithEmptyState.displayName = `WithEmptyState(${WrappedChart.displayName || WrappedChart.name || "Chart"})`;

  return ChartWithEmptyState;
}
