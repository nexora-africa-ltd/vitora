'use client';

import { useMemo, useState } from 'react';
import { BarChart, LineChart, createChartConfig, ChartEmptyState } from '@/components/charts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WorkloadReport } from '@/lib/types/laboratory';

interface LabWorkloadChartProps {
  data: WorkloadReport;
}

type ViewMode = 'by_day' | 'by_technician';

/**
 * Chart showing lab workload by day or technician.
 */
export function LabWorkloadChart({ data }: LabWorkloadChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('by_day');

  const config = useMemo(
    () =>
      createChartConfig(['tests_entered', 'tests_verified', 'entered_count', 'verified_count'], {
        labels: {
          tests_entered: 'Tests Entered',
          tests_verified: 'Tests Verified',
          entered_count: 'Entered',
          verified_count: 'Verified',
        },
      }),
    []
  );

  const dailyData = useMemo(() => {
    return data.by_day.map((item) => ({
      date: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      tests_entered: item.tests_entered,
      tests_verified: item.tests_verified,
    }));
  }, [data.by_day]);

  const technicianData = useMemo(() => {
    return data.by_technician.map((item) => ({
      name: item.technician_name,
      entered_count: item.entered_count,
      verified_count: item.verified_count,
    }));
  }, [data.by_technician]);

  if (dailyData.length === 0 && technicianData.length === 0) {
    return <ChartEmptyState chartType="bar" title="No workload data" description="No workload data available for this period" />;
  }

  return (
    <div className="space-y-4">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList className="grid w-full grid-cols-2 max-w-[240px]">
          <TabsTrigger value="by_day">By Day</TabsTrigger>
          <TabsTrigger value="by_technician">By Technician</TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === 'by_day' ? (
        dailyData.length > 0 ? (
          <LineChart
            data={dailyData}
            config={config}
            dataKeys={['tests_entered', 'tests_verified']}
            xAxisKey="date"
            showGrid
            showTooltip
            showLegend
            showDots
            lineType="monotone"
            minHeight="250px"
          />
        ) : (
          <ChartEmptyState chartType="line" title="No daily data" description="No daily workload data available" />
        )
      ) : technicianData.length > 0 ? (
        <BarChart
          data={technicianData}
          config={config}
          dataKeys={['entered_count', 'verified_count']}
          xAxisKey="name"
          showGrid
          showTooltip
          showLegend
          stacked={false}
          minHeight="250px"
        />
      ) : (
        <ChartEmptyState chartType="bar" title="No technician data" description="No technician workload data available" />
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
        <span>
          Total Entered:{' '}
          <strong className="text-foreground">{data.totals.tests_entered}</strong>
        </span>
        <span>
          Total Verified:{' '}
          <strong className="text-foreground">{data.totals.tests_verified}</strong>
        </span>
      </div>
    </div>
  );
}

export default LabWorkloadChart;
