'use client';

import { useMemo } from 'react';
import { DonutChart, createChartConfig, formatChartValue } from '@/components/charts';
import type { RevenueData } from '@/lib/types/dashboard';

interface RevenueBreakdownChartProps {
  data: RevenueData[];
  showLegend?: boolean;
}

export function RevenueBreakdownChart({ data, showLegend = true }: RevenueBreakdownChartProps) {
  // Transform data for DonutChart format
  const chartData = useMemo(
    () => (data ?? []).map((item) => ({
      name: item.department.toLowerCase().replace(/\s+/g, '_'),
      value: item.amount,
    })),
    [data]
  );

  // Create dynamic config based on departments in data
  const chartConfig = useMemo(
    () => createChartConfig(
      (data ?? []).map((d) => d.department.toLowerCase().replace(/\s+/g, '_')),
      {
        labels: Object.fromEntries(
          (data ?? []).map((d) => [d.department.toLowerCase().replace(/\s+/g, '_'), d.department])
        ),
      }
    ),
    [data]
  );

  // Calculate total revenue for center label
  const totalRevenue = useMemo(
    () => (data ?? []).reduce((sum, item) => sum + item.amount, 0),
    [data]
  );

  if (!data || data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
        No revenue data available
      </div>
    );
  }

  return (
    <div className="h-[250px] w-full min-h-[250px] min-w-0">
      <DonutChart
        data={chartData}
        config={chartConfig}
        showLegend={showLegend}
        legendPosition="right"
        innerRadius={40}
        outerRadius={80}
        showCenterLabel
        centerLabelTitle="Total"
        centerLabelValue={formatChartValue(totalRevenue, 'currency')}
        minHeight="250px"
      />
    </div>
  );
}

export default RevenueBreakdownChart;
