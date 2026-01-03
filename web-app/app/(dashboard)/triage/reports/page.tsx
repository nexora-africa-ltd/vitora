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
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { TriageReportsPage as TriageReportsComponent } from '@/components/triage';
import { useTriageReports, useExportTriageReport } from '@/lib/hooks/use-triage';
import { useToast } from '@/components/ui/use-toast';
import type { DateRangePreset, ReportFilters } from '@/components/triage';
import type { TriageCategory, AssignedArea } from '@/lib/types/triage';

export default function TriageReportsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [filters, setFilters] = useState<ReportFilters>({
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
  const { mutateAsync: exportReport, isLoading: isExporting } = useExportTriageReport();

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

  const handleFilterChange = useCallback((newFilters: Partial<ReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const handleExport = useCallback(
    async (format: 'pdf' | 'csv' | 'excel') => {
      try {
        await exportReport({
          format,
          filters,
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
    [exportReport, filters, toast]
  );

  const handleBack = useCallback(() => {
    router.push('/triage');
  }, [router]);

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
    lwbs_stats: {
      total_lwbs: 0,
      lwbs_rate: 0,
      avg_wait_before_lwbs_minutes: 0,
      by_category: [],
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage Reports"
        description="Performance analytics and statistics"
        breadcrumbs={[
          { label: 'Triage', href: '/triage' },
          { label: 'Reports', href: '/triage/reports' },
        ]}
        actions={
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Queue
          </Button>
        }
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
  );
}
