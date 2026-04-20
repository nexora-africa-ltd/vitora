'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Clock, Scissors, TrendingUp } from 'lucide-react';
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
import { TheatreCaseStatusBadge, TheatreMetricCard } from '@/components/theatre/theatre-display';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseList } from '@/lib/types/theatre';

function isoDate(offsetDays = 0) {
  const current = new Date();
  current.setDate(current.getDate() + offsetDays);
  return current.toISOString().split('T')[0] ?? '';
}

export default function TheatreReportsPage() {
  const [cases, setCases] = useState<SurgeryCaseList[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    theatreApi.listCases({
      page_size: 500,
      scheduled_date_after: isoDate(-(rangeDays - 1)),
      scheduled_date_before: isoDate(0),
    }).then((response) => {
      if (!mounted) return;
      setCases(response.results);
    }).catch(() => {
      if (!mounted) return;
      setCases([]);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [rangeDays]);

  const totals = useMemo(() => {
    const completed = cases.filter((item) => item.status === 'DISCHARGED').length;
    const urgent = cases.filter((item) => item.priority !== 'ELECTIVE').length;
    const scheduledMinutes = cases.reduce((sum, item) => sum + (item.estimated_duration_minutes || 0), 0);
    const active = cases.filter((item) => ['PRE_OP', 'IN_THEATRE', 'IN_SURGERY', 'IN_PACU'].includes(item.status)).length;
    return {
      total: cases.length,
      completed,
      urgent,
      scheduledHours: Math.round((scheduledMinutes / 60) * 10) / 10,
      active,
      completionRate: cases.length > 0 ? Math.round((completed / cases.length) * 100) : 0,
    };
  }, [cases]);

  const procedureVolume = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of cases) {
      counts.set(item.primary_procedure_name, (counts.get(item.primary_procedure_name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [cases]);

  const theatreLoad = useMemo(() => {
    const counts = new Map<string, number>();
    const minutes = new Map<string, number>();
    for (const item of cases) {
      counts.set(item.theatre_name, (counts.get(item.theatre_name) || 0) + 1);
      minutes.set(item.theatre_name, (minutes.get(item.theatre_name) || 0) + (item.estimated_duration_minutes || 0));
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, hours: Math.round(((minutes.get(name) || 0) / 60) * 10) / 10 }))
      .sort((left, right) => right.hours - left.hours);
  }, [cases]);

  const statusMix = useMemo(() => {
    const statuses = ['SCHEDULED', 'PRE_OP', 'IN_THEATRE', 'IN_SURGERY', 'IN_PACU', 'DISCHARGED', 'POSTPONED', 'CANCELLED'];
    return statuses
      .map((status) => ({ name: status.replace(/_/g, ' '), value: cases.filter((item) => item.status === status).length }))
      .filter((item) => item.value > 0);
  }, [cases]);

  const activeStatusCounts = useMemo(() => {
    const activeStatuses = ['PRE_OP', 'IN_THEATRE', 'IN_SURGERY', 'IN_PACU'];
    return activeStatuses
      .map((status) => ({ status, count: cases.filter((item) => item.status === status).length }))
      .filter((item) => item.count > 0);
  }, [cases]);

  const statusColors = ['#0ea5e9', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#22c55e', '#f59e0b', '#6b7280'];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Theatre Reports"
        helpContent="Operational theatre analytics built from live surgery case data. Use this to review case volume, theatre load, completion rate, and active workflow distribution."
        actions={
          <div className="flex gap-2">
            {[7, 30, 90].map((days) => (
              <Button key={days} variant={rangeDays === days ? 'default' : 'outline'} size="sm" onClick={() => setRangeDays(days)}>
                {days}d
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Cases', value: totals.total, icon: Scissors },
          { label: 'Completed', value: totals.completed, icon: TrendingUp },
          { label: 'Urgent / Emergency', value: totals.urgent, icon: Clock },
          { label: 'Booked Hours', value: totals.scheduledHours, icon: BarChart3 },
        ].map((card) => (
          <div key={card.label} className="relative">
            <TheatreMetricCard label={card.label} value={card.value} />
            <card.icon className="pointer-events-none absolute right-4 top-4 h-7 w-7 text-muted-foreground/60" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Case Volume by Procedure</CardTitle></CardHeader>
          <CardContent className="h-80">
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading report data...</div>
            ) : procedureVolume.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No procedure volume available for this range.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={procedureVolume} layout="vertical" margin={{ left: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={160} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Workflow Status Mix</CardTitle></CardHeader>
          <CardContent className="h-80">
            {loading ? (
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
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Theatre Load</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {theatreLoad.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">No theatre load data available for this range.</div>
            ) : theatreLoad.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.count} case{item.count === 1 ? '' : 's'}</p>
                </div>
                <Badge variant="info" size="sm" className="w-fit">{item.hours}h booked</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Operational Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Completion rate</span><Badge variant={totals.completionRate >= 70 ? 'success' : 'warning'} size="sm" className="w-fit">{totals.completionRate}%</Badge></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Active workflow cases</span><Badge variant="outline" size="sm" className="w-fit">{totals.active}</Badge></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Report window</span><Badge variant="outline" size="sm" className="w-fit">Last {rangeDays} days</Badge></div>
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
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              These analytics use live surgery case data already in the theatre module. Exact turnaround and on-time-start metrics still need dedicated backend timestamps before they can be calculated reliably.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
