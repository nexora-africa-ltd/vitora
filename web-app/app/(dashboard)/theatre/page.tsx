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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseList } from '@/lib/types/theatre';
import { CASE_STATUSES } from '@/lib/schemas/theatre.schema';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PRE_OP: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  IN_THEATRE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  IN_SURGERY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  IN_PACU: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  DISCHARGED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  POSTPONED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  ELECTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  URGENT: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  EMERGENCY: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export default function TheatrePage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [todayCases, setTodayCases] = useState<SurgeryCaseList[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

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
            <Card key={s.label} className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold">{s.value}</p>
                  </div>
                  <s.icon className={`h-8 w-8 ${s.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Live Theatre Board */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Today&apos;s Theatre List
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
                          <Badge className={`${STATUS_COLORS[c.status] || ''} text-xs`}>
                            {c.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {c.priority !== 'ELECTIVE' && (
                            <Badge className={`${PRIORITY_COLORS[c.priority] || ''} text-xs`}>
                              {c.priority === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
                              {c.priority}
                            </Badge>
                          )}
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
        </div>
      </div>
    </PullToRefresh>
  );
}
