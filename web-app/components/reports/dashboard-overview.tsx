'use client';

import { useState, useMemo } from 'react';
import { RefreshCw, Download, Printer, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KPICard } from './kpi-card';
import { ChartCard } from './chart-card';
import { PatientVolumeChart } from '@/components/widgets/patient-volume-chart';
import { RevenueBreakdownChart } from '@/components/widgets/revenue-chart';
import { RecentActivity } from '@/components/widgets/recent-activity';
import { DonutChart, createChartConfig, formatChartValue, ChartEmptyState } from '@/components/charts';
import { useDashboardMetrics } from '@/lib/hooks/use-dashboard-metrics';
import type { DateRangeFilter } from '@/lib/types/dashboard';

const datePresets: { value: DateRangeFilter['preset']; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'last30days', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
];

export function DashboardOverview() {
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>({
    start: '',
    end: '',
    preset: 'last7days',
  });

  const { data: metrics, isLoading, refetch, isFetching } = useDashboardMetrics(dateFilter);

  const handlePresetChange = (preset: string) => {
    setDateFilter({
      start: '',
      end: '',
      preset: preset as DateRangeFilter['preset'],
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // In production, this would generate a CSV/PDF export
    const data = JSON.stringify(metrics, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header with filters and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={dateFilter.preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {datePresets.map((preset) => (
                <SelectItem key={preset.value} value={preset.value!}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {metrics?.kpis.map((kpi) => (
          <KPICard key={kpi.id} {...kpi} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <ChartCard
          title="Patient Volume"
          description="Daily registrations and encounters"
          isLoading={isLoading}
        >
          {metrics?.patientVolume && (
            <PatientVolumeChart data={metrics.patientVolume} />
          )}
        </ChartCard>

        <ChartCard
          title="Revenue by Department"
          description="Revenue breakdown for selected period"
          isLoading={isLoading}
        >
          {metrics?.revenueBreakdown && (
            <RevenueBreakdownChart data={metrics.revenueBreakdown} />
          )}
        </ChartCard>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Encounter Types Chart */}
          <ChartCard
            title="Encounter Types"
            description="Distribution by type (OPD, IPD, Emergency)"
          >
            {metrics?.patientVolume && (
              <EncounterTypesChart patientVolume={metrics.patientVolume} />
            )}
          </ChartCard>
        </div>

        <div>
          {metrics?.recentActivity && (
            <RecentActivity activities={metrics.recentActivity} maxHeight="350px" />
          )}
        </div>
      </div>
    </div>
  );
}

// Encounter Types DonutChart component
function EncounterTypesChart({ patientVolume }: { patientVolume: Array<{ opd: number; ipd: number; emergency: number }> }) {
  const chartData = useMemo(() => {
    // Sum up all encounter types from the volume data
    const opd = patientVolume.reduce((sum, d) => sum + (d.opd || 0), 0);
    const ipd = patientVolume.reduce((sum, d) => sum + (d.ipd || 0), 0);
    const emergency = patientVolume.reduce((sum, d) => sum + (d.emergency || 0), 0);
    
    // Filter out zero values to avoid cluttering the chart
    return [
      { name: 'opd', value: opd },
      { name: 'ipd', value: ipd },
      { name: 'emergency', value: emergency },
    ].filter(item => item.value > 0);
  }, [patientVolume]);

  const totalEncounters = useMemo(
    () => chartData.reduce((sum, item) => sum + item.value, 0),
    [chartData]
  );

  const chartConfig = useMemo(
    () => createChartConfig(['opd', 'ipd', 'emergency'], {
      labels: {
        opd: 'OPD Visits',
        ipd: 'IPD Admissions',
        emergency: 'Emergency',
      },
      colors: {
        opd: 'hsl(var(--chart-1))',
        ipd: 'hsl(var(--chart-2))',
        emergency: 'hsl(var(--critical))',
      },
    }),
    []
  );

  // Show empty state when no data
  if (!patientVolume || patientVolume.length === 0 || totalEncounters === 0) {
    return (
      <ChartEmptyState
        chartType="donut"
        title="No encounter data"
        description="Encounter data will appear here once patients have been seen."
        minHeight="200px"
      />
    );
  }

  return (
    <DonutChart
      data={chartData}
      config={chartConfig}
      showLegend
      legendPosition="right"
      innerRadius={50}
      outerRadius={90}
      showCenterLabel
      centerLabelTitle="Total"
      centerLabelValue={formatChartValue(totalEncounters, 'compact')}
      minHeight="200px"
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-44" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>

      {/* Bottom row skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[300px] lg:col-span-2" />
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}

export default DashboardOverview;
