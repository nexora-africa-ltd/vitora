'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { AreaChart, createChartConfig, ChartEmptyState } from '@/components/charts';
import type { PatientVolumeData } from '@/lib/types/dashboard';

interface PatientVolumeChartProps {
  data: PatientVolumeData[];
  showLegend?: boolean;
}

// Chart configuration for patient volume metrics
const patientVolumeConfig = createChartConfig(['registrations', 'encounters'], {
  labels: {
    registrations: 'Registrations',
    encounters: 'Encounters',
  },
});

export function PatientVolumeChart({ data, showLegend = true }: PatientVolumeChartProps) {
  // Format dates for display - must be before early return
  const formattedData = useMemo(
    () => (data ?? []).map((item) => ({
      ...item,
      formattedDate: format(parseISO(item.date), 'MMM d'),
    })),
    [data]
  );

  if (!data || data.length === 0) {
    return (
      <ChartEmptyState
        chartType="area"
        title="No volume data"
        description="Patient volume data will appear here once registrations and encounters are recorded."
        minHeight="250px"
      />
    );
  }

  return (
    <div className="h-[250px] w-full min-h-[250px] min-w-0">
      <AreaChart
        data={formattedData}
        config={patientVolumeConfig}
        dataKeys={['registrations', 'encounters']}
        xAxisKey="formattedDate"
        showGrid
        showXAxis
        showYAxis
        showTooltip
        showLegend={showLegend}
        showGradient
        areaType="monotone"
        minHeight="250px"
      />
    </div>
  );
}

export default PatientVolumeChart;
