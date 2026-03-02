'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Shield, Activity, Zap } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cdsApi } from '@/lib/api/cds';
import { usePageRefresh } from '@/lib/context/page-refresh-context';

export default function CDSDashboardPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const router = useRouter();

  const { data: dashboard } = useQuery({
    queryKey: ['cds-dashboard'],
    queryFn: () => cdsApi.getDashboard(),
    staleTime: 30000,
  });

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Clinical Decision Support"
          helpContent="Evidence-based clinical decision support engine. Manages rules for drug-allergy interactions, critical lab values, vital sign alerts, and drug-drug interactions."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3 cursor-pointer hover:bg-muted/50" onClick={() => router.push('/cds/rules')}>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              Active Rules
            </div>
            <div className="text-2xl font-bold">{dashboard?.active_rules ?? 0}</div>
            <div className="text-xs text-muted-foreground">{dashboard?.draft_rules ?? 0} drafts</div>
          </Card>
          <Card className="p-3 cursor-pointer hover:bg-muted/50" onClick={() => router.push('/cds/alerts?status=PENDING')}>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              Pending Alerts
            </div>
            <div className="text-2xl font-bold">{dashboard?.pending_alerts ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1 text-xs text-destructive">
              <Zap className="h-3 w-3" />
              Critical
            </div>
            <div className="text-2xl font-bold text-destructive">{dashboard?.critical_pending ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              Today
            </div>
            <div className="text-2xl font-bold">{dashboard?.alerts_today ?? 0}</div>
            {dashboard?.override_rate != null && (
              <div className="text-xs text-muted-foreground">{dashboard.override_rate}% override rate</div>
            )}
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="font-medium mb-2">CDS Rules</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Manage clinical decision support rules for drug interactions, vital sign alerts, and critical lab values.
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/cds/rules')}>
              View Rules
            </Button>
          </Card>
          <Card className="p-4">
            <h3 className="font-medium mb-2">CDS Alerts</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Review and manage triggered clinical alerts. Acknowledge, accept, override, or dismiss alerts.
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/cds/alerts')}>
              View Alerts
            </Button>
          </Card>
        </div>

        {/* Alerts by Category */}
        {dashboard?.alerts_by_category && dashboard.alerts_by_category.length > 0 && (
          <Card className="p-4">
            <h3 className="font-medium mb-3">Pending Alerts by Category</h3>
            <div className="space-y-2">
              {dashboard.alerts_by_category.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {String(item.rule__category ?? '').replace(/_/g, ' ')}
                  </span>
                  <span className="font-medium">{String(item.count ?? 0)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
