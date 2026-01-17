"use client";

import * as React from "react";
import {
  Line,
  LineChart as RechartsLineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
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

export interface LineChartProps<T extends Record<string, unknown>> {
  /** Chart data array */
  data: T[];
  /** Configuration for chart colors and labels */
  config: ChartConfig;
  /** Data keys to render as lines */
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
  /** Show dots on data points */
  showDots?: boolean;
  /** Line type */
  lineType?: "linear" | "monotone" | "step" | "natural";
  /** Stroke width */
  strokeWidth?: number;
  /** Minimum height for the chart container */
  minHeight?: string;
  /** Additional className for the container */
  className?: string;
  /** X-axis tick formatter */
  xAxisFormatter?: (value: string) => string;
  /** Y-axis tick formatter */
  yAxisFormatter?: (value: number) => string;
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
  /** Reference lines (horizontal thresholds) */
  referenceLines?: Array<{
    y: number;
    label?: string;
    color?: string;
    strokeDasharray?: string;
  }>;
  /** Y-axis domain */
  yAxisDomain?: [number | "auto", number | "auto"];
  /** Enable zoom/brush */
  enableBrush?: boolean;
  /** Animate lines */
  animate?: boolean;
}

/**
 * Reusable Line Chart Component
 *
 * Ideal for showing trends over time, such as:
 * - Patient visits over months
 * - Revenue trends
 * - Vital signs monitoring
 *
 * @example
 * ```tsx
 * const data = [
 *   { month: "Jan", patients: 120, encounters: 180 },
 *   { month: "Feb", patients: 145, encounters: 210 },
 * ];
 *
 * const config = {
 *   patients: { label: "Patients", color: "hsl(var(--chart-1))" },
 *   encounters: { label: "Encounters", color: "hsl(var(--chart-2))" },
 * };
 *
 * <LineChart
 *   data={data}
 *   config={config}
 *   dataKeys={["patients", "encounters"]}
 *   xAxisKey="month"
 *   showLegend
 *   lineType="monotone"
 * />
 * ```
 */
export function LineChart<T extends Record<string, unknown>>({
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
  showDots = true,
  lineType = "monotone",
  strokeWidth = 2,
  minHeight = "200px",
  className,
  xAxisFormatter,
  yAxisFormatter,
  tooltipFormatter,
  tooltipIndicator = "line",
  referenceLines = [],
  yAxisDomain,
  animate = true,
}: LineChartProps<T>) {
  const defaultXFormatter = (value: string) => {
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
      <ChartContainer config={config} className={cn(`min-h-[${minHeight}]`, "w-full")}>
        <RechartsLineChart accessibilityLayer data={data}>
          {showGrid && (
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              className="stroke-muted"
            />
          )}
          {showXAxis && (
            <XAxis
              dataKey={xAxisKey}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={xAxisFormatter ?? defaultXFormatter}
              className="text-xs fill-muted-foreground"
            />
          )}
          {showYAxis && (
            <YAxis
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={yAxisFormatter}
              domain={yAxisDomain}
              className="text-xs fill-muted-foreground"
              width={60}
            />
          )}
          {referenceLines.map((refLine, index) => (
            <ReferenceLine
              key={index}
              y={refLine.y}
              label={refLine.label}
              stroke={refLine.color ?? "hsl(var(--muted-foreground))"}
              strokeDasharray={refLine.strokeDasharray ?? "3 3"}
            />
          ))}
          {showTooltip && (
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator={tooltipIndicator}
                  formatter={tooltipFormatter}
                />
              }
            />
          )}
          {showLegend && <ChartLegend content={<ChartLegendContent />} />}
          {dataKeys.map((key) => (
            <Line
              key={key}
              dataKey={key}
              type={lineType}
              stroke={`var(--color-${key})`}
              strokeWidth={strokeWidth}
              dot={showDots ? { fill: `var(--color-${key})`, r: 4 } : false}
              activeDot={showDots ? { r: 6 } : false}
              isAnimationActive={animate}
            />
          ))}
        </RechartsLineChart>
      </ChartContainer>
    </div>
  );
}

LineChart.displayName = "LineChart";
