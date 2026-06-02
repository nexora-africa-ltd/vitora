'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { qualityApi } from '@/lib/api/quality';
import { CircularProgress } from '@/components/ui/circular-progress';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Target,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import type { QualityDashboardData, QualityDomainSummary } from '@/lib/types/quality';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

function StatCard({
  title,
  value,
  icon: Icon,
  variant = 'default',
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    default: 'text-primary',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-destructive',
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className={`shrink-0 ${colors[variant]}`}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {title}
            </p>
            <p className="text-lg sm:text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DomainCard({ domain, onClick }: { domain: QualityDomainSummary; onClick?: () => void }) {
  const complianceColor =
    domain.compliance_rate >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : domain.compliance_rate >= 50
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-destructive';

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-sm font-medium truncate text-primary hover:underline"
            role="link"
          >
            {domain.domain_display}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={domain.compliance_rate >= 80 ? 'default' : 'secondary'}
            >
              {domain.total_measures} measures
            </Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <span className={`text-2xl font-bold ${complianceColor}`}>
              {domain.compliance_rate.toFixed(1)}%
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              {domain.meeting_target} / {domain.total_results} meeting target
            </p>
          </div>
          <div className="h-10 w-16 flex items-end gap-0.5">
            {/* Mini bar visual */}
            <div
              className="bg-emerald-500/80 rounded-t w-full"
              style={{
                height: `${Math.max(4, (domain.meeting_target / Math.max(domain.total_results, 1)) * 40)}px`,
              }}
            />
            <div
              className="bg-muted rounded-t w-full"
              style={{
                height: `${Math.max(4, ((domain.total_results - domain.meeting_target) / Math.max(domain.total_results, 1)) * 40)}px`,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendRow({
  period,
  total,
  meetingTarget,
  complianceRate,
}: {
  period: string;
  total: number;
  meetingTarget: number;
  complianceRate: number;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm font-medium">{period}</span>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">
          {meetingTarget}/{total}
        </span>
        <Badge
          variant={complianceRate >= 80 ? 'default' : 'secondary'}
          className="w-16 justify-center"
        >
          {complianceRate.toFixed(1)}%
        </Badge>
      </div>
    </div>
  );
}

export default function QualityDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [year, setYear] = useState<number>(currentYear);

  const { data, isLoading, error } = useQuery({
    queryKey: ['quality-dashboard', year],
    queryFn: () => qualityApi.getDashboard({ year }),
    staleTime: 60_000,
  });

  const seedMutation = useMutation({
    mutationFn: () => qualityApi.seedDefaults(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality-dashboard'] });
    },
  });

  const handleRefresh = async () => {
    await refresh();
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Quality Measures" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Quality Measures" />
        <Card className="p-6">
          <p className="text-destructive">
            Failed to load quality dashboard. Please try again.
          </p>
        </Card>
      </div>
    );
  }

  const dashboard: QualityDashboardData = data ?? {
    total_measures: 0,
    active_measures: 0,
    measures_meeting_target: 0,
    measures_below_threshold: 0,
    overall_compliance_rate: 0,
    domain_summary: [],
    trend_data: [],
  };

  // Empty state — no measures configured yet
  if (!isLoading && dashboard.total_measures === 0) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Quality Measures"
          helpContent="Monitor clinical quality measures (CQM) compliance across domains. Track trends, identify underperforming areas, and generate reports."
        />
        <Card className="py-12 px-6">
          <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <ClipboardList className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">No Quality Measures Configured</h2>
            <p className="text-sm text-muted-foreground">
              Get started by loading Kenya&apos;s standard Clinical Quality Measures (CQM)
              including ANC, HIV viral load, blood pressure control, and more.
            </p>
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="mt-2"
            >
              {seedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ClipboardList className="h-4 w-4 mr-2" />
              )}
              Load Kenya CQM Defaults
            </Button>
            {seedMutation.isSuccess && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {seedMutation.data.created} measures loaded successfully.
              </p>
            )}
            {seedMutation.isError && (
              <p className="text-sm text-destructive">
                Failed to load defaults. Please try again.
              </p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Quality Measures"
          helpContent="Monitor clinical quality measures (CQM) compliance across domains. Track trends, identify underperforming areas, and generate reports."
          actions={
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
            >
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

        {/* KPI Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Measures"
            value={dashboard.total_measures}
            icon={Activity}
          />
          <StatCard
            title="Active"
            value={dashboard.active_measures}
            icon={Target}
            variant="default"
          />
          <StatCard
            title="Meeting Target"
            value={dashboard.measures_meeting_target}
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Below Threshold"
            value={dashboard.measures_below_threshold}
            icon={AlertTriangle}
            variant={dashboard.measures_below_threshold > 0 ? 'danger' : 'default'}
          />
        </div>

        {/* Overall Compliance */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col items-center gap-4">
              {/* Circular Gauge */}
              <CircularProgress
                value={dashboard.overall_compliance_rate}
                size={120}
                strokeWidth={10}
                trackClassName="stroke-muted"
                indicatorClassName={
                  dashboard.overall_compliance_rate >= 80
                    ? 'stroke-emerald-500'
                    : dashboard.overall_compliance_rate >= 50
                      ? 'stroke-amber-500'
                      : 'stroke-destructive'
                }
                className="drop-shadow-sm"
              >
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold leading-none">
                    {dashboard.overall_compliance_rate.toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">compliance</span>
                </div>
              </CircularProgress>
              {/* Legend */}
              <div className="text-center">
                <div className="flex items-center gap-2 justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Overall Compliance Rate</h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {dashboard.measures_meeting_target} of {dashboard.active_measures} active measures meeting target
                </p>
                <div className="flex gap-4 mt-3 justify-center">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">&ge;80% Good</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">50-79% Fair</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
                    <span className="text-muted-foreground">&lt;50% Poor</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Domain Breakdown */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            Performance by Domain
          </h2>
          {dashboard.domain_summary.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground text-center">
                No quality measure results recorded yet. Create measures and
                record results to see domain performance.
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboard.domain_summary.map((d) => (
                <DomainCard
                  key={d.domain}
                  domain={d}
                  onClick={() => router.push(`/quality/domain/${d.domain.toLowerCase()}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Quarterly Trends */}
        {dashboard.trend_data.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">
                Quarterly Trends — {year}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {dashboard.trend_data.map((point) => (
                <TrendRow
                  key={point.period}
                  period={point.period}
                  total={point.total}
                  meetingTarget={point.meeting_target}
                  complianceRate={point.compliance_rate}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
