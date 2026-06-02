'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { CircularProgress } from '@/components/ui/circular-progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { qualityApi } from '@/lib/api/quality';
import { CheckCircle2, XCircle, Target, Building2 } from 'lucide-react';
import type { QualityMeasureResult } from '@/lib/types/quality';

const DOMAIN_LABELS: Record<string, string> = {
  CLINICAL: 'Clinical Quality',
  PATIENT_SAFETY: 'Patient Safety',
  EFFICIENCY: 'Efficiency',
  PATIENT_EXPERIENCE: 'Patient Experience',
  PUBLIC_HEALTH: 'Public Health',
  CARE_COORDINATION: 'Care Coordination',
};

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function MeasureFacilityDrilldownPage() {
  const params = useParams();
  const { refresh, isRefreshing } = usePageRefresh();
  const [year, setYear] = useState<number>(currentYear);

  const slug = params.slug as string;
  const measureId = Number(params.measureId);
  const domain = slug?.toUpperCase();
  const domainLabel = DOMAIN_LABELS[domain] || domain;

  // Fetch the measure definition
  const { data: measure, isLoading: measureLoading } = useQuery({
    queryKey: ['quality-measure', measureId],
    queryFn: () => qualityApi.getMeasure(measureId),
    enabled: !!measureId,
  });

  // Fetch all results for this measure & year (across all clinics)
  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['quality-results', { measure: measureId, year }],
    queryFn: () =>
      qualityApi.listResults({
        measure: measureId,
        year,
        ordering: '-period',
        page_size: 200,
      }),
    enabled: !!measureId,
  });

  const isLoading = measureLoading || resultsLoading;

  // Group results by clinic, pick latest period per clinic
  const clinicResults = useMemo(() => {
    const results = resultsData?.results ?? [];
    const latestByClinic = new Map<number, QualityMeasureResult>();
    for (const r of results) {
      const existing = latestByClinic.get(r.clinic);
      if (!existing || r.period > existing.period) {
        latestByClinic.set(r.clinic, r);
      }
    }
    return Array.from(latestByClinic.values());
  }, [resultsData]);

  // Summary
  const totalClinics = clinicResults.length;
  const meetingTarget = clinicResults.filter((r) => r.meets_target).length;
  const avgPerformance =
    totalClinics > 0
      ? clinicResults.reduce((sum, r) => sum + parseFloat(r.percentage), 0) / totalClinics
      : 0;

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Measure Performance" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={measure?.name ?? 'Measure'}
          helpContent={`Per-facility performance breakdown for ${measure?.code ?? ''} (${domainLabel}). Shows the latest result for each clinic.`}
          actions={
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {/* Measure Info */}
        {measure && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{measure.code}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{measure.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {measure.target_percentage && (
                    <Badge variant="outline" className="gap-1">
                      <Target className="h-3 w-3" />
                      Target: {measure.target_percentage}%
                    </Badge>
                  )}
                  <Badge variant="secondary">{measure.reporting_period_display}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CircularProgress
                value={avgPerformance}
                size={48}
                strokeWidth={5}
                indicatorClassName={
                  avgPerformance >= 80
                    ? 'stroke-emerald-500'
                    : avgPerformance >= 50
                      ? 'stroke-amber-500'
                      : 'stroke-destructive'
                }
              >
                <span className="text-xs font-bold">{avgPerformance.toFixed(0)}%</span>
              </CircularProgress>
              <div>
                <p className="text-xs text-muted-foreground">Avg Performance</p>
                <p className="text-lg font-bold">{avgPerformance.toFixed(1)}%</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Clinics Evaluated</p>
              <p className="text-2xl font-bold">{totalClinics}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Meeting Target</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {meetingTarget}
                <span className="text-sm font-normal text-muted-foreground">
                  /{totalClinics}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Per-Facility Table */}
        {clinicResults.length === 0 ? (
          <Card className="p-6">
            <div className="flex flex-col items-center text-center gap-2">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No facility-level results for this measure in {year}. Run an evaluation to generate results.
              </p>
            </div>
          </Card>
        ) : (
          <ResponsiveTable<QualityMeasureResult>
            data={clinicResults}
            keyExtractor={(item) => `${item.clinic}-${item.period}`}
            emptyMessage="No results found."
            columns={[
              {
                key: 'clinic_name',
                header: 'Facility',
                sortable: true,
                cell: (item) => (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">{item.clinic_name}</span>
                  </div>
                ),
              },
              {
                key: 'period',
                header: 'Period',
                sortable: true,
                sortType: 'number',
                cell: (item) => (
                  <span className="text-sm">
                    {item.period_type === 'QUARTERLY'
                      ? `Q${item.period}`
                      : item.period_type === 'MONTHLY'
                        ? `Month ${item.period}`
                        : 'Annual'}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: 'performance',
                header: 'Performance',
                sortable: true,
                sortFn: (a, b) => parseFloat(a.percentage) - parseFloat(b.percentage),
                cell: (item) => {
                  const pct = parseFloat(item.percentage);
                  const color = item.meets_target
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : pct >= 50
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-destructive';
                  return (
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${color}`}>{pct.toFixed(1)}%</span>
                      <Progress value={pct} className="w-16 h-2 hidden sm:block" />
                    </div>
                  );
                },
              },
              {
                key: 'numerator',
                header: 'N/D',
                cell: (item) => (
                  <span className="text-sm text-muted-foreground">
                    {item.numerator}/{item.denominator}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                sortFn: (a, b) => Number(a.meets_target) - Number(b.meets_target),
                cell: (item) =>
                  item.meets_target ? (
                    <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="hidden sm:inline">Met</span>
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      <span className="hidden sm:inline">Not Met</span>
                    </Badge>
                  ),
              },
            ]}
            mobileCard={(item) => {
              const pct = parseFloat(item.percentage);
              return (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{item.clinic_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.period_type === 'QUARTERLY' ? `Q${item.period}` : `Month ${item.period}`} {item.year}
                      </p>
                    </div>
                    {item.meets_target ? (
                      <Badge className="shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Met
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0">
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Met
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-lg font-bold">{pct.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">
                      {item.numerator}/{item.denominator}
                    </span>
                  </div>
                </Card>
              );
            }}
            defaultSortColumn="performance"
            defaultSortDirection="desc"
          />
        )}
      </div>
    </PullToRefresh>
  );
}
