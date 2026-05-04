'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { CircleDot, Activity, ClipboardList, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDialysisSessions, useDialysisOrders } from '@/lib/hooks/use-dialysis';
import { usePageRefresh } from '@/lib/context/page-refresh-context';

export default function DialysisDashboardPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { data: sessionsData, isLoading: sessionsLoading } = useDialysisSessions({ page_size: 100 });
  const { data: ordersData, isLoading: ordersLoading } = useDialysisOrders({ page_size: 100 });

  const stats = useMemo(() => {
    const sessions = sessionsData?.results || [];
    const orders = ordersData?.results || [];
    return {
      todaySessions: sessions.filter((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS').length,
      inProgress: sessions.filter((s) => s.status === 'IN_PROGRESS').length,
      activeOrders: orders.filter((o) => o.status === 'ACTIVE').length,
      completedToday: sessions.filter((s) => s.status === 'COMPLETED').length,
    };
  }, [sessionsData, ordersData]);

  const isLoading = sessionsLoading || ordersLoading;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Dialysis Unit"
          helpContent="Manage hemodialysis sessions, standing orders, and vascular access for renal patients."
        />

        {/* Stats */}
        <div className="grid gap-2 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Today's Sessions"
            value={isLoading ? '-' : stats.todaySessions}
            icon={Activity}
            variant="default"
            loading={isLoading}
          />
          <StatsCard
            title="In Progress"
            value={isLoading ? '-' : stats.inProgress}
            icon={CircleDot}
            variant="warning"
            loading={isLoading}
          />
          <StatsCard
            title="Active Orders"
            value={isLoading ? '-' : stats.activeOrders}
            icon={ClipboardList}
            variant="success"
            loading={isLoading}
          />
          <StatsCard
            title="Completed Today"
            value={isLoading ? '-' : stats.completedToday}
            icon={AlertTriangle}
            variant="default"
            loading={isLoading}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                View and manage dialysis treatment sessions.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/dialysis/sessions">View Sessions</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-amber-500" />
                Standing Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Manage dialysis prescriptions and treatment plans.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/dialysis/orders">View Orders</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CircleDot className="h-4 w-4 text-green-500" />
                Vascular Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Track patient vascular access sites and status.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/dialysis/accesses">View Accesses</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PullToRefresh>
  );
}
