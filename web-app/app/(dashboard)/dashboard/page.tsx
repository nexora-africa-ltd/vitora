'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Stethoscope, Pill, AlertTriangle, ArrowRight, UserCheck, Clock } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { TrendBadge } from '@/components/charts';
import { RecentPatients } from '@/components/dashboard/recent-patients';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';
import { AllClaimedEncountersWidget } from '@/components/dashboard/all-claimed-widget';
import { MyClaimedEncountersWidget } from '@/components/dashboard/my-claimed-widget';
import { useDashboardStats, formatNumber } from '@/lib/hooks/use-dashboard-stats';
import { useTriageWaitTimeStats } from '@/lib/hooks/use-triage';
import { useIsSupervisor } from '@/lib/auth';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: triageStats, isLoading: isTriageLoading } = useTriageWaitTimeStats({ dateRange: 'today' });
  const isSupervisor = useIsSupervisor();

  // Triage queue metrics
  const triageQueueCount = triageStats?.current_queue?.count ?? 0;
  const triageAvgWait = triageStats?.current_queue?.avg_wait_minutes ?? 0;
  const isTriageWarning = triageQueueCount > 5 || triageAvgWait > 15;
  const isTriageCritical = triageQueueCount > 10 || triageAvgWait > 30;

  // Calculate week-over-week changes (mock for now - would come from API in production)
  const weeklyChanges = {
    patients: stats?.patients.this_week ?? 0,
    encounters: stats?.encounters.completed_today ?? 0,
    prescriptions: stats?.pharmacy.prescriptions_today ?? 0,
    alerts: stats?.alerts.total_unresolved ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Welcome to Vitora HMIS. Here&apos;s an overview of your facility.
        </p>
      </div>

      {/* Stats cards - 5 cards: Patients, Triage, Encounters, Prescriptions, Alerts */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <StatsCard
          title="Total Patients"
          value={formatNumber(stats?.patients.total ?? 0)}
          description={
            <span className="flex items-center gap-2">
              +{stats?.patients.today ?? 0} today
              {weeklyChanges.patients > 0 && (
                <TrendBadge
                  change={((weeklyChanges.patients / Math.max(1, (stats?.patients.total ?? 1) - weeklyChanges.patients)) * 100)}
                  size="sm"
                />
              )}
            </span>
          }
          icon={Users}
          trend="up"
          loading={isLoading}
        />
        <StatsCard
          title="Triage Queue"
          value={String(triageQueueCount)}
          description={
            <span className={cn(
              isTriageCritical && 'text-destructive font-medium',
              isTriageWarning && !isTriageCritical && 'text-warning font-medium'
            )}>
              {triageAvgWait}m avg wait
            </span>
          }
          icon={Clock}
          trend={triageQueueCount > 0 ? 'up' : 'neutral'}
          variant={isTriageCritical ? 'warning' : isTriageWarning ? 'warning' : 'default'}
          loading={isTriageLoading}
          href="/triage"
        />
        <StatsCard
          title="Today's Encounters"
          value={String(stats?.encounters.today ?? 0)}
          description={
            <span className="flex items-center gap-2">
              {stats?.encounters.in_progress ?? 0} in progress
              {(stats?.encounters.today ?? 0) > 0 && (
                <TrendBadge
                  change={12.5} // Would come from API comparison in production
                  size="sm"
                />
              )}
            </span>
          }
          icon={Stethoscope}
          trend="up"
          loading={isLoading}
        />
        <StatsCard
          title="Prescriptions"
          value={String(stats?.pharmacy.prescriptions_today ?? 0)}
          description={`${stats?.pharmacy.pending_dispensing ?? 0} pending`}
          icon={Pill}
          trend="neutral"
          loading={isLoading}
        />
        <StatsCard
          title="Alerts"
          value={String(stats?.alerts.total_unresolved ?? 0)}
          description={
            <span className="flex items-center gap-2">
              {stats?.alerts.critical ?? 0} critical
              {(stats?.alerts.critical ?? 0) > 0 && (
                <TrendBadge
                  change={stats?.alerts.critical ?? 0}
                  invertColors
                  size="sm"
                />
              )}
            </span>
          }
          icon={AlertTriangle}
          trend={stats?.alerts.critical && stats.alerts.critical > 0 ? 'up' : 'down'}
          variant={stats?.alerts.critical && stats.alerts.critical > 0 ? 'warning' : 'default'}
          loading={isLoading}
        />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* My Claimed Encounters - for clinicians */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                <span className="truncate">My Active Consultations</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Encounters you&apos;ve claimed and are working on
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="self-start sm:self-auto shrink-0">
              <Link href="/encounters?filter=my_claimed">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <MyClaimedEncountersWidget />
          </CardContent>
        </Card>

        {/* Recent patients */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg truncate">Recent Patients</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Patients registered or seen recently
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="self-start sm:self-auto shrink-0">
              <Link href="/patients">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <RecentPatients />
          </CardContent>
        </Card>

        {/* Alerts widget */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Active Alerts</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Critical items requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <AlertsWidget />
          </CardContent>
        </Card>
      </div>

      {/* Supervisor section - All Claimed Encounters */}
      {isSupervisor && (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                <span className="truncate">Active Consultations</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                All encounters currently being attended by clinicians
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="self-start sm:self-auto shrink-0">
              <Link href="/encounters?filter=all_claimed">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <AllClaimedEncountersWidget enabled={isSupervisor} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
