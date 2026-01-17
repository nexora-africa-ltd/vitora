"use client";

import * as React from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
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

export interface AreaChartProps<T extends Record<string, unknown>> {
  /** Chart data array */
  data: T[];
  /** Configuration for chart colors and labels */
  config: ChartConfig;
  /** Data keys to render as areas */
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
  /** Area type (curve interpolation) */
  areaType?: "linear" | "monotone" | "step" | "natural" | "basis";
  /** Fill opacity for the area */
  fillOpacity?: number;
  /** Stroke width for the line */
  strokeWidth?: number;
  /** Stack the areas */
  stacked?: boolean;
  /** Show gradient fill */
  showGradient?: boolean;
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
  /** Show dots on data points */
  showDots?: boolean;
  /** Connect nulls in data */
  connectNulls?: boolean;
}

/**
 * Reusable Area Chart Component
 *
 * Ideal for showing volume/quantity over time:
 * - Patient volume trends
 * - Revenue over time
 * - Cumulative metrics
 *
 * @example
 * ```tsx
 * const data = [
 *   { month: "Jan", patients: 120 },
 *   { month: "Feb", patients: 145 },
 * ];
 *
 * const config = {
 *   patients: { label: "Patients", color: "hsl(var(--chart-1))" },
 * };
 *
 * <AreaChart
 *   data={data}
 *   config={config}
 *   dataKeys={["patients"]}
 *   xAxisKey="month"
 *   showGradient
 * />
 * ```
 */
export function AreaChart<T extends Record<string, unknown>>({
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
  areaType = "monotone",
  fillOpacity = 0.4,
  strokeWidth = 2,
  stacked = false,
  showGradient = true,
  minHeight = "200px",
  className,
  xAxisFormatter,
  yAxisFormatter,
  tooltipFormatter,
  tooltipIndicator = "line",
  referenceLines = [],
  yAxisDomain,
  showDots = false,
  connectNulls = true,
}: AreaChartProps<T>) {
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
        <RechartsAreaChart accessibilityLayer data={data}>
          {/* Define gradients for each data key */}
          {showGradient && (
            <defs>
              {dataKeys.map((key) => (
                <linearGradient
                  key={`gradient-${key}`}
                  id={`gradient-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.1}
                  />
                </linearGradient>
              ))}
            </defs>
          )}
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
            <Area
              key={key}
              dataKey={key}
              type={areaType}
              fill={showGradient ? `url(#gradient-${key})` : `var(--color-${key})`}
              fillOpacity={showGradient ? 1 : fillOpacity}
              stroke={`var(--color-${key})`}
              strokeWidth={strokeWidth}
              stackId={stacked ? "stack" : undefined}
              dot={showDots ? { fill: `var(--color-${key})`, r: 4 } : false}
              activeDot={showDots ? { r: 6 } : false}
              connectNulls={connectNulls}
            />
          ))}
        </RechartsAreaChart>
      </ChartContainer>
    </div>
  );
}

AreaChart.displayName = "AreaChart";

/**
 * Stacked Area Chart convenience component
 */
export function StackedAreaChart<T extends Record<string, unknown>>(
  props: Omit<AreaChartProps<T>, "stacked">
) {
  return <AreaChart stacked {...props} />;
}

StackedAreaChart.displayName = "StackedAreaChart";
