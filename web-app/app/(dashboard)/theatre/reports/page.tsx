'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Activity, Clock3, Gauge, Stethoscope, TrendingUp, UserRound } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/shared/export-button';
import { TheatreCaseStatusBadge, TheatreMetricCard } from '@/components/theatre/theatre-display';
import { theatreApi } from '@/lib/api/theatre';
import type { TheatreReportClinicianWorkload, TheatreReportSummary } from '@/lib/types/theatre';

function isoDate(offsetDays = 0) {
  const current = new Date();
  current.setDate(current.getDate() + offsetDays);
  return current.toISOString().split('T')[0] ?? '';
}

function formatHours(minutes: number) {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

function WorkloadList({
  title,
  icon: Icon,
  items,
  emptyMessage,
}: {
  title: string;
  icon: typeof UserRound;
  items: TheatreReportClinicianWorkload[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          items.map((item) => (
            <div key={item.clinician_id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.clinician_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.completed_case_count} completed of {item.case_count} case{item.case_count === 1 ? '' : 's'}
                  </p>
                </div>
                <Badge variant="outline" size="sm" className="w-fit shrink-0">
                  {formatHours(item.scheduled_minutes)} booked
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actual time</p>
                  <p className="text-sm font-medium">{formatHours(item.actual_minutes)}</p>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg case</p>
                  <p className="text-sm font-medium">{item.average_case_duration_minutes} min</p>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function TheatreReportsPage() {
  const [report, setReport] = useState<TheatreReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);
  const [isPending, beginRangeTransition] = useTransition();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    theatreApi.getReportSummary({
      date_from: isoDate(-(rangeDays - 1)),
      date_to: isoDate(0),
    }).then((response) => {
      if (!mounted) return;
      setReport(response);
    }).catch(() => {
      if (!mounted) return;
      setReport(null);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [rangeDays]);

  const totals = report?.totals;
  const onTimeStarts = report?.on_time_starts;
  const throughputSeries = useMemo(() => report?.throughput_by_day ?? [], [report]);
  const utilizationByTheatre = useMemo(() => report?.utilization_by_theatre ?? [], [report]);
  const surgeonWorkload = useMemo(() => report?.surgeon_workload.slice(0, 5) ?? [], [report]);
  const anesthesiologistWorkload = useMemo(
    () => report?.anesthesiologist_workload.slice(0, 5) ?? [],
    [report]
  );
  const statusMix = useMemo(
    () => (report?.status_breakdown ?? []).map((item) => ({ name: item.status.replace(/_/g, ' '), value: item.count })),
    [report]
  );
  const activeStatusCounts = useMemo(
    () => (report?.status_breakdown ?? []).filter((item) => ['PRE_OP', 'IN_THEATRE', 'IN_SURGERY', 'IN_PACU'].includes(item.status)),
    [report]
  );

  const statusColors = ['#0ea5e9', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#22c55e', '#f59e0b', '#6b7280'];
  const completionRate = totals && totals.case_count > 0
    ? Math.round((totals.completed_case_count / totals.case_count) * 100)
    : 0;
  const busiestDay = throughputSeries.reduce<(typeof throughputSeries)[number] | null>((currentBest, item) => {
    if (!currentBest || item.case_count > currentBest.case_count) return item;
    return currentBest;
  }, null);
  const highestUtilizationTheatre = utilizationByTheatre[0] ?? null;
  const lowestUtilizationTheatre = utilizationByTheatre.length > 0 ? utilizationByTheatre[utilizationByTheatre.length - 1] : null;
  const lateStartsPercent = onTimeStarts?.measured_case_count
    ? Math.round((onTimeStarts.late_case_count / onTimeStarts.measured_case_count) * 100)
    : 0;
  const exportRows = useMemo(
    () => utilizationByTheatre.map((item) => ({
      theatre_code: item.theatre_code,
      theatre_name: item.theatre_name,
      utilization_percent: item.utilization_percent,
      scheduled_hours: Math.round((item.scheduled_minutes / 60) * 10) / 10,
      available_hours: Math.round((item.available_minutes / 60) * 10) / 10,
      completed_cases: item.completed_case_count,
      cancelled_cases: item.cancelled_case_count,
      average_turnaround_minutes: item.turnaround_average_minutes,
      average_case_duration_minutes: item.average_case_duration_minutes,
    })),
    [utilizationByTheatre]
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Theatre Reports"
        helpContent="Operational theatre analytics built from the theatre reporting API. Review booked utilization, throughput, turnaround, on-time starts, and clinician workload over a selected reporting window."
        actions={
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((days) => (
              <Button key={days} variant={rangeDays === days ? 'default' : 'outline'} size="sm" onClick={() => beginRangeTransition(() => setRangeDays(days))} disabled={isPending && rangeDays === days}>
                {days}d
              </Button>
            ))}
            {report ? (
              <ExportButton
                data={exportRows}
                filename={`theatre-performance-${rangeDays}d`}
                title="Theatre Performance Summary"
                subtitle={`Reporting window: last ${rangeDays} days`}
                showPrint={false}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Cases', value: totals?.case_count ?? 0, icon: Activity },
          { label: 'Booked Utilization %', value: totals?.utilization_percent ?? 0, icon: Gauge },
          { label: 'On-Time Starts %', value: onTimeStarts?.percent ?? 0, icon: TrendingUp },
          { label: 'Avg Turnaround Min', value: report?.turnaround.average_minutes ?? 0, icon: Clock3 },
        ].map((card) => (
          <div key={card.label} className="relative">
            <TheatreMetricCard label={card.label} value={card.value} />
            <card.icon className="pointer-events-none absolute right-4 top-4 h-7 w-7 text-muted-foreground/60" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">On-Time Starts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading || isPending ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading report data...</div>
            ) : !onTimeStarts ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No on-time start data available for this range.</div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">Measured starts</p>
                    <p className="text-xs text-muted-foreground">
                      Threshold: within {onTimeStarts.threshold_minutes} minutes of scheduled start
                    </p>
                  </div>
                  <Badge variant={onTimeStarts.percent >= 80 ? 'success' : onTimeStarts.percent >= 60 ? 'warning' : 'destructive'} size="sm" className="w-fit">
                    {onTimeStarts.percent}% on time
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Measured</p>
                    <p className="mt-1 text-2xl font-semibold">{onTimeStarts.measured_case_count}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">On time</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-600">{onTimeStarts.on_time_case_count}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Late starts</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-600">{onTimeStarts.late_case_count}</p>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>On-time mix</span>
                    <span>{onTimeStarts.on_time_case_count} / {Math.max(onTimeStarts.measured_case_count, 1)}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="flex h-full">
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${onTimeStarts.measured_case_count > 0 ? (onTimeStarts.on_time_case_count / onTimeStarts.measured_case_count) * 100 : 0}%` }}
                      />
                      <div
                        className="bg-amber-400"
                        style={{ width: `${onTimeStarts.measured_case_count > 0 ? (onTimeStarts.late_case_count / onTimeStarts.measured_case_count) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Throughput by Day</CardTitle></CardHeader>
          <CardContent className="h-80">
            {loading || isPending ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading report data...</div>
            ) : throughputSeries.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No throughput data available for this range.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputSeries} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="case_count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Workflow Status Mix</CardTitle></CardHeader>
          <CardContent className="h-80">
            {loading || isPending ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading report data...</div>
            ) : statusMix.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No case status mix available for this range.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={4}>
                    {statusMix.map((entry, index) => <Cell key={entry.name} fill={statusColors[index % statusColors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <WorkloadList
          title="Lead Surgeon Workload"
          icon={UserRound}
          items={surgeonWorkload}
          emptyMessage="No surgeon workload data available for this range."
        />

        <WorkloadList
          title="Anesthesia Workload"
          icon={Stethoscope}
          items={anesthesiologistWorkload}
          emptyMessage="No anesthesia workload data available for this range."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Theatre Performance Detail</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {utilizationByTheatre.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">No theatre-level performance rows are available for this range.</div>
            ) : (
              utilizationByTheatre.map((item) => (
                <div key={item.theatre_id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.theatre_name}</p>
                      <p className="text-xs text-muted-foreground">{item.theatre_code} • {item.completed_case_count}/{item.case_count} completed</p>
                    </div>
                    <Badge variant={item.utilization_percent >= 80 ? 'success' : item.utilization_percent >= 60 ? 'info' : 'outline'} size="sm" className="w-fit shrink-0">
                      {item.utilization_percent}% utilized
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Booked hours</p>
                      <p className="text-sm font-medium">{formatHours(item.scheduled_minutes)}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg turnaround</p>
                      <p className="text-sm font-medium">{item.turnaround_average_minutes || 0} min</p>
                    </div>
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cancelled</p>
                      <p className="text-sm font-medium">{item.cancelled_case_count}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Bottleneck Watch</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Late starts</p>
              <p className="mt-1 text-xs text-muted-foreground">{onTimeStarts?.late_case_count ?? 0} of {onTimeStarts?.measured_case_count ?? 0} measured starts exceeded the {onTimeStarts?.threshold_minutes ?? 15} minute tolerance.</p>
              <Badge variant={lateStartsPercent <= 20 ? 'success' : lateStartsPercent <= 40 ? 'warning' : 'destructive'} size="sm" className="mt-3 w-fit">{lateStartsPercent}% late</Badge>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Busiest day</p>
              <p className="mt-1 text-xs text-muted-foreground">{busiestDay ? `${busiestDay.date} carried ${busiestDay.case_count} scheduled cases and ${Math.round((busiestDay.scheduled_minutes / 60) * 10) / 10} booked hours.` : 'No daily throughput data is available.'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Utilization spread</p>
              <p className="mt-1 text-xs text-muted-foreground">{highestUtilizationTheatre ? `${highestUtilizationTheatre.theatre_name} leads at ${highestUtilizationTheatre.utilization_percent}% utilization.` : 'No theatre utilization data available.'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{lowestUtilizationTheatre ? `${lowestUtilizationTheatre.theatre_name} is lowest at ${lowestUtilizationTheatre.utilization_percent}% utilization.` : ''}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Capacity signal</p>
              <p className="mt-1 text-xs text-muted-foreground">{surgeonWorkload[0] ? `${surgeonWorkload[0].clinician_name} carries the highest surgical load with ${surgeonWorkload[0].case_count} cases over ${formatHours(surgeonWorkload[0].scheduled_minutes)} booked.` : 'No surgeon workload data available.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Utilization by Theatre</CardTitle></CardHeader>
          <CardContent className="h-80">
            {loading || isPending ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading report data...</div>
            ) : utilizationByTheatre.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No theatre utilization data available for this range.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilizationByTheatre} layout="vertical" margin={{ left: 40, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" unit="%" />
                  <YAxis type="category" dataKey="theatre_code" width={72} />
                  <Tooltip />
                  <Bar dataKey="utilization_percent" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Operational Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Completion rate</span><Badge variant={completionRate >= 70 ? 'success' : 'warning'} size="sm" className="w-fit">{completionRate}%</Badge></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Active workflow cases</span><Badge variant="outline" size="sm" className="w-fit">{totals?.active_case_count ?? 0}</Badge></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Report window</span><Badge variant="outline" size="sm" className="w-fit">Last {rangeDays} days</Badge></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Average daily throughput</span><Badge variant="info" size="sm" className="w-fit">{totals?.average_daily_throughput ?? 0}</Badge></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Cases with turnaround measured</span><Badge variant="info" size="sm" className="w-fit">{report?.turnaround.cases_with_measurement_count ?? 0}</Badge></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Booked vs available hours</span><Badge variant="outline" size="sm" className="w-fit">{Math.round(((totals?.scheduled_minutes ?? 0) / 60) * 10) / 10} / {Math.round(((totals?.available_minutes ?? 0) / 60) * 10) / 10}h</Badge></div>
            {activeStatusCounts.length > 0 ? (
              <div className="rounded-lg border p-3">
                <p className="mb-3 text-sm font-medium">Live workflow distribution</p>
                <div className="space-y-2">
                  {activeStatusCounts.map((item) => (
                    <div key={item.status} className="flex items-center justify-between gap-3">
                      <TheatreCaseStatusBadge status={item.status} />
                      <span className="text-sm font-medium text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {utilizationByTheatre[0] ? (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Highest booked theatre: <span className="font-medium text-foreground">{utilizationByTheatre[0].theatre_name}</span> at <span className="font-medium text-foreground">{utilizationByTheatre[0].utilization_percent}%</span> booked utilization.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
