'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { useAlertSeveritySummary } from '@/lib/hooks/use-pharmacy';
import { DashboardEmptyState, DashboardFooterLink, DashboardListSkeleton } from './widget-primitives';

const severitySummaryStyles = {
  LOW: 'border-primary/20 bg-primary/5 text-primary',
  MEDIUM: 'border-info/20 bg-info/5 text-info',
  HIGH: 'border-warning/20 bg-warning/5 text-warning',
  CRITICAL: 'border-destructive/20 bg-destructive/5 text-destructive',
};


interface AlertsWidgetProps {
  className?: string;
}

export function AlertsWidget({ className }: AlertsWidgetProps = {}) {
  const { data: summary, isLoading, error } = useAlertSeveritySummary({ resolved: false });

  if (error) {
    return (
      <DashboardEmptyState
        icon={AlertTriangle}
        title="Unable to load alerts"
        description="We could not load stock alerts right now. Please refresh and try again."
        className={cn('h-full', className)}
      />
    );
  }

  const unresolvedTotal = summary?.total ?? 0;

  const criticalCount = summary?.critical ?? 0;
  const highCount = summary?.high ?? 0;
  const mediumCount = summary?.medium ?? 0;
  const lowCount = summary?.low ?? 0;
  const severitySummary = [
    { label: 'Critical', value: criticalCount, severity: 'CRITICAL' as const },
    { label: 'High', value: highCount, severity: 'HIGH' as const },
    { label: 'Medium', value: mediumCount, severity: 'MEDIUM' as const },
    { label: 'Low', value: lowCount, severity: 'LOW' as const },
  ].filter((item) => item.value > 0);

  if (isLoading) {
    return <DashboardListSkeleton rows={2} showMeta={false} className={cn('h-full', className)} />;
  }

  if (unresolvedTotal === 0) {
    return (
      <DashboardEmptyState
        icon={AlertTriangle}
        title="No active stock alerts"
        description="Reorder thresholds, expiries, and stock-outs will appear here when action is needed."
        className={cn('h-full', className)}
      />
    );
  }

  return (
    <div data-testid="alerts-widget" className={cn('space-y-3 h-full', className)}>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{unresolvedTotal} unresolved alerts</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Prioritize stock-outs and expiring batches that need intervention today.
          </p>
        </div>
        <Badge variant="destructive" className="shrink-0 w-fit self-start">
          {unresolvedTotal}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {severitySummary.map((item) => (
          <div
            key={item.severity}
            className={cn(
              'rounded-xl border px-3 py-2',
              severitySummaryStyles[item.severity]
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      <DashboardFooterLink href="/pharmacy?tab=alerts" label="View All Alerts" />
    </div>
  );
}
