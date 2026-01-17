'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { AreaChart, createChartConfig } from '@/components/charts';
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
      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
        No data available
      </div>
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
