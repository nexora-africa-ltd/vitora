'use client';

import { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Users,
  Timer,
} from 'lucide-react';
import { subDays, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatsCard } from '@/components/dashboard/stats-card';
import {
  useSLAComplianceReport,
  useTATTrendReport,
  useActiveBreaches,
  useTechnicianEfficiency,
  useWorkloadKPI,
} from '@/lib/hooks/use-laboratory';

type DatePreset = 'today' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth';

const datePresets: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'last30days', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
];

function getDateRange(preset: DatePreset): { start: string; end: string } {
  const today = new Date();
  const fmt = 'yyyy-MM-dd';
  switch (preset) {
    case 'today':
      return { start: format(today, fmt), end: format(today, fmt) };
    case 'last7days':
      return { start: format(subDays(today, 7), fmt), end: format(today, fmt) };
    case 'last30days':
      return { start: format(subDays(today, 30), fmt), end: format(today, fmt) };
    case 'thisMonth':
      return { start: format(startOfMonth(today), fmt), end: format(today, fmt) };
    case 'lastMonth': {
      const lm = subMonths(today, 1);
      return { start: format(startOfMonth(lm), fmt), end: format(endOfMonth(lm), fmt) };
    }
  }
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function LabSLADashboardPage() {
  const [preset, setPreset] = useState<DatePreset>('last7days');
  const { start, end } = useMemo(() => getDateRange(preset), [preset]);

  const { data: compliance, isLoading: compLoading } = useSLAComplianceReport(start, end);
  const { data: trend, isLoading: trendLoading } = useTATTrendReport(start, end);
  const { data: breaches, isLoading: breachLoading } = useActiveBreaches();
  const { data: techEfficiency, isLoading: techLoading } = useTechnicianEfficiency(start, end);
  const { data: workloadKPI, isLoading: workloadLoading } = useWorkloadKPI(start, end);

  const isLoading = compLoading || trendLoading || breachLoading || techLoading || workloadLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader title="SLA & Performance" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const summary = compliance?.summary;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="SLA & Performance"
        helpContent="Monitor turnaround time SLA compliance, active breaches, technician efficiency, and workload KPIs. Data updates in real-time for active breaches."
        actions={
          <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {datePresets.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="SLA Compliance"
          value={`${summary?.compliance_rate ?? 100}%`}
          icon={CheckCircle2}
          description={`${summary?.total_orders ?? 0} orders completed`}
          trend={summary?.compliance_rate && summary.compliance_rate >= 90 ? 'up' : 'down'}
        />
        <StatsCard
          title="Active Breaches"
          value={breaches?.count ?? 0}
          icon={AlertTriangle}
          description="Currently overdue"
          trend={breaches?.count && breaches.count > 0 ? 'down' : 'up'}
        />
        <StatsCard
          title="Avg TAT"
          value={formatMinutes(summary?.avg_total_minutes ?? null)}
          icon={Clock}
          description="Order to verification"
        />
        <StatsCard
          title="P90 TAT"
          value={formatMinutes(summary?.p90_minutes ?? null)}
          icon={Timer}
          description="90th percentile"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="compliance" className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-4">
            <TabsTrigger value="compliance" className="whitespace-nowrap px-3 text-xs sm:text-sm">Compliance</TabsTrigger>
            <TabsTrigger value="breaches" className="whitespace-nowrap px-3 text-xs sm:text-sm">Breaches</TabsTrigger>
            <TabsTrigger value="efficiency" className="whitespace-nowrap px-3 text-xs sm:text-sm">Efficiency</TabsTrigger>
            <TabsTrigger value="workload" className="whitespace-nowrap px-3 text-xs sm:text-sm">Workload</TabsTrigger>
          </TabsList>
        </div>

        {/* SLA Compliance Tab */}
        <TabsContent value="compliance" className="space-y-4">
          {/* TAT Segments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">TAT Segments (Average)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatMinutes(compliance?.segments.avg_order_to_collect ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Order → Collect</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatMinutes(compliance?.segments.avg_collect_to_receive ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Collect → Receive</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatMinutes(compliance?.segments.avg_receive_to_result ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Receive → Result</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatMinutes(compliance?.segments.avg_result_to_verify ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Result → Verify</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* By Priority */}
          {compliance?.by_priority && compliance.by_priority.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Priority</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={compliance.by_priority}
                  keyExtractor={(item) => item.priority}
                  columns={[
                    { key: 'priority', header: 'Priority', sortable: true, cell: (r) => <Badge variant="outline">{r.priority}</Badge> },
                    { key: 'count', header: 'Orders', sortable: true, sortType: 'number', cell: (r) => r.count },
                    { key: 'compliance_rate', header: 'Compliance', sortable: true, sortType: 'number', cell: (r) => (
                      <span className={r.compliance_rate >= 90 ? 'text-green-600' : 'text-destructive'}>{r.compliance_rate}%</span>
                    )},
                    { key: 'avg_minutes', header: 'Avg TAT', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.avg_minutes) },
                    { key: 'p90_minutes', header: 'P90', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.p90_minutes) },
                    { key: 'breaches', header: 'Breaches', sortable: true, sortType: 'number', cell: (r) => (
                      <span className={r.breaches > 0 ? 'text-destructive font-medium' : ''}>{r.breaches}</span>
                    )},
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* By Test */}
          {compliance?.by_test && compliance.by_test.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Test (Top 20)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={compliance.by_test}
                  keyExtractor={(item) => item.test_code}
                  columns={[
                    { key: 'test_code', header: 'Code', sortable: true, cell: (r) => <code className="text-xs">{r.test_code}</code> },
                    { key: 'test_name', header: 'Test', sortable: true, cell: (r) => r.test_name },
                    { key: 'count', header: 'Orders', sortable: true, sortType: 'number', cell: (r) => r.count },
                    { key: 'compliance_rate', header: 'Compliance', sortable: true, sortType: 'number', cell: (r) => (
                      <span className={r.compliance_rate >= 90 ? 'text-green-600' : 'text-destructive'}>{r.compliance_rate}%</span>
                    )},
                    { key: 'avg_minutes', header: 'Avg TAT', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.avg_minutes) },
                    { key: 'breaches', header: 'Breaches', sortable: true, sortType: 'number', cell: (r) => r.breaches },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* Daily Trend */}
          {trend?.daily && trend.daily.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Daily TAT Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={trend.daily}
                  keyExtractor={(item) => item.date}
                  defaultSortColumn="date"
                  defaultSortDirection="desc"
                  columns={[
                    { key: 'date', header: 'Date', sortable: true, sortType: 'date', cell: (r) => r.date },
                    { key: 'count', header: 'Orders', sortable: true, sortType: 'number', cell: (r) => r.count },
                    { key: 'avg_minutes', header: 'Avg TAT', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.avg_minutes) },
                    { key: 'p90_minutes', header: 'P90', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.p90_minutes) },
                    { key: 'breaches', header: 'Breaches', sortable: true, sortType: 'number', cell: (r) => (
                      <span className={r.breaches > 0 ? 'text-destructive font-medium' : ''}>{r.breaches}</span>
                    )},
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Active Breaches Tab */}
        <TabsContent value="breaches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Active SLA Breaches ({breaches?.count ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {breaches?.breaches && breaches.breaches.length > 0 ? (
                <ResponsiveTable
                  data={breaches.breaches}
                  keyExtractor={(item) => item.order_number}
                  defaultSortColumn="breach_minutes"
                  defaultSortDirection="desc"
                  columns={[
                    { key: 'order_number', header: 'Order', sortable: true, cell: (r) => (
                      <code className="text-xs">{r.order_number}</code>
                    )},
                    { key: 'test_name', header: 'Test', sortable: true, cell: (r) => r.test_name },
                    { key: 'priority', header: 'Priority', sortable: true, cell: (r) => (
                      <Badge variant={r.priority === 'STAT' ? 'destructive' : 'outline'}>{r.priority}</Badge>
                    )},
                    { key: 'status', header: 'Status', sortable: true, cell: (r) => r.status },
                    { key: 'elapsed_minutes', header: 'Elapsed', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.elapsed_minutes) },
                    { key: 'target_minutes', header: 'Target', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.target_minutes) },
                    { key: 'breach_minutes', header: 'Overdue', sortable: true, sortType: 'number', cell: (r) => (
                      <span className="text-destructive font-medium">+{formatMinutes(r.breach_minutes)}</span>
                    )},
                    { key: 'patient_name', header: 'Patient', cell: (r) => r.patient_name || '—', hideOnMobile: true },
                  ]}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
                  <p className="text-lg font-medium">No Active Breaches</p>
                  <p className="text-sm">All orders are within SLA targets</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technician Efficiency Tab */}
        <TabsContent value="efficiency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Technician Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {techEfficiency?.technicians && techEfficiency.technicians.length > 0 ? (
                <ResponsiveTable
                  data={techEfficiency.technicians}
                  keyExtractor={(item) => String(item.technician_id)}
                  defaultSortColumn="results_entered"
                  defaultSortDirection="desc"
                  columns={[
                    { key: 'technician_name', header: 'Technician', sortable: true, cell: (r) => r.technician_name },
                    { key: 'results_entered', header: 'Results', sortable: true, sortType: 'number', cell: (r) => r.results_entered },
                    { key: 'avg_entry_time_minutes', header: 'Avg Entry Time', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.avg_entry_time_minutes) },
                    { key: 'breaches', header: 'Breaches', sortable: true, sortType: 'number', cell: (r) => (
                      <span className={r.breaches > 0 ? 'text-destructive' : ''}>{r.breaches}</span>
                    )},
                    { key: 'breach_rate', header: 'Breach Rate', sortable: true, sortType: 'number', cell: (r) => (
                      <span className={r.breach_rate > 10 ? 'text-destructive' : ''}>{r.breach_rate}%</span>
                    )},
                  ]}
                />
              ) : (
                <p className="text-center text-muted-foreground py-8">No data for selected period</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workload KPI Tab */}
        <TabsContent value="workload" className="space-y-4">
          {workloadKPI && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{workloadKPI.totals.tests_entered}</p>
                    <p className="text-xs text-muted-foreground">Tests Entered</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{workloadKPI.totals.tests_verified}</p>
                    <p className="text-xs text-muted-foreground">Tests Verified</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{workloadKPI.totals.rejection_rate}%</p>
                    <p className="text-xs text-muted-foreground">Rejection Rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{workloadKPI.totals.critical_compliance_rate}%</p>
                    <p className="text-xs text-muted-foreground">Critical Compliance</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{formatMinutes(workloadKPI.totals.avg_entry_time_minutes)}</p>
                    <p className="text-xs text-muted-foreground">Avg Entry Time</p>
                  </CardContent>
                </Card>
              </div>

              {workloadKPI.by_technician.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Workload by Technician</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveTable
                      data={workloadKPI.by_technician}
                      keyExtractor={(item) => String(item.technician_id)}
                      defaultSortColumn="tests_entered"
                      defaultSortDirection="desc"
                      columns={[
                        { key: 'technician_name', header: 'Technician', sortable: true, cell: (r) => r.technician_name },
                        { key: 'tests_entered', header: 'Entered', sortable: true, sortType: 'number', cell: (r) => r.tests_entered },
                        { key: 'tests_verified', header: 'Verified', sortable: true, sortType: 'number', cell: (r) => r.tests_verified },
                        { key: 'specimens_rejected', header: 'Rejected', sortable: true, sortType: 'number', cell: (r) => r.specimens_rejected },
                        { key: 'avg_entry_time_minutes', header: 'Avg Entry', sortable: true, sortType: 'number', cell: (r) => formatMinutes(r.avg_entry_time_minutes) },
                      ]}
                    />
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
