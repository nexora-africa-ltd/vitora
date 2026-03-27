'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { HelpPopover } from '@/components/shared/help-popover';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  Stethoscope,
  Pill,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  Clock,
  FlaskConical,
  Coins,
  PackageSearch,
  UserPlus,
  ClipboardPlus,
  ClipboardCheck,
  BedDouble,
  ScanLine,
  ShieldAlert,
  Baby,
  Scissors,
  HeartHandshake,
} from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { RecentPatients } from '@/components/dashboard/recent-patients';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';
import { MyClaimedEncountersWidget } from '@/components/dashboard/my-claimed-widget';
import { useDashboardStats, formatCurrency, formatNumber } from '@/lib/hooks/use-dashboard-stats';
import { useMyStaffProfile } from '@/lib/hooks/use-rbac';
import { useTriageWaitTimeStats } from '@/lib/hooks/use-triage';
import { useEmergencySocket } from '@/lib/hooks/use-websocket';
import { useIsSupervisor, useUser } from '@/lib/auth';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { getClinicianHonorific } from '@/lib/utils/clinician-role';

type DashboardStatCard = {
  title: string;
  value: string | number;
  meta: string;
  description: string;
  icon: typeof Users;
  href: string;
  ariaLabel: string;
  variant?: 'default' | 'warning' | 'success' | 'info' | 'destructive';
  loading?: boolean;
  showTrendIndicator?: boolean;
  valueClassName?: string;
};

const AllClaimedEncountersWidget = dynamic(
  () => import('@/components/dashboard/all-claimed-widget').then((mod) => mod.AllClaimedEncountersWidget),
  {
    loading: () => <WidgetTableSkeleton rows={4} />,
  }
);

const IDSRDashboardWidget = dynamic(
  () => import('@/components/surveillance/idsr-dashboard-widget').then((mod) => mod.IDSRDashboardWidget),
  {
    loading: () => <StandaloneWidgetSkeleton title="IDSR Surveillance" description="Loading surveillance summary…" />,
  }
);

function WidgetTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-3">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

function StandaloneWidgetSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          <HelpPopover content={description} />
        </div>
      </CardHeader>
      <CardContent>
        <WidgetTableSkeleton rows={3} />
      </CardContent>
    </Card>
  );
}

function getGreetingLabel(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDisplayName(firstName?: string | null, username?: string | null) {
  const trimmedFirstName = firstName?.trim();
  if (trimmedFirstName) {
    return trimmedFirstName.charAt(0).toUpperCase() + trimmedFirstName.slice(1);
  }

  const trimmedUsername = username?.trim();
  if (trimmedUsername) {
    return trimmedUsername.charAt(0).toUpperCase() + trimmedUsername.slice(1);
  }

  return 'there';
}

function formatRoleLabel(role?: string) {
  if (!role) return null;

  return role
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join(' ');
}

export default function DashboardPage() {
  const { data: stats, isLoading, isError } = useDashboardStats();
  const { data: triageStats, isLoading: isTriageLoading } = useTriageWaitTimeStats({ dateRange: 'today' });
  const { connectionState, reconnectAttempts, lastUpdate } = useEmergencySocket();
  const isSupervisor = useIsSupervisor();
  const user = useUser();
  const { canAccessModule } = usePermissions();
  const canViewPatients = canAccessModule('patients');
  const canViewTriage = canAccessModule('triage');
  const canViewConsultations = canAccessModule('encounters');
  const canViewPharmacy = canAccessModule('pharmacy');
  const canViewLaboratory = canAccessModule('laboratory');
  const canViewBilling = canAccessModule('billing');
  const canViewSurveillance = canAccessModule('surveillance');
  const canViewCheckin = canAccessModule('checkin');
  const canViewInpatient = canAccessModule('inpatient');
  const canViewImaging = canAccessModule('imaging');
  const canViewEmergency = canAccessModule('emergency');
  const canViewMCH = canAccessModule('mch');
  const canViewTheatre = canAccessModule('theatre');
  const canViewAlliedHealth = canAccessModule('allied_health');
  const { data: staffProfile } = useMyStaffProfile();
  const { refresh, isRefreshing } = usePageRefresh();

  // Triage queue metrics
  const triageQueueCount = triageStats?.current_queue?.count ?? stats?.triage.waiting ?? 0;
  const triageAvgWait = triageStats?.current_queue?.avg_wait_minutes ?? stats?.triage.avg_wait_time_minutes ?? 0;
  const triageEmergencyCount = stats?.triage.emergency_count ?? 0;
  const isTriageWarning = triageQueueCount > 5 || triageAvgWait > 15;
  const isTriageCritical = triageQueueCount > 10 || triageAvgWait > 30;

  const handleRefresh = async () => {
    await refresh();
  };

  const greetingLabel = getGreetingLabel();
  const displayName = getDisplayName(user?.first_name, user?.username);
  const clinicianHonorific = getClinicianHonorific(user?.role, staffProfile?.primary_role_name);
  const nameWithTitle = clinicianHonorific ? `${clinicianHonorific} ${displayName}` : displayName;
  const roleLabel = formatRoleLabel(user?.role);
  const currentDateLabel = new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const statCards: DashboardStatCard[] = [
    ...(canViewPatients ? [{
      title: 'Total Patients',
      value: formatNumber(stats?.patients.total ?? 0),
      meta: `+${formatNumber(stats?.patients.today ?? 0)} registered today`,
      description: `${formatNumber(stats?.patients.this_week ?? 0)} this week`,
      icon: Users,
      href: '/patients',
      ariaLabel: 'Open patient list',
      showTrendIndicator: false,
    }] : []),
    ...(canViewTriage ? [{
      title: 'Triage Queue',
      value: formatNumber(triageQueueCount),
      meta: `${formatNumber(triageAvgWait)} min average wait`,
      description: `${formatNumber(triageEmergencyCount)} emergency cases`,
      icon: Clock,
      href: '/triage',
      ariaLabel: 'Open triage queue',
      variant: (isTriageCritical ? 'destructive' : isTriageWarning ? 'warning' : 'default') as DashboardStatCard['variant'],
      loading: isLoading && isTriageLoading,
      showTrendIndicator: false,
    }] : []),
    ...(canViewConsultations ? [{
      title: "Today's Encounters",
      value: formatNumber(stats?.encounters.today ?? 0),
      meta: `${formatNumber(stats?.encounters.in_progress ?? 0)} in progress`,
      description: `${formatNumber(stats?.encounters.completed_today ?? 0)} completed`,
      icon: Stethoscope,
      href: '/encounters',
      ariaLabel: 'Open encounters',
      showTrendIndicator: false,
    }] : []),
    ...(canViewPharmacy ? [{
      title: 'Pending Dispensing',
      value: formatNumber(stats?.pharmacy.pending_dispensing ?? 0),
      meta: `${formatNumber(stats?.pharmacy.prescriptions_today ?? 0)} prescriptions today`,
      description: `${formatNumber(stats?.pharmacy.low_stock_items ?? 0)} low stock items`,
      icon: Pill,
      href: '/pharmacy',
      ariaLabel: 'Open pharmacy dashboard',
      variant: ((stats?.pharmacy.pending_dispensing ?? 0) > 10 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewLaboratory ? [{
      title: 'Pending Lab Tests',
      value: formatNumber(stats?.laboratory.pending_tests ?? 0),
      meta: `${formatNumber(stats?.laboratory.completed_today ?? 0)} completed today`,
      description: `${formatNumber(stats?.laboratory.critical_results ?? 0)} critical results`,
      icon: FlaskConical,
      href: '/laboratory',
      ariaLabel: 'Open laboratory dashboard',
      variant: ((stats?.laboratory.critical_results ?? 0) > 0 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewPharmacy ? [{
      title: 'Low Stock Items',
      value: formatNumber(stats?.pharmacy.low_stock_items ?? 0),
      meta: `${formatNumber(stats?.pharmacy.expiring_soon ?? 0)} expiring soon`,
      description: `${formatNumber(stats?.pharmacy.pending_dispensing ?? 0)} awaiting dispensing`,
      icon: PackageSearch,
      href: '/pharmacy',
      ariaLabel: 'Open stock-sensitive pharmacy items',
      variant: ((stats?.pharmacy.low_stock_items ?? 0) > 0 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewBilling ? [{
      title: 'Revenue Today',
      value: formatCurrency(stats?.billing.revenue_today ?? 0),
      meta: `${formatCurrency(stats?.billing.pending_payments ?? 0)} pending payments`,
      description: `${formatNumber(stats?.billing.sha_claims_pending ?? 0)} SHA claims pending`,
      icon: Coins,
      href: '/billing',
      ariaLabel: 'Open billing dashboard',
      variant: 'success' as const,
      showTrendIndicator: false,
      valueClassName: 'text-2xl sm:text-3xl',
    }] : []),
    ...(canViewSurveillance ? [{
      title: 'Active Alerts',
      value: formatNumber(stats?.alerts.total_unresolved ?? 0),
      meta: `${formatNumber(stats?.alerts.critical ?? 0)} critical`,
      description: `${formatNumber(stats?.alerts.high ?? 0)} high priority`,
      icon: AlertTriangle,
      href: '/surveillance/alerts',
      ariaLabel: 'Open active alerts',
      variant: ((stats?.alerts.critical ?? 0) > 0 ? 'destructive' : (stats?.alerts.high ?? 0) > 0 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewCheckin ? [{
      title: "Today's Check-ins",
      value: formatNumber(stats?.checkin.checked_in_today ?? 0),
      meta: `${formatNumber(stats?.checkin.waiting ?? 0)} waiting`,
      description: `${formatNumber(stats?.checkin.completed_today ?? 0)} completed`,
      icon: ClipboardCheck,
      href: '/checkin',
      ariaLabel: 'Open check-in queue',
      showTrendIndicator: false,
    }] : []),
    ...(canViewInpatient ? [{
      title: 'Bed Occupancy',
      value: `${stats?.inpatient.occupancy_rate ?? 0}%`,
      meta: `${formatNumber(stats?.inpatient.current_admissions ?? 0)} admitted`,
      description: `${formatNumber(stats?.inpatient.available_beds ?? 0)} beds available`,
      icon: BedDouble,
      href: '/inpatient',
      ariaLabel: 'Open inpatient dashboard',
      variant: ((stats?.inpatient.occupancy_rate ?? 0) > 90 ? 'destructive' : (stats?.inpatient.occupancy_rate ?? 0) > 75 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewImaging ? [{
      title: 'Pending Imaging',
      value: formatNumber(stats?.imaging.pending_orders ?? 0),
      meta: `${formatNumber(stats?.imaging.urgent_orders ?? 0)} urgent`,
      description: `${formatNumber(stats?.imaging.completed_today ?? 0)} completed today`,
      icon: ScanLine,
      href: '/imaging',
      ariaLabel: 'Open imaging dashboard',
      variant: ((stats?.imaging.urgent_orders ?? 0) > 0 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewEmergency ? [{
      title: 'Emergency Access',
      value: formatNumber(stats?.emergency.active_overrides ?? 0),
      meta: `${formatNumber(stats?.emergency.pending_review ?? 0)} pending review`,
      description: 'Active overrides',
      icon: ShieldAlert,
      href: '/emergency',
      ariaLabel: 'Open emergency access log',
      variant: ((stats?.emergency.active_overrides ?? 0) > 0 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewMCH ? [{
      title: 'MCH Active',
      value: formatNumber(stats?.mch.active_registrations ?? 0),
      meta: `${formatNumber(stats?.mch.high_risk ?? 0)} high risk`,
      description: `${formatNumber(stats?.mch.deliveries_today ?? 0)} deliveries today`,
      icon: Baby,
      href: '/mch',
      ariaLabel: 'Open MCH dashboard',
      variant: ((stats?.mch.high_risk ?? 0) > 0 ? 'warning' : 'default') as DashboardStatCard['variant'],
      showTrendIndicator: false,
    }] : []),
    ...(canViewTheatre ? [{
      title: 'Theatre Today',
      value: formatNumber(stats?.theatre.scheduled_today ?? 0),
      meta: `${formatNumber(stats?.theatre.in_progress ?? 0)} in progress`,
      description: `${formatNumber(stats?.theatre.completed_today ?? 0)} completed`,
      icon: Scissors,
      href: '/theatre',
      ariaLabel: 'Open theatre schedule',
      showTrendIndicator: false,
    }] : []),
    ...(canViewAlliedHealth ? [{
      title: 'Allied Health',
      value: formatNumber(stats?.allied_health.pending_referrals ?? 0),
      meta: `${formatNumber(stats?.allied_health.sessions_today ?? 0)} sessions today`,
      description: `${formatNumber(stats?.allied_health.open_cases ?? 0)} open cases`,
      icon: HeartHandshake,
      href: '/allied-health',
      ariaLabel: 'Open allied health dashboard',
      showTrendIndicator: false,
    }] : []),
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Dashboard"
          helpContent="Track clinical workload, bottlenecks, and service pressure across registration, triage, consultations, pharmacy, laboratory, billing, and surveillance."
          actions={
            <>
              <WebSocketStatus
                connectionState={connectionState}
                reconnectAttempts={reconnectAttempts}
                lastUpdate={lastUpdate}
                showLabel
                size="sm"
                className="rounded-md bg-background px-3 py-2"
              />
              <Button variant="outline" size="sm" asChild>
                <Link href="/triage">
                  <ClipboardPlus className="mr-2 h-4 w-4" />
                  Open Triage
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/encounters/new">
                  <ClipboardPlus className="mr-2 h-4 w-4" />
                  New Encounter
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/patients/new">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Register Patient
                </Link>
              </Button>
            </>
          }
        />

        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-card p-5 sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20 sm:flex">
                <Stethoscope className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {currentDateLabel}
                </p>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  {greetingLabel}, {nameWithTitle} <span aria-hidden="true">👋</span>
                </h2>
                {roleLabel && (
                  <p className="text-sm text-muted-foreground">{roleLabel}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1 self-start sm:items-end sm:self-auto">
              {isRefreshing ? (
                <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  Refreshing data…
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {formatNumber(stats?.encounters.today ?? 0)}
                    </span>{' '}
                    {(stats?.encounters.today ?? 0) === 1 ? 'encounter' : 'encounters'} today
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {formatNumber(stats?.patients.today ?? 0)}
                    </span>{' '}
                    {(stats?.patients.today ?? 0) === 1 ? 'patient' : 'patients'} registered
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {isError && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">Dashboard data could not be refreshed.</p>
                <p className="text-sm text-muted-foreground">Showing the most recent cached values where available.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={isRefreshing}>
                Retry Refresh
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatsCard
              key={card.title}
              title={card.title}
              value={card.value}
              meta={card.meta}
              description={card.description}
              icon={card.icon}
              variant={card.variant}
              href={card.href}
              ariaLabel={card.ariaLabel}
              loading={card.loading ?? isLoading}
              showTrendIndicator={card.showTrendIndicator}
              valueClassName={card.valueClassName}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            {canViewConsultations && (
              <Card className="overflow-hidden">
                <CardHeader className="flex flex-col space-y-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <UserCheck className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
                      <span className="truncate">My Active Consultations</span>
                      <HelpPopover content="Encounters you have claimed and are currently handling." />
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="self-start shrink-0 sm:self-auto">
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
            )}

            {isSupervisor && (
              <Card className="overflow-hidden">
                <CardHeader className="flex flex-col space-y-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <UserCheck className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                      <span className="truncate">All Active Consultations</span>
                      <HelpPopover content="Supervisor view of consultations currently assigned to clinicians." />
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="self-start shrink-0 sm:self-auto">
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

            {canViewPatients && (
              <Card className="overflow-hidden">
                <CardHeader className="flex flex-col space-y-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <span className="truncate">Recent Patients</span>
                      <HelpPopover content="Patients recently registered or checked in." />
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="self-start shrink-0 sm:self-auto">
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
            )}
          </div>

          <div className="space-y-6 xl:col-span-4">
            {canViewSurveillance && (
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <span>Active Alerts</span>
                    <HelpPopover content="Critical items and escalation work requiring attention." />
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <AlertsWidget />
                </CardContent>
              </Card>
            )}

            {canViewSurveillance && <IDSRDashboardWidget />}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
