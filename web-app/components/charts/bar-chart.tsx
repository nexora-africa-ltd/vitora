"use client";

import * as React from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface BarChartProps<T extends Record<string, unknown>> {
  /** Chart data array */
  data: T[];
  /** Configuration for chart colors and labels */
  config: ChartConfig;
  /** Data keys to render as bars */
  dataKeys: string[];
  /** Key to use for X-axis labels */
  xAxisKey: string;
  /** Chart title (optional) */
  title?: string;
  /** Chart description (optional) */
  description?: string;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show X-axis */
  showXAxis?: boolean;
  /** Show Y-axis */
  showYAxis?: boolean;
  /** Show tooltip */
  showTooltip?: boolean;
  /** Show legend */
  showLegend?: boolean;
  /** Bar radius for rounded corners */
  barRadius?: number;
  /** Stack the bars */
  stacked?: boolean;
  /** Layout direction */
  layout?: "horizontal" | "vertical";
  /** Minimum height for the chart container */
  minHeight?: string;
  /** Additional className for the container */
  className?: string;
  /** X-axis tick formatter */
  xAxisFormatter?: (value: string) => string;
  /** Y-axis tick formatter */
  yAxisFormatter?: (value: number | string) => string;
  /** Custom tooltip formatter */
  tooltipFormatter?: (
    value: ValueType,
    name: NameType,
    item: unknown,
    index: number,
    payload: unknown
  ) => React.ReactNode;
  /** Tooltip indicator style */
  tooltipIndicator?: "line" | "dot" | "dashed";
  /** Hide tooltip label */
  hideTooltipLabel?: boolean;
  /** Width of Y-axis (useful for vertical layouts with long labels) */
  yAxisWidth?: number;
  /** Bar gap (for grouped bars) */
  barGap?: number;
  /** Category gap (space between bar groups) */
  categoryGap?: string | number;
  /** Click handler for bars */
  onBarClick?: (data: T, index: number) => void;
}

/**
 * Reusable Bar Chart Component
 *
 * @example
 * ```tsx
 * const data = [
 *   { month: "Jan", desktop: 186, mobile: 80 },
 *   { month: "Feb", desktop: 305, mobile: 200 },
 * ];
 *
 * const config = {
 *   desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },
 *   mobile: { label: "Mobile", color: "hsl(var(--chart-2))" },
 * };
 *
 * <BarChart
 *   data={data}
 *   config={config}
 *   dataKeys={["desktop", "mobile"]}
 *   xAxisKey="month"
 *   showLegend
 * />
 * ```
 */
export function BarChart<T extends Record<string, unknown>>({
  data,
  config,
  dataKeys,
  xAxisKey,
  title,
  description,
  showGrid = true,
  showXAxis = true,
  showYAxis = false,
  showTooltip = true,
  showLegend = false,
  barRadius = 4,
  stacked = false,
  layout = "horizontal",
  minHeight = "200px",
  className,
  xAxisFormatter,
  yAxisFormatter,
  tooltipFormatter,
  tooltipIndicator = "dot",
  hideTooltipLabel = false,
  yAxisWidth = 80,
  barGap = 4,
  categoryGap = "20%",
  onBarClick,
}: BarChartProps<T>) {
  const defaultXFormatter = (value: string) => {
    // Truncate long labels
    return value.length > 3 ? value.slice(0, 3) : value;
  };

  return (
    <div className={cn("w-full", className)}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <ChartContainer config={config} className={cn(`min-h-[${minHeight}]`, "aspect-auto w-full")}>
        <RechartsBarChart
          accessibilityLayer
          data={data}
          layout={layout}
          barGap={barGap}
          barCategoryGap={categoryGap}
        >
          {showGrid && (
            <CartesianGrid
              vertical={layout === "vertical"}
              horizontal={layout === "horizontal"}
              strokeDasharray="3 3"
              className="stroke-muted"
            />
          )}
          {showXAxis && (
            <XAxis
              dataKey={layout === "horizontal" ? xAxisKey : undefined}
              type={layout === "horizontal" ? "category" : "number"}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={xAxisFormatter ?? defaultXFormatter}
              className="text-xs fill-muted-foreground"
            />
          )}
          {showYAxis && (
            <YAxis
              dataKey={layout === "vertical" ? xAxisKey : undefined}
              type={layout === "vertical" ? "category" : "number"}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={yAxisFormatter}
              className="text-xs fill-muted-foreground"
              width={yAxisWidth}
            />
          )}
          {showTooltip && (
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator={tooltipIndicator}
                  hideLabel={hideTooltipLabel}
                  formatter={tooltipFormatter}
                />
              }
            />
          )}
          {showLegend && <ChartLegend content={<ChartLegendContent />} />}
          {dataKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`var(--color-${key})`}
              radius={barRadius}
              stackId={stacked ? "stack" : undefined}
              onClick={onBarClick ? (data) => onBarClick(data as T, index) : undefined}
              className={onBarClick ? "cursor-pointer" : undefined}
            />
          ))}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}

BarChart.displayName = "BarChart";
