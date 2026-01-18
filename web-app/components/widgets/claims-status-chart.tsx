'use client';

import { useMemo } from 'react';
import { DonutChart, createChartConfig, formatChartValue } from '@/components/charts';
import type { ClaimStatus } from '@/lib/types/sha';

export interface ClaimStatusData {
  status: ClaimStatus;
  count: number;
  amount: number;
}

interface ClaimsStatusChartProps {
  data: ClaimStatusData[];
  showLegend?: boolean;
  showByAmount?: boolean;
}

// Semantic colors for claim statuses
const statusColors: Record<ClaimStatus, string> = {
  draft: 'hsl(var(--muted-foreground))',
  pending: 'hsl(var(--warning))',
  submitted: 'hsl(var(--chart-1))',
  processing: 'hsl(var(--chart-2))',
  approved: 'hsl(var(--success))',
  rejected: 'hsl(var(--critical))',
  paid: 'hsl(var(--chart-3))',
  partial_approved: 'hsl(var(--chart-4))',
};

const statusLabels: Record<ClaimStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  submitted: 'Submitted',
  processing: 'Processing',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  partial_approved: 'Partial Approved',
};

export function ClaimsStatusChart({
  data,
  showLegend = true,
  showByAmount = false
}: ClaimsStatusChartProps) {
  // Transform data for DonutChart format
  const chartData = useMemo(
    () => (data ?? [])
      .filter((item) => (showByAmount ? item.amount > 0 : item.count > 0))
      .map((item) => ({
        name: item.status,
        value: showByAmount ? item.amount : item.count,
      })),
    [data, showByAmount]
  );

  // Create dynamic config based on statuses present
  const chartConfig = useMemo(
    () => createChartConfig(
      chartData.map((d) => d.name),
      {
        labels: Object.fromEntries(
          chartData.map((d) => [d.name, statusLabels[d.name as ClaimStatus] || d.name])
        ),
        colors: Object.fromEntries(
          chartData.map((d) => [d.name, statusColors[d.name as ClaimStatus] || 'hsl(var(--chart-1))'])
        ),
      }
    ),
    [chartData]
  );

  // Calculate total for center label
  const total = useMemo(
    () => chartData.reduce((sum, item) => sum + item.value, 0),
    [chartData]
  );

  if (!data || chartData.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
        No claims data available
      </div>
    );
  }

  return (
    <DonutChart
      data={chartData}
      config={chartConfig}
      showLegend={showLegend}
      legendPosition="right"
      innerRadius={45}
      outerRadius={85}
      showCenterLabel
      centerLabelTitle={showByAmount ? 'Total' : 'Claims'}
      centerLabelValue={showByAmount ? formatChartValue(total, 'currency') : String(total)}
      minHeight="250px"
    />
  );
}

export default ClaimsStatusChart;
