"use client";

import * as React from "react";
import { Pie, PieChart as RechartsPieChart, Cell, Label } from "recharts";
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

export interface PieChartDataItem {
  name: string;
  value: number;
  fill?: string;
}

export interface PieChartProps {
  /** Chart data array with name and value */
  data: PieChartDataItem[];
  /** Configuration for chart colors and labels */
  config: ChartConfig;
  /** Data key for the name/category field */
  nameKey?: string;
  /** Data key for the value field */
  dataKey?: string;
  /** Chart title (optional) */
  title?: string;
  /** Chart description (optional) */
  description?: string;
  /** Show tooltip */
  showTooltip?: boolean;
  /** Show legend */
  showLegend?: boolean;
  /** Legend position */
  legendPosition?: "top" | "bottom" | "left" | "right";
  /** Inner radius for donut chart (0 for pie, >0 for donut) */
  innerRadius?: number;
  /** Outer radius */
  outerRadius?: number;
  /** Padding angle between segments */
  paddingAngle?: number;
  /** Corner radius of segments */
  cornerRadius?: number;
  /** Start angle in degrees */
  startAngle?: number;
  /** End angle in degrees */
  endAngle?: number;
  /** Show center label (for donut charts) */
  showCenterLabel?: boolean;
  /** Center label title */
  centerLabelTitle?: string;
  /** Center label value */
  centerLabelValue?: string | number;
  /** Minimum height for the chart container */
  minHeight?: string;
  /** Additional className for the container */
  className?: string;
  /** Tooltip indicator style */
  tooltipIndicator?: "line" | "dot" | "dashed";
  /** Custom tooltip formatter */
  tooltipFormatter?: (
    value: ValueType,
    name: NameType,
    item: unknown,
    index: number,
    payload: unknown
  ) => React.ReactNode;
  /** Click handler for segments */
  onSegmentClick?: (data: PieChartDataItem, index: number) => void;
  /** Use fill colors from data */
  useDataColors?: boolean;
}

/**
 * Reusable Pie/Donut Chart Component
 *
 * Ideal for showing proportions and distributions:
 * - Gender distribution
 * - Encounter type breakdown
 * - Status distributions
 *
 * @example
 * ```tsx
 * // Pie Chart
 * const data = [
 *   { name: "male", value: 400 },
 *   { name: "female", value: 300 },
 *   { name: "other", value: 50 },
 * ];
 *
 * const config = {
 *   male: { label: "Male", color: "hsl(var(--chart-1))" },
 *   female: { label: "Female", color: "hsl(var(--chart-2))" },
 *   other: { label: "Other", color: "hsl(var(--chart-3))" },
 * };
 *
 * <PieChart data={data} config={config} showLegend />
 *
 * // Donut Chart with center label
 * <PieChart
 *   data={data}
 *   config={config}
 *   innerRadius={60}
 *   showCenterLabel
 *   centerLabelTitle="Total"
 *   centerLabelValue={750}
 * />
 * ```
 */
export function PieChart({
  data,
  config,
  nameKey = "name",
  dataKey = "value",
  title,
  description,
  showTooltip = true,
  showLegend = true,
  legendPosition = "bottom",
  innerRadius = 0,
  outerRadius = 80,
  paddingAngle = 0,
  cornerRadius = 0,
  startAngle = 0,
  endAngle = 360,
  showCenterLabel = false,
  centerLabelTitle,
  centerLabelValue,
  minHeight = "250px",
  className,
  tooltipIndicator = "dot",
  tooltipFormatter,
  onSegmentClick,
  useDataColors = false,
}: PieChartProps) {
  // Calculate total for center label if not provided
  const total = React.useMemo(() => {
    if (centerLabelValue !== undefined) return centerLabelValue;
    return data.reduce((sum, item) => sum + item.value, 0);
  }, [data, centerLabelValue]);

  // Prepare data with fill colors from config
  const chartData = React.useMemo(() => {
    return data.map((item) => ({
      ...item,
      fill: useDataColors && item.fill ? item.fill : `var(--color-${item.name})`,
    }));
  }, [data, useDataColors]);

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
      <ChartContainer
        config={config}
        className={cn(`min-h-[${minHeight}] mx-auto aspect-square max-h-[300px]`)}
      >
        <RechartsPieChart accessibilityLayer>
          {showTooltip && (
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator={tooltipIndicator}
                  nameKey={nameKey}
                  formatter={tooltipFormatter}
                  hideLabel
                />
              }
            />
          )}
          {showLegend && (
            <ChartLegend
              content={<ChartLegendContent nameKey={nameKey} />}
              verticalAlign={legendPosition === "top" ? "top" : "bottom"}
              align={legendPosition === "left" ? "left" : legendPosition === "right" ? "right" : "center"}
            />
          )}
          <Pie
            data={chartData}
            dataKey={dataKey}
            nameKey={nameKey}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={paddingAngle}
            cornerRadius={cornerRadius}
            startAngle={startAngle}
            endAngle={endAngle}
            strokeWidth={2}
            onClick={
              onSegmentClick
                ? (_, index) => {
                    const item = data[index];
                    if (item) onSegmentClick(item, index);
                  }
                : undefined
            }
            className={onSegmentClick ? "cursor-pointer" : undefined}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
            {showCenterLabel && innerRadius > 0 && (
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {typeof total === "number" ? total.toLocaleString() : total}
                        </tspan>
                        {centerLabelTitle && (
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 20}
                            className="fill-muted-foreground text-sm"
                          >
                            {centerLabelTitle}
                          </tspan>
                        )}
                      </text>
                    );
                  }
                  return null;
                }}
              />
            )}
          </Pie>
        </RechartsPieChart>
      </ChartContainer>
    </div>
  );
}

PieChart.displayName = "PieChart";

/**
 * Convenience component for Donut Charts
 */
export function DonutChart(props: Omit<PieChartProps, "innerRadius"> & { innerRadius?: number }) {
  return <PieChart innerRadius={60} showCenterLabel {...props} />;
}

DonutChart.displayName = "DonutChart";
