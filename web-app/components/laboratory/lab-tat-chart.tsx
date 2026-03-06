'use client';

import { useMemo, useState } from 'react';
import { LineChart, createChartConfig, ChartEmptyState } from '@/components/charts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TurnaroundTimeReport } from '@/lib/types/laboratory';

interface LabTatChartProps {
  data: TurnaroundTimeReport;
}

type ViewMode = 'by_test' | 'by_priority';

/**
 * Line chart showing turnaround time trends by test or priority.
 */
export function LabTatChart({ data }: LabTatChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('by_test');

  const chartData = useMemo(() => {
    if (viewMode === 'by_test') {
      return data.by_test
        .filter((t) => t.avg_tat_hours !== null)
        .map((item) => ({
          name: item.test_name,
          tat: Math.round((item.avg_tat_hours ?? 0) * 10) / 10,
          count: item.result_count,
        }));
    }
    return data.by_priority
      .filter((p) => p.avg_tat_hours !== null)
      .map((item) => ({
        name: item.priority,
        tat: Math.round((item.avg_tat_hours ?? 0) * 10) / 10,
        count: item.result_count,
      }));
  }, [data, viewMode]);

  const config = useMemo(
    () =>
      createChartConfig(['tat', 'count'], {
        labels: { tat: 'Avg TAT (hours)', count: 'Test Count' },
      }),
    []
  );

  if (chartData.length === 0) {
    return <ChartEmptyState chartType="line" title="No turnaround data" description="No turnaround time data available for this period" />;
  }

  return (
    <div className="space-y-4">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList className="grid w-full grid-cols-2 max-w-[240px]">
          <TabsTrigger value="by_test">By Test</TabsTrigger>
          <TabsTrigger value="by_priority">By Priority</TabsTrigger>
        </TabsList>
      </Tabs>

      <LineChart
        data={chartData}
        config={config}
        dataKeys={['tat']}
        xAxisKey="name"
        showGrid
        showTooltip
        showDots
        lineType="monotone"
        minHeight="250px"
        yAxisFormatter={(value) => `${value}h`}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
        <span>
          Overall Average:{' '}
          <strong className="text-foreground">
            {data.overall.avg_result_tat_hours !== null
              ? `${Math.round(data.overall.avg_result_tat_hours * 10) / 10} hours`
              : 'N/A'}
          </strong>
        </span>
        <span>
          Total Verified:{' '}
          <strong className="text-foreground">{data.overall.results_verified}</strong>
        </span>
      </div>
    </div>
  );
}

export default LabTatChart;
