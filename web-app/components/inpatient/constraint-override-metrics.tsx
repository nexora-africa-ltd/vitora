'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, TrendingUp, Users, CheckCircle, Clock, Building } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inpatientApi } from '@/lib/api/inpatient';
import { HelpPopover } from '@/components/shared/help-popover';

interface ConstraintOverrideMetricsProps {
  className?: string;
}

export function ConstraintOverrideMetrics({ className }: ConstraintOverrideMetricsProps) {
  const [days, setDays] = useState<number>(30);

  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['constraint-override-metrics', days],
    queryFn: () => inpatientApi.getConstraintOverrideMetrics(days),
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="space-y-3 border-t pt-6">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-4 overflow-hidden">
            {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-28 min-w-[180px] flex-1" />
            ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Constraint Override Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <p>Failed to load metrics</p>
            <p className="text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  const acknowledgedPercent =
    metrics.critical_override_count > 0
      ? Math.round((metrics.acknowledged_count / metrics.critical_override_count) * 100)
      : 100;

  return (
    <Card className={className}>
      <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Constraint Override Metrics
          </CardTitle>
          <HelpPopover content="Ward compatibility override statistics. Tracks violations by type and ward to identify patterns during admissions." />
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pending Acknowledgments */}
        {metrics.pending_acknowledgment_count > 0 && (
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Clock className="h-5 w-5" />
              <span className="font-medium">
                {metrics.pending_acknowledgment_count} critical override
                {metrics.pending_acknowledgment_count !== 1 ? 's' : ''} pending acknowledgment
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {/* Violation Breakdown */}
          {metrics.violation_breakdown.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Violations by Type
              </h4>
              <div className="space-y-3">
                {metrics.violation_breakdown.map((v) => (
                  <div key={v.code} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{getViolationLabel(v.code)}</span>
                      <span className="font-medium">{v.count}</span>
                    </div>
                    <Progress
                      value={(v.count / metrics.override_count) * 100}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ward Breakdown */}
          {metrics.ward_breakdown.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center gap-2 font-medium">
                <Building className="h-4 w-4" />
                Overrides by Ward
              </h4>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                {metrics.ward_breakdown.slice(0, 6).map((w) => (
                  <div
                    key={w.ward_id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 p-2"
                  >
                    <span className="text-sm truncate">{w.ward_name}</span>
                    <Badge variant="secondary">{w.override_count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Common Reasons */}
          {metrics.common_reasons.length > 0 && (
            <div>
              <h4 className="mb-3 font-medium">Common Override Reasons</h4>
              <div className="space-y-2">
                {metrics.common_reasons.slice(0, 5).map((r, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-muted/30 p-2 text-sm"
                  >
                    <Badge variant="outline" className="shrink-0">
                      {r.count}x
                    </Badge>
                    <span className="line-clamp-2">{r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <section className="space-y-3 border-t border-border/70 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">At a Glance</h4>
                <HelpPopover content="A condensed summary of admission volume, override frequency, critical exceptions, and acknowledgement completion for the selected time range." />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-4">
              <MetricCard
                icon={Users}
                title="Total Admissions"
                value={metrics.total_admissions}
                description={`Last ${days} days`}
              />
              <MetricCard
                icon={AlertTriangle}
                title="Override Rate"
                value={`${metrics.override_rate.toFixed(1)}%`}
                description={`${metrics.override_count} overrides`}
                variant={metrics.override_rate > 10 ? 'warning' : 'default'}
              />
              <MetricCard
                icon={AlertTriangle}
                title="Critical Overrides"
                value={metrics.critical_override_count}
                description="CRITICAL violations"
                variant="destructive"
              />
              <MetricCard
                icon={CheckCircle}
                title="Acknowledged"
                value={`${acknowledgedPercent}%`}
                description={`${metrics.acknowledged_count} of ${metrics.critical_override_count}`}
                variant={acknowledgedPercent < 100 ? 'warning' : 'success'}
              />
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string | number;
  description?: string;
  variant?: 'default' | 'warning' | 'destructive' | 'success';
}

function MetricCard({
  icon: Icon,
  title,
  value,
  description,
  variant = 'default',
}: MetricCardProps) {
  const variantStyles = {
    default: 'text-foreground',
    warning: 'text-amber-600 dark:text-amber-400',
    destructive: 'text-destructive',
    success: 'text-green-600 dark:text-green-400',
  };

  return (
    <div className="relative min-w-[188px] overflow-hidden rounded-xl border bg-card p-4 sm:min-w-[204px]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <div className="relative min-h-[112px]">
        <div className="mb-3 flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{title}</span>
        </div>
        <p className={`text-3xl font-bold tracking-tight ${variantStyles[variant]}`}>{value}</p>
        {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function getViolationLabel(code: string): string {
  const labels: Record<string, string> = {
    GENDER_MISMATCH: 'Gender Mismatch',
    AGE_BELOW_MINIMUM: 'Below Minimum Age',
    AGE_ABOVE_MAXIMUM: 'Above Maximum Age',
    ISOLATION_REQUIRED: 'Isolation Required',
    OXYGEN_REQUIRED: 'Oxygen Required',
    VENTILATOR_REQUIRED: 'Ventilator Required',
    UNKNOWN: 'Unknown',
  };
  return labels[code] ?? code;
}
