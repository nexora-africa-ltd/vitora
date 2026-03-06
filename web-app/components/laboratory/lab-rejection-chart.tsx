'use client';

import { useMemo } from 'react';
import { DonutChart, createChartConfig, ChartEmptyState } from '@/components/charts';
import type { SampleRejectionReport } from '@/lib/types/laboratory';

interface LabRejectionChartProps {
  data: SampleRejectionReport;
}

// Color palette for rejection reasons
const REJECTION_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

/**
 * Pie/Donut chart showing sample rejection reasons.
 */
export function LabRejectionChart({ data }: LabRejectionChartProps) {
  const chartData = useMemo(() => {
    return data.reasons.map((item, index) => ({
      name: item.reason,
      value: item.count,
      fill: REJECTION_COLORS[index % REJECTION_COLORS.length],
    }));
  }, [data.reasons]);

  const config = useMemo(() => {
    const keys = data.reasons.map((item) => item.reason);
    const colors: Record<string, string> = {};
    data.reasons.forEach((item, index) => {
      colors[item.reason] = REJECTION_COLORS[index % REJECTION_COLORS.length] ?? 'hsl(var(--chart-1))';
    });
    return createChartConfig(keys, { colors });
  }, [data.reasons]);

  if (data.reasons.length === 0 || data.rejected_orders === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-success">0%</span>
          <span className="text-sm text-muted-foreground">rejection rate</span>
        </div>
        <ChartEmptyState chartType="pie" title="No rejections" description="No sample rejections in this period" />
      </div>
    );
  }

  const rejectionRate = Math.round(data.rejection_rate * 100) / 100;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-2xl font-bold ${
              rejectionRate > 5 ? 'text-destructive' : rejectionRate > 2 ? 'text-warning' : 'text-success'
            }`}
          >
            {rejectionRate}%
          </span>
          <span className="text-sm text-muted-foreground">rejection rate</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">
            {data.rejected_orders} / {data.total_orders}
          </p>
          <p className="text-xs text-muted-foreground">rejected / total</p>
        </div>
      </div>

      {/* Donut chart */}
      <DonutChart
        data={chartData}
        config={config}
        showTooltip
        showLegend
        legendPosition="bottom"
        innerRadius={60}
        outerRadius={90}
        showCenterLabel
        centerLabelTitle="Rejected"
        centerLabelValue={data.rejected_orders}
        minHeight="280px"
        useDataColors
      />
    </div>
  );
}

export default LabRejectionChart;
