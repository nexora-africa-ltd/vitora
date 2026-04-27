'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  ClipboardList,
  Activity,
  BarChart3,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Scissors,
  Settings,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PermissionGate } from '@/components/shared/permission-gate';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseList } from '@/lib/types/theatre';
import {
  TheatreCasePriorityBadge,
  TheatreCaseStatusBadge,
  TheatreMetricCard,
} from '@/components/theatre/theatre-display';

export default function TheatrePage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [todayCases, setTodayCases] = useState<SurgeryCaseList[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0] ?? '';

  const fetchToday = useCallback(async () => {
    try {
      setLoading(true);
      const cases = await theatreApi.getDailyList(today);
      setTodayCases(cases);
    } catch {
      // silently handle — page will show empty state
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const inProgress = todayCases.filter(c => ['IN_THEATRE', 'IN_SURGERY'].includes(c.status));
  const inPACU = todayCases.filter(c => c.status === 'IN_PACU');
  const completed = todayCases.filter(c => c.status === 'DISCHARGED');
  const scheduled = todayCases.filter(c => ['SCHEDULED', 'PRE_OP'].includes(c.status));

  const stats = [
    { label: 'Scheduled', value: scheduled.length, icon: Clock, color: 'text-blue-600' },
    { label: 'In Progress', value: inProgress.length, icon: Activity, color: 'text-red-600' },
    { label: 'In PACU', value: inPACU.length, icon: Timer, color: 'text-purple-600' },
    { label: 'Completed', value: completed.length, icon: CheckCircle2, color: 'text-green-600' },
  ];

  return (
    <PullToRefresh onRefresh={() => { refresh(); return fetchToday(); }} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Theatre"
          helpContent="Live view of today's surgical cases. Track cases from scheduling through recovery."
          actions={
            <div className="flex gap-2">
              <PermissionGate action="theatre.manage_settings">
                <Button variant="outline" asChild>
                  <Link href="/theatre/settings">
                    <Settings className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Setup</span>
                  </Link>
                </Button>
              </PermissionGate>
              <Button variant="outline" asChild>
                <Link href="/theatre/schedule">
                  <Calendar className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Schedule</span>
                </Link>
              </Button>
              <Button asChild>
                <Link href="/theatre/cases/new">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">New Case</span>
                </Link>
              </Button>
            </div>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {stats.map(s => (
            <div key={s.label} className="relative">
              <TheatreMetricCard label={s.label} value={s.value} />
              <s.icon className={`pointer-events-none absolute right-4 top-4 h-8 w-8 ${s.color} opacity-80`} />
            </div>
          ))}
        </div>

        {/* Live Theatre Board */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Today&apos;s Theatre List
              <HelpPopover content="Live board of today's scheduled surgeries. Shows case status progression from scheduling through recovery. Click a case row to open its workspace." />
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/theatre/schedule`}>View Full Schedule</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading today&apos;s cases...</div>
            ) : todayCases.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No surgeries scheduled for today.</p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/theatre/cases/new">Book a Surgery</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[600px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Time</th>
                      <th className="px-4 py-2 font-medium">Case</th>
                      <th className="px-4 py-2 font-medium">Patient</th>
                      <th className="px-4 py-2 font-medium">Procedure</th>
                      <th className="px-4 py-2 font-medium">Theatre</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayCases.map(c => (
                      <tr
                        key={c.id}
                        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/theatre/cases/${c.case_number}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{c.scheduled_start_time?.slice(0, 5)}</td>
                        <td className="px-4 py-3 font-medium">{c.case_number}</td>
                        <td className="px-4 py-3">
                          <div>{c.patient_name}</div>
                          <div className="text-xs text-muted-foreground">{c.patient_mrn}</div>
                        </td>
                        <td className="px-4 py-3">{c.primary_procedure_name}</td>
                        <td className="px-4 py-3">{c.theatre_name}</td>
                        <td className="px-4 py-3">
                          <TheatreCaseStatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3">
                          <TheatreCasePriorityBadge priority={c.priority} hideElective />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Button variant="outline" className="h-auto py-3 justify-start" asChild>
            <Link href="/theatre/cases">
              <ClipboardList className="h-5 w-5 mr-3 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium">All Cases</div>
                <div className="text-xs text-muted-foreground">Browse surgery cases</div>
              </div>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto py-3 justify-start" asChild>
            <Link href="/theatre/checklists">
              <CheckCircle2 className="h-5 w-5 mr-3 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium">WHO Checklists</div>
                <div className="text-xs text-muted-foreground">Safety checklists</div>
              </div>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto py-3 justify-start" asChild>
            <Link href="/theatre/reports">
              <BarChart3 className="h-5 w-5 mr-3 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium">Reports</div>
                <div className="text-xs text-muted-foreground">Utilization analytics</div>
              </div>
            </Link>
          </Button>
          <PermissionGate action="theatre.manage_settings">
            <Button variant="outline" className="h-auto py-3 justify-start" asChild>
              <Link href="/theatre/settings">
                <Settings className="h-5 w-5 mr-3 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-medium">Theatre Setup</div>
                  <div className="text-xs text-muted-foreground">Configure ORs, hours, and capabilities</div>
                </div>
              </Link>
            </Button>
          </PermissionGate>
        </div>
      </div>
    </PullToRefresh>
  );
}
