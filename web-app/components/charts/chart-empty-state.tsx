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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
    <Empty
      className={cn("border-none", className)}
      style={{ minHeight }}
    >
      <EmptyHeader>
        <EmptyMedia>
          <Icon className="h-12 w-12 text-muted-foreground/60" />
        </EmptyMedia>
        <EmptyTitle>{displayTitle}</EmptyTitle>
        <EmptyDescription>{displayDescription}</EmptyDescription>
      </EmptyHeader>
      {action && <div className="mt-2">{action}</div>}
    </Empty>
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
