'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Stethoscope, Pill, AlertTriangle, ArrowRight } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { RecentPatients } from '@/components/dashboard/recent-patients';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';
import { useDashboardStats, formatNumber } from '@/lib/hooks/use-dashboard-stats';

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to Vitora HMIS. Here&apos;s an overview of your facility.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Patients"
          value={isLoading ? '—' : formatNumber(stats?.patients.total ?? 0)}
          description={
            isLoading
              ? 'Loading...'
              : `+${stats?.patients.today ?? 0} today`
          }
          icon={Users}
          trend="up"
          loading={isLoading}
        />
        <StatsCard
          title="Today's Encounters"
          value={isLoading ? '—' : String(stats?.encounters.today ?? 0)}
          description={
            isLoading
              ? 'Loading...'
              : `${stats?.encounters.in_progress ?? 0} in progress`
          }
          icon={Stethoscope}
          trend="up"
          loading={isLoading}
        />
        <StatsCard
          title="Prescriptions"
          value={isLoading ? '—' : String(stats?.pharmacy.prescriptions_today ?? 0)}
          description={
            isLoading
              ? 'Loading...'
              : `${stats?.pharmacy.pending_dispensing ?? 0} pending`
          }
          icon={Pill}
          trend="neutral"
          loading={isLoading}
        />
        <StatsCard
          title="Alerts"
          value={isLoading ? '—' : String(stats?.alerts.total_unresolved ?? 0)}
          description={
            isLoading
              ? 'Loading...'
              : `${stats?.alerts.critical ?? 0} critical`
          }
          icon={AlertTriangle}
          trend={stats?.alerts.critical && stats.alerts.critical > 0 ? 'up' : 'down'}
          variant={stats?.alerts.critical && stats.alerts.critical > 0 ? 'warning' : 'default'}
          loading={isLoading}
        />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent patients */}
        <Card >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Recent Patients</CardTitle>
              <CardDescription>
                Patients registered or seen recently
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
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
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>
              Critical items requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertsWidget />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
