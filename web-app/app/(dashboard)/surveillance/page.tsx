'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  Flag,
  TrendingUp,
  Users,
  Siren,
  BarChart3,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { surveillanceApi } from '@/lib/api/surveillance';
import { usePageRefresh } from '@/lib/context/page-refresh-context';

export default function SurveillanceDashboardPage() {
  const { refresh, isRefreshing } = usePageRefresh();

  const { data, isLoading, error } = useQuery({
    queryKey: ['surveillance-dashboard'],
    queryFn: () => surveillanceApi.getDashboard(),
    staleTime: 30000,
  });

  const { data: unacknowledgedAlerts } = useQuery({
    queryKey: ['surveillance-alerts-unacknowledged'],
    queryFn: () => surveillanceApi.listUnacknowledgedAlerts(),
    staleTime: 30000,
  });

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Disease Surveillance"
          helpContent="Monitor notifiable disease cases, alerts, and outbreak status across your facility."
        />

        {error ? (
          <Card className="p-6 text-center text-destructive">
            <p>Failed to load dashboard</p>
          </Card>
        ) : (
          <>
            {/* Key Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatsCard
                title="Active Cases"
                value={data?.total_active_cases ?? 0}
                icon={Users}
                href="/surveillance/cases"
                loading={isLoading}
              />
              <StatsCard
                title="Immediate Pending"
                value={data?.immediate_cases_pending ?? 0}
                icon={Siren}
                variant={data?.immediate_cases_pending ? 'warning' : 'default'}
                href="/surveillance/cases?category=IMMEDIATE"
                loading={isLoading}
              />
              <StatsCard
                title="Overdue Notifications"
                value={data?.overdue_notifications ?? 0}
                icon={Clock}
                variant={data?.overdue_notifications ? 'warning' : 'default'}
                href="/surveillance/cases?is_overdue=true"
                loading={isLoading}
              />
              <StatsCard
                title="Outbreak Alerts"
                value={data?.outbreak_alerts ?? 0}
                icon={AlertTriangle}
                variant={data?.outbreak_alerts ? 'warning' : 'default'}
                href="/surveillance/thresholds"
                loading={isLoading}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatsCard
                title="Cases Today"
                value={data?.cases_today ?? 0}
                icon={Flag}
                loading={isLoading}
              />
              <StatsCard
                title="Cases This Week"
                value={data?.cases_this_week ?? 0}
                icon={TrendingUp}
                loading={isLoading}
              />
            </div>

            {/* Unacknowledged Alerts Banner */}
            {(unacknowledgedAlerts?.length ?? 0) > 0 && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Siren className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="font-medium">
                        {unacknowledgedAlerts?.length} unacknowledged alert
                        {(unacknowledgedAlerts?.length ?? 0) > 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Review and acknowledge alerts to clear this notification
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/surveillance/alerts">View Alerts</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Top Diseases */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Top Diseases</CardTitle>
                </CardHeader>
                <CardContent>
                  {data?.top_diseases?.length ? (
                    <div className="space-y-3">
                      {data.top_diseases.slice(0, 5).map((item) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <span className="text-sm truncate">{item.name}</span>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Cases by County</CardTitle>
                </CardHeader>
                <CardContent>
                  {data?.cases_by_county?.length ? (
                    <div className="space-y-3">
                      {data.cases_by_county.slice(0, 5).map((item) => (
                        <div key={item.county} className="flex items-center justify-between">
                          <span className="text-sm truncate">{item.county}</span>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/surveillance/cases">
                      <Users className="mr-2 h-4 w-4" />
                      View Cases
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/surveillance/alerts">
                      <Siren className="mr-2 h-4 w-4" />
                      View Alerts
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/surveillance/idsr">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      IDSR Reports
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/surveillance/thresholds">
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Thresholds
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
