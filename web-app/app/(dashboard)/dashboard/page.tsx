'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Stethoscope, Pill, AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { TrendBadge } from '@/components/charts';
import { RecentPatients } from '@/components/dashboard/recent-patients';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';
import { AllClaimedEncountersWidget } from '@/components/dashboard/all-claimed-widget';
import { MyClaimedEncountersWidget } from '@/components/dashboard/my-claimed-widget';
import { useDashboardStats, formatNumber } from '@/lib/hooks/use-dashboard-stats';
import { useIsSupervisor } from '@/lib/auth';

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const isSupervisor = useIsSupervisor();

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

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Patients"
          value={isLoading ? '—' : formatNumber(stats?.patients.total ?? 0)}
          description={
            isLoading ? (
              'Loading...'
            ) : (
              <span className="flex items-center gap-2">
                +{stats?.patients.today ?? 0} today
                {weeklyChanges.patients > 0 && (
                  <TrendBadge
                    change={((weeklyChanges.patients / Math.max(1, (stats?.patients.total ?? 1) - weeklyChanges.patients)) * 100)}
                    size="sm"
                  />
                )}
              </span>
            )
          }
          icon={Users}
          trend="up"
          loading={isLoading}
        />
        <StatsCard
          title="Today's Encounters"
          value={isLoading ? '—' : String(stats?.encounters.today ?? 0)}
          description={
            isLoading ? (
              'Loading...'
            ) : (
              <span className="flex items-center gap-2">
                {stats?.encounters.in_progress ?? 0} in progress
                {(stats?.encounters.today ?? 0) > 0 && (
                  <TrendBadge
                    change={12.5} // Would come from API comparison in production
                    size="sm"
                  />
                )}
              </span>
            )
          }
          icon={Stethoscope}
          trend="up"
          loading={isLoading}
        />
        <StatsCard
          title="Prescriptions"
          value={isLoading ? '—' : String(stats?.pharmacy.prescriptions_today ?? 0)}
          description={
            isLoading ? (
              'Loading...'
            ) : (
              <span className="flex items-center gap-2">
                {stats?.pharmacy.pending_dispensing ?? 0} pending
              </span>
            )
          }
          icon={Pill}
          trend="neutral"
          loading={isLoading}
        />
        <StatsCard
          title="Alerts"
          value={isLoading ? '—' : String(stats?.alerts.total_unresolved ?? 0)}
          description={
            isLoading ? (
              'Loading...'
            ) : (
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
            )
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
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                My Active Consultations
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Encounters you&apos;ve claimed and are working on
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="self-start sm:self-auto">
              <Link href="/encounters?filter=my_claimed">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <MyClaimedEncountersWidget />
          </CardContent>
        </Card>

        {/* Recent patients */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent Patients</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Patients registered or seen recently
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="self-start sm:self-auto">
              <Link href="/patients">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <RecentPatients />
          </CardContent>
        </Card>

        {/* Alerts widget */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Active Alerts</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Critical items requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertsWidget />
          </CardContent>
        </Card>
      </div>

      {/* Supervisor section - All Claimed Encounters */}
      {isSupervisor && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                Active Consultations
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                All encounters currently being attended by clinicians
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="self-start sm:self-auto">
              <Link href="/encounters?filter=all_claimed">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <AllClaimedEncountersWidget enabled={isSupervisor} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
