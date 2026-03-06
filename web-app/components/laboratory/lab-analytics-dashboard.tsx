'use client';

import { useState, useMemo } from 'react';
import { RefreshCw, Download, Printer, Calendar, Clock, Activity, AlertTriangle, XCircle } from 'lucide-react';
import { subDays, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChartCard } from '@/components/reports/chart-card';
import { StatsCard } from '@/components/dashboard/stats-card';
import { HelpPopover } from '@/components/shared/help-popover';
import { LabTatChart } from './lab-tat-chart';
import { LabWorkloadChart } from './lab-workload-chart';
import { LabCriticalValuesCard } from './lab-critical-values-card';
import { LabRejectionChart } from './lab-rejection-chart';
import {
  useLabTurnaroundReport,
  useLabWorkloadReport,
  useLabCriticalValuesReport,
  useLabSampleRejectionReport,
} from '@/lib/hooks/use-laboratory';

type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth';

const datePresets: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'last30days', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
];

function getDateRange(preset: DatePreset): { start: string; end: string } {
  const today = new Date();
  const formatStr = 'yyyy-MM-dd';

  switch (preset) {
    case 'today':
      return {
        start: format(today, formatStr),
        end: format(today, formatStr),
      };
    case 'yesterday': {
      const yesterday = subDays(today, 1);
      return {
        start: format(yesterday, formatStr),
        end: format(yesterday, formatStr),
      };
    }
    case 'last7days':
      return {
        start: format(subDays(today, 7), formatStr),
        end: format(today, formatStr),
      };
    case 'last30days':
      return {
        start: format(subDays(today, 30), formatStr),
        end: format(today, formatStr),
      };
    case 'thisMonth':
      return {
        start: format(startOfMonth(today), formatStr),
        end: format(today, formatStr),
      };
    case 'lastMonth': {
      const lastMonth = subMonths(today, 1);
      return {
        start: format(startOfMonth(lastMonth), formatStr),
        end: format(endOfMonth(lastMonth), formatStr),
      };
    }
    default:
      return {
        start: format(subDays(today, 7), formatStr),
        end: format(today, formatStr),
      };
  }
}

/**
 * Lab Analytics Dashboard container.
 * Fetches and displays TAT, workload, critical values, and rejection data.
 */
export function LabAnalyticsDashboard() {
  const [preset, setPreset] = useState<DatePreset>('last7days');

  const { start, end } = useMemo(() => getDateRange(preset), [preset]);

  // Fetch all reports
  const {
    data: tatData,
    isLoading: tatLoading,
    refetch: refetchTat,
    isFetching: tatFetching,
  } = useLabTurnaroundReport(start, end);

  const {
    data: workloadData,
    isLoading: workloadLoading,
    refetch: refetchWorkload,
    isFetching: workloadFetching,
  } = useLabWorkloadReport(start, end);

  const {
    data: criticalData,
    isLoading: criticalLoading,
    refetch: refetchCritical,
    isFetching: criticalFetching,
  } = useLabCriticalValuesReport(start, end);

  const {
    data: rejectionData,
    isLoading: rejectionLoading,
    refetch: refetchRejection,
    isFetching: rejectionFetching,
  } = useLabSampleRejectionReport(start, end);

  const isLoading = tatLoading || workloadLoading || criticalLoading || rejectionLoading;
  const isFetching = tatFetching || workloadFetching || criticalFetching || rejectionFetching;

  const handleRefresh = () => {
    refetchTat();
    refetchWorkload();
    refetchCritical();
    refetchRejection();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    const exportData = {
      period: { start, end, preset },
      turnaroundTime: tatData,
      workload: workloadData,
      criticalValues: criticalData,
      sampleRejection: rejectionData,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lab-analytics-${start}-to-${end}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <LabAnalyticsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header with filters and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {datePresets.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
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

      {/* KPI Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Avg TAT"
          value={
            tatData?.overall.avg_result_tat_hours !== null
              ? `${Math.round((tatData?.overall.avg_result_tat_hours ?? 0) * 10) / 10}h`
              : 'N/A'
          }
          description={`${tatData?.overall.results_verified ?? 0} results verified`}
          icon={Clock}
          variant="info"
        />
        <StatsCard
          title="Tests Processed"
          value={workloadData?.totals.tests_verified ?? 0}
          description={`${workloadData?.totals.tests_entered ?? 0} entered`}
          icon={Activity}
          variant="success"
        />
        <StatsCard
          title="Critical Values"
          value={criticalData?.total_critical ?? 0}
          description="Requires immediate attention"
          icon={AlertTriangle}
          variant={criticalData?.total_critical && criticalData.total_critical > 0 ? 'destructive' : 'default'}
        />
        <StatsCard
          title="Rejection Rate"
          value={`${Math.round((rejectionData?.rejection_rate ?? 0) * 100) / 100}%`}
          description={`${rejectionData?.rejected_orders ?? 0} of ${rejectionData?.total_orders ?? 0}`}
          icon={XCircle}
          variant={
            (rejectionData?.rejection_rate ?? 0) > 5
              ? 'destructive'
              : (rejectionData?.rejection_rate ?? 0) > 2
                ? 'warning'
                : 'success'
          }
        />
      </div>

      {/* Charts Row 1: TAT and Workload */}
      <div className="grid gap-6 md:grid-cols-2">
        <ChartCard
          title="Turnaround Time"
          isLoading={tatLoading}
          action={
            <HelpPopover content="Average time from sample collection to result verification. Lower TAT indicates faster lab processing. Toggle between test types and priority levels." />
          }
        >
          {tatData && <LabTatChart data={tatData} />}
        </ChartCard>

        <ChartCard
          title="Workload"
          isLoading={workloadLoading}
          action={
            <HelpPopover content="Number of tests entered into the system vs. verified by technicians. View daily trends or compare technician productivity." />
          }
        >
          {workloadData && <LabWorkloadChart data={workloadData} />}
        </ChartCard>
      </div>

      {/* Charts Row 2: Critical Values and Rejections */}
      <div className="grid gap-6 md:grid-cols-2">
        {criticalData && (
          <LabCriticalValuesCard data={criticalData} isLoading={criticalLoading} />
        )}

        <ChartCard
          title="Sample Rejections"
          isLoading={rejectionLoading}
          action={
            <HelpPopover content="Percentage of samples rejected due to quality issues. Common reasons include hemolysis, clotting, and insufficient volume. Lower rates indicate better pre-analytical processes." />
          }
        >
          {rejectionData && <LabRejectionChart data={rejectionData} />}
        </ChartCard>
      </div>
    </div>
  );
}

function LabAnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Skeleton className="h-10 w-[180px]" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-[350px]" />
        <Skeleton className="h-[350px]" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[350px]" />
      </div>
    </div>
  );
}

export default LabAnalyticsDashboard;
