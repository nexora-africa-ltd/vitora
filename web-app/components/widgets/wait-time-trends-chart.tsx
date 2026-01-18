'use client';

import { useMemo } from 'react';
import { LineChart, createChartConfig } from '@/components/charts';
import { format, parseISO } from 'date-fns';

export interface WaitTimeDataPoint {
  date: string;
  avg_wait_minutes: number;
  median_wait_minutes?: number;
  target_minutes?: number;
  triaged_count?: number;
}

interface WaitTimeTrendsChartProps {
  data: WaitTimeDataPoint[];
  showLegend?: boolean;
  showTarget?: boolean;
  targetMinutes?: number;
}

// Chart configuration for wait time trends
const waitTimeConfig = createChartConfig(['avg_wait_minutes', 'median_wait_minutes', 'target_minutes'], {
  labels: {
    avg_wait_minutes: 'Avg Wait',
    median_wait_minutes: 'Median Wait',
    target_minutes: 'Target',
  },
  colors: {
    avg_wait_minutes: 'hsl(var(--chart-1))',
    median_wait_minutes: 'hsl(var(--chart-2))',
    target_minutes: 'hsl(var(--warning))',
  },
});

export function WaitTimeTrendsChart({
  data,
  showLegend = true,
  showTarget = true,
  targetMinutes = 15,
}: WaitTimeTrendsChartProps) {
  // Format dates and add target line
  const chartData = useMemo(
    () => (data ?? []).map((item) => ({
      ...item,
      formattedDate: format(parseISO(item.date), 'MMM d'),
      target_minutes: showTarget ? targetMinutes : undefined,
    })),
    [data, showTarget, targetMinutes]
  );

  // Calculate average for summary
  const overallAvg = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + item.avg_wait_minutes, 0);
    return Math.round(sum / data.length);
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
        No wait time data available
      </div>
    );
  }

  // Determine which data keys to show
  const dataKeys = showTarget
    ? ['avg_wait_minutes', 'target_minutes'] as const
    : ['avg_wait_minutes'] as const;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-sm text-muted-foreground">
          Period Avg: <span className="font-medium text-foreground">{overallAvg} min</span>
        </span>
        {showTarget && (
          <span className="text-sm text-muted-foreground">
            Target: <span className="font-medium text-warning">{targetMinutes} min</span>
          </span>
        )}
      </div>
      <LineChart
        data={chartData}
        config={waitTimeConfig}
        dataKeys={[...dataKeys]}
        xAxisKey="formattedDate"
        showGrid
        showXAxis
        showYAxis
        showTooltip
        showLegend={showLegend}
        showDots
        lineType="monotone"
        minHeight="220px"
      />
    </div>
  );
}

export default WaitTimeTrendsChart;
