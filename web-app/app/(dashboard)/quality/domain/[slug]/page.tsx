'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { qualityApi } from '@/lib/api/quality';
import { clinicsApi } from '@/lib/api/clinics';
import { CheckCircle2, XCircle, Minus, Target, TrendingUp, Play, Loader2 } from 'lucide-react';
import type { QualityMeasure, QualityMeasureResult, QualityMeasureDomain } from '@/lib/types/quality';

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

interface MeasureWithPerformance {
  measure: QualityMeasure;
  latestResult: QualityMeasureResult | null;
}

export default function QualityDomainDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [year, setYear] = useState<number>(currentYear);
  const [selectedClinicId, setSelectedClinicId] = useState<string>('all');
  const [evalPeriodType, setEvalPeriodType] = useState<string>('QUARTERLY');
  const [evalPeriod, setEvalPeriod] = useState<string>(
    String(Math.ceil((new Date().getMonth() + 1) / 3))
  );

  const slug = params.slug as string;
  const domain = slug?.toUpperCase() as QualityMeasureDomain;
  const domainLabel = DOMAIN_LABELS[domain] || domain;

  // Fetch clinics for the selector
  const { data: clinicsData } = useQuery({
    queryKey: ['clinics-list'],
    queryFn: () => clinicsApi.list({ page_size: 100 }),
    staleTime: 300_000,
  });

  // Evaluate mutation
  const evaluateMutation = useMutation({
    mutationFn: () =>
      qualityApi.evaluateMeasures({
        clinic_id: selectedClinicId !== 'all' ? Number(selectedClinicId) : undefined,
        year,
        period: Number(evalPeriod),
        period_type: evalPeriodType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality-results'] });
    },
  });

  // Fetch measures for this domain
  const { data: measuresData, isLoading: measuresLoading } = useQuery({
    queryKey: ['quality-measures', { domain, status: 'ACTIVE' }],
    queryFn: () => qualityApi.listMeasures({ domain, status: 'ACTIVE', page_size: 100 }),
    enabled: !!domain,
  });

  // Fetch results for this domain & year
  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['quality-results', { measure__domain: domain, year }],
    queryFn: () =>
      qualityApi.listResults({
        measure__domain: domain,
        year,
        ordering: '-period',
        page_size: 200,
      }),
    enabled: !!domain,
  });

  const isLoading = measuresLoading || resultsLoading;

  // Merge measures with their latest result
  const measuresWithPerformance = useMemo<MeasureWithPerformance[]>(() => {
    const measures = measuresData?.results ?? [];
    const results = resultsData?.results ?? [];

    // Group results by measure_id, pick latest (highest period)
    const latestByMeasure = new Map<number, QualityMeasureResult>();
    for (const r of results) {
      const existing = latestByMeasure.get(r.measure);
      if (!existing || r.period > existing.period) {
        latestByMeasure.set(r.measure, r);
      }
    }

    return measures.map((m) => ({
      measure: m,
      latestResult: latestByMeasure.get(m.id) ?? null,
    }));
  }, [measuresData, resultsData]);

  // Summary stats
  const totalMeasures = measuresWithPerformance.length;
  const measuredCount = measuresWithPerformance.filter((m) => m.latestResult).length;
  const meetingTarget = measuresWithPerformance.filter((m) => m.latestResult?.meets_target).length;
  const overallCompliance = measuredCount > 0 ? Math.round((meetingTarget / measuredCount) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title={domainLabel} />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
          title={domainLabel}
          helpContent={`Performance overview for all active ${domainLabel} measures. Shows the latest results for the selected year.`}
          actions={
            <div className="flex items-center gap-2">
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
            </div>
          }
        />

        {/* Evaluate Now */}
        <Card className="p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Run evaluation against clinic data to calculate measure performance.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
              <Select value={selectedClinicId} onValueChange={setSelectedClinicId}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clinics</SelectItem>
                  {(clinicsData?.results ?? []).map((clinic) => (
                    <SelectItem key={clinic.id} value={String(clinic.id)}>
                      {clinic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={evalPeriodType} onValueChange={(v) => {
                setEvalPeriodType(v);
                // Reset period when switching type
                if (v === 'QUARTERLY') setEvalPeriod(String(Math.ceil((new Date().getMonth() + 1) / 3)));
                else if (v === 'MONTHLY') setEvalPeriod(String(new Date().getMonth() + 1));
                else setEvalPeriod('1');
              }}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="ANNUAL">Annual</SelectItem>
                </SelectContent>
              </Select>
              {evalPeriodType === 'QUARTERLY' && (
                <Select value={evalPeriod} onValueChange={setEvalPeriod}>
                  <SelectTrigger className="w-full sm:w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {evalPeriodType === 'MONTHLY' && (
                <Select value={evalPeriod} onValueChange={setEvalPeriod}>
                  <SelectTrigger className="w-full sm:w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                onClick={() => evaluateMutation.mutate()}
                disabled={evaluateMutation.isPending}
              >
                {evaluateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1.5" />
                )}
                {selectedClinicId === 'all' ? 'Evaluate All' : 'Evaluate'}
              </Button>
            </div>
          </div>
          {evaluateMutation.isSuccess && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2">
              {evaluateMutation.data.clinics_evaluated != null
                ? `Evaluated ${evaluateMutation.data.clinics_evaluated} clinic(s) for ${evalPeriodType === 'QUARTERLY' ? `Q${evalPeriod}` : evalPeriodType === 'MONTHLY' ? `Month ${evalPeriod}` : ''} ${year}.`
                : `Evaluated ${evaluateMutation.data.total_evaluated} measures for ${evalPeriodType === 'QUARTERLY' ? `Q${evalPeriod}` : evalPeriodType === 'MONTHLY' ? `Month ${evalPeriod}` : ''} ${year}.`}
            </p>
          )}
          {evaluateMutation.isError && (
            <p className="text-sm text-destructive mt-2">
              Evaluation failed. Please try again.
            </p>
          )}
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Active Measures</p>
              <p className="text-2xl font-bold">{totalMeasures}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">With Results</p>
              <p className="text-2xl font-bold">
                {measuredCount}
                <span className="text-sm font-normal text-muted-foreground">
                  /{totalMeasures}
                </span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Meeting Target</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {meetingTarget}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Compliance Rate</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">{overallCompliance}%</p>
                <Progress value={overallCompliance} className="flex-1 h-2" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Measures Performance Table */}
        <ResponsiveTable<MeasureWithPerformance>
          data={measuresWithPerformance}
          keyExtractor={(item) => item.measure.id}
          onRowClick={(item) => router.push(`/quality/domain/${slug}/measure/${item.measure.id}`)}
          emptyMessage={`No active ${domainLabel} measures found.`}
          columns={[
            {
              key: 'code',
              header: 'Code',
              sortable: true,
              sortFn: (a, b) => a.measure.code.localeCompare(b.measure.code),
              cell: (item) => (
                <span className="font-mono text-sm">{item.measure.code}</span>
              ),
            },
            {
              key: 'name',
              header: 'Measure',
              sortable: true,
              sortFn: (a, b) => a.measure.name.localeCompare(b.measure.name),
              cell: (item) => (
                <Link
                  href={`/quality/domain/${slug}/measure/${item.measure.id}`}
                  className="font-medium text-sm text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.measure.name}
                </Link>
              ),
            },
            {
              key: 'target',
              header: 'Target',
              cell: (item) =>
                item.measure.target_percentage ? (
                  <span className="flex items-center gap-1 text-sm">
                    <Target className="h-3.5 w-3.5 text-muted-foreground" />
                    {item.measure.target_percentage}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
              hideOnMobile: true,
            },
            {
              key: 'performance',
              header: 'Performance',
              sortable: true,
              sortFn: (a, b) =>
                (a.latestResult ? parseFloat(a.latestResult.percentage) : -1) -
                (b.latestResult ? parseFloat(b.latestResult.percentage) : -1),
              cell: (item) => {
                if (!item.latestResult) {
                  return (
                    <span className="text-xs text-muted-foreground italic">
                      No data
                    </span>
                  );
                }
                const pct = parseFloat(item.latestResult.percentage);
                const color =
                  item.latestResult.meets_target
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : pct >= (parseFloat(String(item.measure.low_threshold ?? '0')))
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
              cell: (item) =>
                item.latestResult ? (
                  <span className="text-sm text-muted-foreground">
                    {item.latestResult.numerator}/{item.latestResult.denominator}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              sortFn: (a, b) => {
                const scoreA = a.latestResult ? (a.latestResult.meets_target ? 2 : 1) : 0;
                const scoreB = b.latestResult ? (b.latestResult.meets_target ? 2 : 1) : 0;
                return scoreA - scoreB;
              },
              cell: (item) => {
                if (!item.latestResult) {
                  return (
                    <Badge variant="secondary" className="gap-1">
                      <Minus className="h-3 w-3" />
                      <span className="hidden sm:inline">Pending</span>
                    </Badge>
                  );
                }
                return item.latestResult.meets_target ? (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="hidden sm:inline">Met</span>
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    <span className="hidden sm:inline">Not Met</span>
                  </Badge>
                );
              },
            },
          ]}
          mobileCard={(item) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.measure.code}
                  </p>
                  <p className="font-medium text-sm leading-tight">
                    {item.measure.name}
                  </p>
                </div>
                {item.latestResult ? (
                  item.latestResult.meets_target ? (
                    <Badge className="shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Met
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="shrink-0">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Met
                    </Badge>
                  )
                ) : (
                  <Badge variant="secondary" className="shrink-0">Pending</Badge>
                )}
              </div>
              {item.latestResult && (
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-lg font-bold">
                    {parseFloat(item.latestResult.percentage).toFixed(1)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.latestResult.numerator}/{item.latestResult.denominator}
                  </span>
                  {item.measure.target_percentage && (
                    <span className="text-xs text-muted-foreground">
                      Target: {item.measure.target_percentage}%
                    </span>
                  )}
                </div>
              )}
            </Card>
          )}
          defaultSortColumn="performance"
          defaultSortDirection="desc"
        />
      </div>
    </PullToRefresh>
  );
}
