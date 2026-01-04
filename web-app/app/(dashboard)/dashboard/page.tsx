import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Stethoscope, Pill, AlertTriangle, ArrowRight } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { RecentPatients } from '@/components/dashboard/recent-patients';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';

export default function DashboardPage() {
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
          value="1,234"
          description="+12 from last week"
          icon={Users}
          trend="up"
        />
        <StatsCard
          title="Today's Encounters"
          value="48"
          description="8 in progress"
          icon={Stethoscope}
          trend="up"
        />
        <StatsCard
          title="Prescriptions"
          value="156"
          description="Today's dispensed"
          icon={Pill}
          trend="neutral"
        />
        <StatsCard
          title="Alerts"
          value="3"
          description="Require attention"
          icon={AlertTriangle}
          trend="down"
          variant="warning"
        />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent patients */}
        <Card>
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
