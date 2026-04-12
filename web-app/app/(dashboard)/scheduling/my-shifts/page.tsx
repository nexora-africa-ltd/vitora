'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Timer,
  TrendingUp,
  CalendarDays,
  LogIn,
  LogOut,
  Hourglass,
  BarChart3,
  Coffee,
  Play,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { attendanceApi } from '@/lib/api/scheduling';
import { getApiErrorMessage } from '@/lib/api/client';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { ShiftListItem, AttendanceStats } from '@/lib/types/scheduling';

// =============================================================================
// Helpers
// =============================================================================

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h ?? '0', 10);
  const min = m ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ON_BREAK: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  COMPLETED: 'bg-slate-100 text-slate-700 dark:bg-slate-800/30 dark:text-slate-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// =============================================================================
// Stats Cards
// =============================================================================

function StatsCards({ stats, isLoading }: { stats: AttendanceStats | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: 'On-Time Rate',
      value: `${stats.on_time_rate}%`,
      icon: CheckCircle2,
      color: stats.on_time_rate >= 90 ? 'text-green-600' : stats.on_time_rate >= 75 ? 'text-amber-600' : 'text-destructive',
      sub: `${stats.on_time_count} on-time, ${stats.late_count} late`,
    },
    {
      label: 'Total Hours',
      value: `${stats.total_hours}h`,
      icon: Clock,
      color: 'text-primary',
      sub: `${stats.total_shifts} shifts`,
    },
    {
      label: 'Overtime',
      value: `${stats.overtime_hours}h`,
      icon: Timer,
      color: stats.overtime_hours > 0 ? 'text-amber-600' : 'text-muted-foreground',
      sub: 'this period',
    },
    {
      label: 'Late Arrivals',
      value: String(stats.late_count),
      icon: AlertTriangle,
      color: stats.late_count > 0 ? 'text-destructive' : 'text-green-600',
      sub: `out of ${stats.total_shifts} shifts`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
            aria-hidden="true"
          />
          <CardContent className="relative p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </div>
              <card.icon className={`h-8 w-8 ${card.color} opacity-20`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// Page Component
// =============================================================================

export default function MyShiftsPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();

  // Date range (default last 30 days)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0]!;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]!);

  // Fetch today's shift
  const { data: todayData } = useQuery({
    queryKey: ['my-shift-today'],
    queryFn: () => attendanceApi.myToday(),
    refetchInterval: 60_000,
  });

  // Fetch history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['my-shift-history', fromDate, toDate],
    queryFn: () => attendanceApi.myHistory({ from_date: fromDate, to_date: toDate, page_size: 50 }),
  });

  // Fetch upcoming shifts (next 7 days, excluding today)
  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['my-shift-upcoming'],
    queryFn: () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const next7 = new Date();
      next7.setDate(next7.getDate() + 7);
      return attendanceApi.myHistory({ from_date: tomorrow.toISOString().split('T')[0]!, to_date: next7.toISOString().split('T')[0]!, page_size: 20 });
    },
  });

  // Clock in/out mutations
  const clockInMutation = useMutation({
    mutationFn: (shiftId: number) => attendanceApi.clockIn(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-history'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      toast.success('Clocked in successfully');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: (shiftId: number) => attendanceApi.clockOut(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-history'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      toast.success('Clocked out successfully');
    },
    onError: () => toast.error('Failed to clock out'),
  });

  const takeBreakMutation = useMutation({
    mutationFn: (shiftId: number) => attendanceApi.takeBreak(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      toast.success('Break started');
    },
    onError: () => toast.error('Failed to take break'),
  });

  const resumeMutation = useMutation({
    mutationFn: (shiftId: number) => attendanceApi.resume(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      toast.success('Resumed shift');
    },
    onError: () => toast.error('Failed to resume shift'),
  });

  const todayShift = todayData?.shifts?.[0];
  const todayStatus = todayData?.attendance_status ?? 'NO_SHIFT';
  const stats = historyData?.stats ?? null;
  const history = historyData?.results ?? [];
  const upcoming = upcomingData?.results ?? [];
  const isPending = clockInMutation.isPending || clockOutMutation.isPending || takeBreakMutation.isPending || resumeMutation.isPending;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="My Shifts"
          helpContent="View your shift schedule, clock in/out, and track your attendance history and trends."
          actions={
            todayShift && (todayStatus === 'UPCOMING' || todayStatus === 'SHOULD_CLOCK_IN') ? (
              <Button
                size="sm"
                onClick={() => clockInMutation.mutate(todayShift.id)}
                disabled={isPending}
              >
                <LogIn className="h-4 w-4 mr-1" />
                Clock In
              </Button>
            ) : todayShift && todayStatus === 'CLOCKED_IN' ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => takeBreakMutation.mutate(todayShift.id)}
                  disabled={isPending}
                >
                  <Coffee className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Take Break</span>
                  <span className="sm:hidden">Break</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clockOutMutation.mutate(todayShift.id)}
                  disabled={isPending}
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Clock Out</span>
                  <span className="sm:hidden">Out</span>
                </Button>
              </div>
            ) : todayShift && todayStatus === 'ON_BREAK' ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => resumeMutation.mutate(todayShift.id)}
                  disabled={isPending}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Resume
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clockOutMutation.mutate(todayShift.id)}
                  disabled={isPending}
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Clock Out</span>
                  <span className="sm:hidden">Out</span>
                </Button>
              </div>
            ) : null
          }
        />

        {/* Today's Shift Summary */}
        {todayShift ? (
          <Card className="border-primary/20">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    Today: {todayShift.shift_type_display ?? todayShift.shift_type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(todayShift.start_time)} – {formatTime(todayShift.end_time)}
                    {todayShift.department && ` · ${todayShift.department}`}
                  </p>
                </div>
              </div>
              <Badge className={STATUS_COLORS[todayShift.status] ?? ''}>
                {todayShift.status_display ?? todayShift.status}
              </Badge>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center text-muted-foreground text-sm">
              No shift scheduled for today
            </CardContent>
          </Card>
        )}

        {/* Attendance Stats */}
        <StatsCards stats={stats} isLoading={historyLoading} />

        {/* Upcoming Shifts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Hourglass className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Upcoming Shifts</CardTitle>
              <Badge variant="secondary" className="text-xs">{upcoming.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No upcoming shifts in the next 7 days
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 7).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-center min-w-[3.5rem]">
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.shift_date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short' })}
                        </p>
                        <p className="text-sm font-semibold">
                          {new Date(s.shift_date + 'T00:00:00').getDate()}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {s.shift_type_display ?? s.shift_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(s.start_time)} – {formatTime(s.end_time)}
                          {s.department && ` · ${s.department}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {s.duration_hours ? `${s.duration_hours}h` : '—'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance History */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Attendance History</CardTitle>
                <Badge variant="secondary" className="text-xs">{historyData?.count ?? 0}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground shrink-0">From</Label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-8 w-[130px] text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground shrink-0">To</Label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-8 w-[130px] text-xs"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              data={history}
              keyExtractor={(item) => item.id}
              columns={[
                {
                  key: 'shift_date',
                  header: 'Date',
                  sortable: true,
                  sortType: 'date' as const,
                  cell: (item: ShiftListItem) => (
                    <span className="text-sm font-medium">{formatDate(item.shift_date)}</span>
                  ),
                },
                {
                  key: 'shift_type',
                  header: 'Shift',
                  sortable: true,
                  cell: (item: ShiftListItem) => (
                    <span className="text-sm">{item.shift_type_display ?? item.shift_type}</span>
                  ),
                },
                {
                  key: 'start_time',
                  header: 'Time',
                  cell: (item: ShiftListItem) => (
                    <span className="text-sm text-muted-foreground">
                      {formatTime(item.start_time)} – {formatTime(item.end_time)}
                    </span>
                  ),
                },
                {
                  key: 'duration_hours',
                  header: 'Duration',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (item: ShiftListItem) => (
                    <span className="text-sm">{item.duration_hours ? `${item.duration_hours}h` : '—'}</span>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item: ShiftListItem) => (
                    <Badge className={`${STATUS_COLORS[item.status] ?? ''} shrink-0 w-fit`}>
                      {item.status_display ?? item.status}
                    </Badge>
                  ),
                },
              ]}
              mobileCard={(item: ShiftListItem) => (
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatDate(item.shift_date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.shift_type_display ?? item.shift_type} · {formatTime(item.start_time)} – {formatTime(item.end_time)}
                    </p>
                  </div>
                  <Badge className={`${STATUS_COLORS[item.status] ?? ''} shrink-0 w-fit self-start`}>
                    {item.status_display ?? item.status}
                  </Badge>
                </div>
              )}
              defaultSortColumn="shift_date"
              defaultSortDirection="desc"
            />
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}
