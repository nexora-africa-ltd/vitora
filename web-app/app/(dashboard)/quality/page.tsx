'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Target,
  BarChart3,
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

function DomainCard({ domain }: { domain: QualityDomainSummary }) {
  const complianceColor =
    domain.compliance_rate >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : domain.compliance_rate >= 50
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-destructive';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium truncate">
            {domain.domain_display}
          </h3>
          <Badge
            variant={domain.compliance_rate >= 80 ? 'default' : 'secondary'}
            className="shrink-0"
          >
            {domain.total_measures} measures
          </Badge>
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
  const { refresh, isRefreshing } = usePageRefresh();
  const [year, setYear] = useState<number>(currentYear);

  const { data, isLoading, error } = useQuery({
    queryKey: ['quality-dashboard', year],
    queryFn: () => qualityApi.getDashboard({ year }),
    staleTime: 60_000,
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
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Overall Compliance Rate</h3>
              </div>
              <span className="text-2xl sm:text-3xl font-bold text-primary">
                {dashboard.overall_compliance_rate.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className="bg-primary rounded-full h-3 transition-all"
                style={{
                  width: `${Math.min(100, dashboard.overall_compliance_rate)}%`,
                }}
              />
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
              {dashboard.domain_summary.map((domain) => (
                <DomainCard key={domain.domain} domain={domain} />
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
