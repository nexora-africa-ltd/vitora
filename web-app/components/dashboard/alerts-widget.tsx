'use client';

import { AlertTriangle, Package, Clock, Activity, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { useStockAlerts } from '@/lib/hooks/use-pharmacy';
import { DashboardEmptyState, DashboardFooterLink, DashboardListSkeleton } from './widget-primitives';

const alertIcons = {
  low_stock: Package,
  expiring: Clock,
  critical_vital: Activity,
  out_of_stock: XCircle,
};

const severitySummaryStyles = {
  LOW: 'border-primary/20 bg-primary/5 text-primary',
  MEDIUM: 'border-info/20 bg-info/5 text-info',
  HIGH: 'border-warning/20 bg-warning/5 text-warning',
  CRITICAL: 'border-destructive/20 bg-destructive/5 text-destructive',
};

const severityItemStyles = {
  LOW: 'border-primary/20 bg-primary/5',
  MEDIUM: 'border-info/20 bg-info/5',
  HIGH: 'border-warning/20 bg-warning/5',
  CRITICAL: 'border-destructive/20 bg-destructive/5',
};

const severityOrder = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function getAlertIconKey(alertType: string): keyof typeof alertIcons {
  if (alertType.includes('OUT_OF_STOCK')) {
    return 'out_of_stock';
  }

  if (alertType.includes('LOW_STOCK')) {
    return 'low_stock';
  }

  if (alertType.includes('EXPIR')) {
    return 'expiring';
  }

  return 'critical_vital';
}

export function AlertsWidget() {
  const { data: alertsData, isLoading } = useStockAlerts({ resolved: false });

  const unresolvedAlerts = alertsData?.results?.filter((a) => !a.resolved) || [];
  const highlightedAlerts = [...unresolvedAlerts]
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity])
    .slice(0, 4);

  const criticalCount = unresolvedAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const highCount = unresolvedAlerts.filter((a) => a.severity === 'HIGH').length;
  const mediumCount = unresolvedAlerts.filter((a) => a.severity === 'MEDIUM').length;
  const lowCount = unresolvedAlerts.filter((a) => a.severity === 'LOW').length;
  const severitySummary = [
    { label: 'Critical', value: criticalCount, severity: 'CRITICAL' as const },
    { label: 'High', value: highCount, severity: 'HIGH' as const },
    { label: 'Medium', value: mediumCount, severity: 'MEDIUM' as const },
    { label: 'Low', value: lowCount, severity: 'LOW' as const },
  ].filter((item) => item.value > 0);

  if (isLoading) {
    return <DashboardListSkeleton rows={3} showMeta={false} />;
  }

  if (unresolvedAlerts.length === 0) {
    return (
      <DashboardEmptyState
        icon={AlertTriangle}
        title="No active stock alerts"
        description="Reorder thresholds, expiries, and stock-outs will appear here when action is needed."
      />
    );
  }

  return (
    <div data-testid="alerts-widget" className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{unresolvedAlerts.length} unresolved alerts</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Prioritize stock-outs and expiring batches that need intervention today.
          </p>
        </div>
        <Badge variant="destructive" className="shrink-0 w-fit self-start">
          {unresolvedAlerts.length}
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

      <ul className="space-y-2" aria-label="Highlighted stock alerts">
        {highlightedAlerts.map((alert) => {
          const Icon = alertIcons[getAlertIconKey(alert.alert_type)] ?? AlertTriangle;

          return (
            <li key={alert.id}>
              <div
                className={cn(
                  'rounded-xl border p-3',
                  severityItemStyles[alert.severity]
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-background/80 p-2 shadow-sm ring-1 ring-border/50">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {alert.drug_name || 'Unassigned medication'}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {alert.message}
                        </p>
                      </div>
                      <Badge
                        variant={
                          alert.severity === 'CRITICAL'
                            ? 'destructive'
                            : alert.severity === 'HIGH'
                              ? 'warning'
                              : alert.severity === 'MEDIUM'
                                ? 'info'
                                : 'secondary'
                        }
                        className="shrink-0 w-fit self-start"
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <DashboardFooterLink href="/pharmacy?tab=alerts" label="View All Alerts" />
    </div>
  );
}
