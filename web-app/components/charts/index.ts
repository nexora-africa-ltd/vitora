/**
 * Vitora HMIS Charts Library
 *
 * Reusable chart components built on top of shadcn/ui chart primitives.
 * All charts use Recharts under the hood and are fully customizable.
 *
 * @example
 * ```tsx
 * import {
 *   BarChart,
 *   LineChart,
 *   PieChart,
 *   AreaChart,
 *   genderChartConfig,
 *   encounterTypeConfig,
 * } from "@/components/charts";
 * ```
 */

// Chart Components
export { BarChart } from "./bar-chart";
export type { BarChartProps } from "./bar-chart";

export { LineChart } from "./line-chart";
export type { LineChartProps } from "./line-chart";

export { PieChart, DonutChart } from "./pie-chart";
export type { PieChartProps, PieChartDataItem } from "./pie-chart";

export { AreaChart, StackedAreaChart } from "./area-chart";
export type { AreaChartProps } from "./area-chart";

export { TrendIndicator, TrendBadge, calculateTrend } from "./trend-indicator";
export type { TrendIndicatorProps, TrendBadgeProps, TrendDirection } from "./trend-indicator";

// Chart Configurations
export {
  // Color utilities
  chartColors,
  createChartConfig,
  formatChartValue,
  monthNames,
  monthNamesShort,
  // Pre-built configs for HMIS use cases
  genderChartConfig,
  encounterTypeConfig,
  vitalStatusConfig,
  syncStatusConfig,
  revenueConfig,
  labStatusConfig,
  inventoryConfig,
  claimsStatusConfig,
  monthlyTrendConfig,
  queueStatusConfig,
} from "./chart-config";

// Re-export base chart primitives for custom usage
export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  type ChartConfig,
} from "@/components/ui/chart";
