'use client';

import { useMemo } from 'react';
import { BarChart, createChartConfig } from '@/components/charts';

export interface InventoryData {
  drug_name: string;
  current_stock: number;
  reorder_level: number;
  max_level?: number;
  status: 'critical' | 'low' | 'adequate' | 'overstocked';
}

interface InventoryChartProps {
  data: InventoryData[];
  showLegend?: boolean;
  maxItems?: number;
}

// Chart configuration for inventory levels
const inventoryConfig = createChartConfig(['current_stock', 'reorder_level'], {
  labels: {
    current_stock: 'Current Stock',
    reorder_level: 'Reorder Level',
  },
  colors: {
    current_stock: 'hsl(var(--chart-1))',
    reorder_level: 'hsl(var(--warning))',
  },
});

export function InventoryChart({ data, showLegend = true, maxItems = 10 }: InventoryChartProps) {
  // Sort by urgency (critical first) and limit to maxItems
  const chartData = useMemo(() => {
    const statusPriority = { critical: 0, low: 1, adequate: 2, overstocked: 3 };
    return [...data]
      .sort((a, b) => statusPriority[a.status] - statusPriority[b.status])
      .slice(0, maxItems)
      .map((item) => ({
        name: item.drug_name.length > 15
          ? item.drug_name.slice(0, 12) + '...'
          : item.drug_name,
        current_stock: item.current_stock,
        reorder_level: item.reorder_level,
      }));
  }, [data, maxItems]);

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No inventory data available
      </div>
    );
  }

  return (
    <BarChart
      data={chartData}
      config={inventoryConfig}
      dataKeys={['current_stock', 'reorder_level']}
      xAxisKey="name"
      showGrid
      showXAxis
      showYAxis
      showTooltip
      showLegend={showLegend}
      minHeight="300px"
    />
  );
}

export default InventoryChart;
