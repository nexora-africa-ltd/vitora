'use client';

import { useState } from 'react';
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
          {/* Placeholder for additional charts or tables */}
          <ChartCard
            title="Encounter Types"
            description="Distribution by type (OPD, IPD, Emergency)"
          >
            {metrics?.patientVolume && (
              <div className="grid grid-cols-3 gap-4 py-8">
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">
                    {metrics.patientVolume.reduce((sum, d) => sum + d.opd, 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">OPD Visits</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">
                    {metrics.patientVolume.reduce((sum, d) => sum + d.ipd, 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">IPD Admissions</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-destructive">
                    {metrics.patientVolume.reduce((sum, d) => sum + d.emergency, 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Emergency</p>
                </div>
              </div>
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
