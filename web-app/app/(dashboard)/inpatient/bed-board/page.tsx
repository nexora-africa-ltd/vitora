'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bed,
  BedDouble,
  Building2,
  CalendarClock,
  ChevronRight,
  Search,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { ConstraintOverrideMetrics } from '@/components/inpatient';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import {
  useInpatientWards,
  useAdmissions,
  useBedUtilization,
} from '@/lib/hooks/use-inpatient';
import { useSupervisorAlerts } from '@/lib/hooks';

export default function InpatientBedBoardPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: wards, isLoading: wardsLoading } = useInpatientWards();
  const { data: admissions, isLoading: admissionsLoading } = useAdmissions({
    admission_status: 'ACTIVE',
    page_size: 200,
  });
  const {
    alerts,
    connectionState,
    lastUpdated,
  } = useSupervisorAlerts();

  const wardsList = useMemo(() => ((wards as any)?.results ?? wards ?? []), [wards]);
  const filteredWards = useMemo(() => {
    if (!searchQuery) {
      return wardsList;
    }

    const query = searchQuery.toLowerCase();
    return wardsList.filter((ward: any) => (
      ward.name.toLowerCase().includes(query)
      || ward.code.toLowerCase().includes(query)
      || (ward.ward_type_display || ward.ward_type || '').toLowerCase().includes(query)
    ));
  }, [wardsList, searchQuery]);

  const activeAdmissions = admissions?.count ?? admissions?.results?.length ?? 0;
  const pendingAlerts = alerts.filter((alert) => !alert.is_acknowledged);
  const totalBeds = wardsList.reduce((sum: number, ward: any) => sum + (ward.total_beds || 0), 0);
  const occupiedBeds = wardsList.reduce((sum: number, ward: any) => sum + (ward.occupied_beds || 0), 0);
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  if (wardsLoading || admissionsLoading) {
    return <BedBoardSkeleton />;
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-4 sm:space-y-6">
        <PageHeader
          title="Inpatient Bed Board"
          helpContent="Centralized operational view of ward capacity, predicted discharges, and supervisor escalation pressure. Use this board to direct bed placement and spot emerging bottlenecks."
          actions={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/inpatient/alerts">Supervisor Alerts</Link>
              </Button>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/admissions/new">New Admission</Link>
              </Button>
            </div>
          }
        />

        <section className="relative overflow-hidden rounded-3xl border border-primary/10 bg-card p-5 shadow-sm sm:p-6 lg:p-7">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]"
            aria-hidden="true"
          />
          <div className="relative grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4">
              <Badge variant="outline" className="w-fit border-primary/30 bg-background/80 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Operational Command Surface
              </Badge>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Monitor availability, protect the emergency buffer, and keep discharge timing realistic.
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  This board composes live ward analytics with supervisor exception signals so you can decide whether to place, hold, or escalate without jumping between multiple inpatient screens.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <WebSocketStatus connectionState={connectionState} lastUpdate={lastUpdated} showLabel size="sm" />
                <div className="rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                  {pendingAlerts.length} pending supervisor alert{pendingAlerts.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <SummaryTile icon={Building2} title="Wards" value={wardsList.length} description="Active inpatient locations" />
              <SummaryTile icon={BedDouble} title="Beds Occupied" value={`${occupiedBeds}/${totalBeds}`} description={`${occupancyRate}% hospital occupancy`} />
              <SummaryTile icon={Users} title="Active Admissions" value={activeAdmissions} description="Current inpatient census" />
              <SummaryTile icon={AlertTriangle} title="Pending Alerts" value={pendingAlerts.length} description="Critical overrides awaiting review" variant={pendingAlerts.length > 0 ? 'warning' : 'default'} />
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="overflow-hidden border-primary/10 shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2">
                <CardTitle>Ward planning board</CardTitle>
                <HelpPopover content="These cards reuse the same utilization and discharge-planning signals shown on the ward detail pages, but aggregate them into one place for bed managers." />
              </div>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search wards by name, code, or type"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredWards.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                  No wards matched your search.
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredWards.map((ward: any) => (
                    <BedBoardWardCard key={ward.id} ward={ward} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-primary/10 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Supervisor summary</CardTitle>
                  <CardDescription>Reuse the alert workspace for full acknowledgement, but keep the current exception load visible here.</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/inpatient/alerts">Open full alerts</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingAlerts.length === 0 ? (
                <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No pending supervisor acknowledgements right now.
                </div>
              ) : (
                pendingAlerts.slice(0, 4).map((alert) => (
                  <div key={alert.admission_id} className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{alert.patient_name}</p>
                        <p className="text-xs text-muted-foreground">{alert.ward_name} • Bed {alert.bed_number}</p>
                      </div>
                      <Badge variant="destructive">{alert.critical_violations.length}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                      {alert.override_reason || 'Critical constraint override requires supervisor review.'}
                    </p>
                    <Button variant="link" className="mt-2 h-auto p-0" asChild>
                      <Link href="/inpatient/alerts">
                        Review in supervisor alerts
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="capacity" className="space-y-4">
          <TabsList>
            <TabsTrigger value="capacity">Capacity view</TabsTrigger>
            <TabsTrigger value="supervision">Supervisor trends</TabsTrigger>
          </TabsList>

          <TabsContent value="capacity" className="space-y-4">
            <Card className="border-primary/10 shadow-sm">
              <CardHeader>
                <CardTitle>Hospital occupancy</CardTitle>
                <CardDescription>Track overall pressure before drilling into a specific ward.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={occupancyRate} className="h-3" />
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>{occupiedBeds} occupied</span>
                  <span>{Math.max(totalBeds - occupiedBeds, 0)} unoccupied</span>
                  <span>{occupancyRate}% occupancy</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="supervision" className="space-y-4">
            <Card className="border-primary/10 shadow-sm">
              <CardHeader>
                <CardTitle>Supervisor handoff cue</CardTitle>
                <CardDescription>
                  Keep the alert workspace as the source of truth, but bring the same operational signals into the bed board for shift-level planning.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Pending critical overrides usually mean the bed board needs intervention, not just acknowledgement. Review the related ward card first, then move to the full supervisor alerts screen to document the decision.
                </p>
                <Button variant="outline" asChild>
                  <Link href="/inpatient/alerts">Go to supervisor alerts</Link>
                </Button>
              </CardContent>
            </Card>

            <ConstraintOverrideMetrics className="border-primary/10 shadow-sm" />
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

function SummaryTile({
  icon: Icon,
  title,
  value,
  description,
  variant = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string | number;
  description: string;
  variant?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-background/80 p-4 backdrop-blur-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${variant === 'warning' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function BedBoardWardCard({ ward }: { ward: any }) {
  const { data: utilization, isLoading } = useBedUtilization(ward.id);

  if (isLoading || !utilization) {
    return <Skeleton className="h-72 w-full" />;
  }

  const occupancyTone = utilization.occupancy_rate >= 90
    ? 'text-destructive'
    : utilization.occupancy_rate >= 75
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-foreground';

  return (
    <Card className="relative overflow-hidden border-primary/10">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{utilization.ward_name}</CardTitle>
            <CardDescription>{utilization.ward_code}</CardDescription>
          </div>
          <Badge variant={ward.ward_type === 'ICU' ? 'destructive' : 'outline'} className="shrink-0">
            {ward.ward_type_display || ward.ward_type}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Occupancy</span>
            <span className={`font-semibold ${occupancyTone}`}>{utilization.occupancy_rate}%</span>
          </div>
          <Progress value={utilization.occupancy_rate} className="h-2.5" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MetricPill icon={Bed} label="Available" value={utilization.available} />
          <MetricPill icon={Users} label="Occupied" value={utilization.occupied} />
          <MetricPill icon={AlertTriangle} label="Emergency buffer" value={utilization.emergency_buffer_beds} />
          <MetricPill icon={CalendarClock} label="Predicted 24h" value={utilization.predicted_discharges_next_24h} />
        </div>

        <div className="rounded-xl border bg-muted/20 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Effective availability</span>
            <span className="font-semibold">{utilization.effective_available}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground">Workload score</span>
            <span className="font-semibold">{utilization.workload_score.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" size="sm" className="w-full sm:flex-1" asChild>
            <Link href={`/wards/${ward.id}`}>Open ward board</Link>
          </Button>
          <Button size="sm" className="w-full sm:flex-1" asChild disabled={utilization.effective_available <= 0 && utilization.predicted_discharges_next_24h <= 0}>
            <Link href={`/admissions/new?ward=${ward.id}`}>Place patient</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function BedBoardSkeleton() {
  return (
    <div className="container mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-4 sm:space-y-6">
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Skeleton className="h-[720px] w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}