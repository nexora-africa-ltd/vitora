/**
 * Triage Module - Reports Page
 *
 * Comprehensive reporting dashboard for triage performance metrics.
 * Displays wait time analysis, volume distribution, and LWBS statistics.
 *
 * Route: /triage/reports
 */
'use client';

import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { TriageReportsPage as TriageReportsComponent } from '@/components/triage';
import { useTriageReports, useExportTriageReport } from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';
import type { DateRangePreset, ReportFilters } from '@/components/triage';
import type { TriageCategory, AssignedArea } from '@/lib/types/triage';

// Local filters interface that allows 'all' values
interface LocalReportFilters {
  dateRange: DateRangePreset;
  customStartDate?: string;
  customEndDate?: string;
  area?: AssignedArea | 'all';
  category?: TriageCategory | 'all';
}

export default function TriageReportsPage() {

  const [filters, setFilters] = useState<LocalReportFilters>({
    dateRange: 'last_7_days',
    area: 'all',
    category: 'all',
  });

  // Fetch report data
  const { data: reportData, isLoading, refetch } = useTriageReports({
    dateRange: filters.dateRange,
    customStartDate: filters.customStartDate,
    customEndDate: filters.customEndDate,
    area: filters.area !== 'all' ? filters.area : undefined,
    category: filters.category !== 'all' ? filters.category : undefined,
  });

  // Export mutation
  const { mutateAsync: exportReport } = useExportTriageReport();

  const handleDateRangeChange = useCallback(
    (preset: DateRangePreset, customDates?: { start: string; end: string }) => {
      setFilters((prev) => ({
        ...prev,
        dateRange: preset,
        customStartDate: customDates?.start,
        customEndDate: customDates?.end,
      }));
    },
    []
  );

  const handleFilterChange = useCallback((newFilters: Partial<LocalReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const handleExport = useCallback(
    async (format: 'pdf' | 'csv' | 'excel') => {
      try {
        const exportFilters = {
          dateRange: filters.dateRange,
          customStartDate: filters.customStartDate,
          customEndDate: filters.customEndDate,
          area: filters.area !== 'all' ? filters.area : undefined,
          category: filters.category !== 'all' ? filters.category : undefined,
        };
        await exportReport({
          format,
          filters: exportFilters,
        });
        toast({
          title: 'Export Started',
          description: `Report will be downloaded as ${format.toUpperCase()}.`,
        });
      } catch (error) {
        toast({
          title: 'Export Failed',
          description: 'Failed to export report. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [exportReport, filters]
  );

  // Default report data for loading state
  const defaultReportData = {
    date_range: { start: '', end: '' },
    total_assessments: 0,
    avg_wait_time_minutes: 0,
    median_wait_time_minutes: 0,
    target_met_percentage: 0,
    wait_times_by_category: [],
    volume_by_category: [],
    volume_by_area: [],
    staff_performance: [],
    wait_time_trend: [],
    lwbs_stats: {
      total_lwbs: 0,
      lwbs_rate: 0,
      avg_wait_before_lwbs_minutes: 0,
      by_category: [],
    },
  };

  return (
    <PullToRefresh onRefresh={() => { refetch(); }} isRefreshing={isLoading}>
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Triage Reports"
        helpContent="Performance analytics for triage wait times, volume distribution, and LWBS (Left Without Being Seen) statistics. Use filters to narrow by date range, area, or category."
      />

      <TriageReportsComponent
        reportData={reportData ?? defaultReportData}
        isLoading={isLoading}
        filters={filters}
        onDateRangeChange={handleDateRangeChange}
        onFilterChange={handleFilterChange}
        onExport={handleExport}
      />
    </div>
    </PullToRefresh>
  );
}
