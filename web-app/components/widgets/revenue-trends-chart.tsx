'use client';

import { useMemo } from 'react';
import { AreaChart, createChartConfig, formatChartValue } from '@/components/charts';
import { format, parseISO } from 'date-fns';

export interface RevenueDataPoint {
  date: string;
  total: number;
  cash?: number;
  mpesa?: number;
  insurance?: number;
  card?: number;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
  showLegend?: boolean;
  showByMethod?: boolean;
}

// Chart configuration for revenue trends
const revenueConfig = createChartConfig(['total', 'cash', 'mpesa', 'insurance', 'card'], {
  labels: {
    total: 'Total Revenue',
    cash: 'Cash',
    mpesa: 'M-Pesa',
    insurance: 'Insurance',
    card: 'Card',
  },
  colors: {
    total: 'hsl(var(--chart-1))',
    cash: 'hsl(var(--success))',
    mpesa: 'hsl(var(--chart-2))',
    insurance: 'hsl(var(--chart-3))',
    card: 'hsl(var(--chart-4))',
  },
});

export function RevenueChart({ data, showLegend = true, showByMethod = false }: RevenueChartProps) {
  // Format dates for display
  const chartData = useMemo(
    () => (data ?? []).map((item) => ({
      ...item,
      formattedDate: format(parseISO(item.date), 'MMM d'),
    })),
    [data]
  );

  // Calculate totals for summary
  const totalRevenue = useMemo(
    () => (data ?? []).reduce((sum, item) => sum + item.total, 0),
    [data]
  );

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No revenue data available
      </div>
    );
  }

  // Determine which data keys to show
  const dataKeys = showByMethod 
    ? ['cash', 'mpesa', 'insurance', 'card'] as const
    : ['total'] as const;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-sm text-muted-foreground">
          Total: {formatChartValue(totalRevenue, 'currency')}
        </span>
      </div>
      <AreaChart
        data={chartData}
        config={revenueConfig}
        dataKeys={[...dataKeys]}
        xAxisKey="formattedDate"
        showGrid
        showXAxis
        showYAxis
        showTooltip
        showLegend={showLegend && showByMethod}
        showGradient
        stacked={showByMethod}
        areaType="monotone"
        minHeight="280px"
      />
    </div>
  );
}

export default RevenueChart;
