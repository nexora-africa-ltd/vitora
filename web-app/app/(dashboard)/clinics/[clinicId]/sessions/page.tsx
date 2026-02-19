/**
 * Clinic Sessions History Page
 *
 * Displays the history of clinic sessions with statistics,
 * patient counts, and performance metrics.
 *
 * Route: /clinics/[clinicId]/sessions
 */
'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Users,
  CheckCircle,
  Download,
  BarChart3,
  AlertCircle,
  CalendarRange,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useClinic, useClinicSessions } from '@/lib/hooks/use-clinics';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import type { ClinicSession, ClinicSessionStatus } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

type DateRange = 'week' | 'month' | 'quarter' | 'year' | 'custom';

const STATUS_COLORS: Record<ClinicSessionStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  OPEN: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '--';
  return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
}

function formatDate(dateString: string): string {
  return format(parseISO(dateString), 'EEEE, MMMM d, yyyy');
}

function formatTime(dateString: string | null): string {
  if (!dateString) return '--';
  return format(parseISO(dateString), 'h:mm a');
}

function calculateSessionDuration(openedAt: string | null, closedAt: string | null): string {
  if (!openedAt || !closedAt) return '--';
  const duration = (parseISO(closedAt).getTime() - parseISO(openedAt).getTime()) / (1000 * 60);
  const hours = Math.floor(duration / 60);
  const minutes = Math.round(duration % 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function ClinicSessionsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = Number(params.clinicId);
  const { refresh, isRefreshing } = usePageRefresh();

  // UI State
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);

  // Calculate date range
  const dateParams = useMemo(() => {
    const today = new Date();
    let from: string;
    let to: string = format(today, 'yyyy-MM-dd');

    switch (dateRange) {
      case 'week':
        from = format(subDays(today, 7), 'yyyy-MM-dd');
        break;
      case 'month':
        from = format(startOfMonth(today), 'yyyy-MM-dd');
        to = format(endOfMonth(today), 'yyyy-MM-dd');
        break;
      case 'quarter':
        from = format(subDays(today, 90), 'yyyy-MM-dd');
        break;
      case 'year':
        from = format(subDays(today, 365), 'yyyy-MM-dd');
        break;
      case 'custom':
        from = customStartDate ? format(customStartDate, 'yyyy-MM-dd') : format(subDays(today, 30), 'yyyy-MM-dd');
        to = customEndDate ? format(customEndDate, 'yyyy-MM-dd') : format(today, 'yyyy-MM-dd');
        break;
      default:
        from = format(startOfMonth(today), 'yyyy-MM-dd');
    }

    return { date_from: from, date_to: to };
  }, [dateRange, customStartDate, customEndDate]);

  // Fetch data
  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: sessionsData, isLoading: sessionsLoading, refetch } = useClinicSessions(clinicId, dateParams);

  const sessions = useMemo(() => sessionsData?.results ?? [], [sessionsData]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalPatientsSeen: 0,
        avgPatientsPerSession: 0,
        avgWaitTime: 0,
        completionRate: 0,
      };
    }

    const totalPatientsSeen = sessions.reduce((sum, s) => sum + (s.patients_seen || 0), 0);
    const closedSessions = sessions.filter((s) => s.status === 'CLOSED');

    return {
      totalSessions: sessions.length,
      totalPatientsSeen,
      avgPatientsPerSession: closedSessions.length > 0
        ? Math.round(totalPatientsSeen / closedSessions.length)
        : 0,
      avgWaitTime: 0, // Would need additional data
      completionRate: sessions.length > 0
        ? Math.round((closedSessions.length / sessions.length) * 100)
        : 0,
    };
  }, [sessions]);

  if (clinicLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 sm:h-24" />
          ))}
        </div>
        <Skeleton className="h-64 sm:h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12">
        <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
        <h3 className="text-base sm:text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild size="sm">
          <Link href="/clinics">Back to Clinics</Link>
        </Button>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`${clinic.name} - Sessions`}
        helpContent="View historical session data, patient counts, and performance metrics for this clinic."
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        }
      />

      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />

      {/* Date Range Filter */}
      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm font-medium">Date Range:</span>
            </div>

            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">Last 90 Days</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {dateRange === 'custom' && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-[140px] justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      <span className="truncate">
                        {customStartDate ? format(customStartDate, 'MMM d, yy') : 'Start'}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={customStartDate}
                      onSelect={setCustomStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <span className="text-muted-foreground text-center">to</span>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-[140px] justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      <span className="truncate">
                        {customEndDate ? format(customEndDate, 'MMM d, yy') : 'End'}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={customEndDate}
                      onSelect={setCustomEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats.totalSessions}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">In period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Patients</CardTitle>
            <Users className="h-4 w-4 text-blue-500 hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.totalPatientsSeen}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">Total seen</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Avg/Session</CardTitle>
            <BarChart3 className="h-4 w-4 text-green-500 hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.avgPatientsPerSession}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">Patients</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Completion</CardTitle>
            <CheckCircle className="h-4 w-4 text-purple-500 hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-purple-600">{stats.completionRate}%</div>
            <p className="text-xs text-muted-foreground hidden sm:block">Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Session History</CardTitle>
            <HelpPopover content="Detailed view of all clinic sessions in the selected period including patient counts and timing." />
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <ResponsiveTable<ClinicSession>
            data={sessions}
            keyExtractor={(session) => session.id}
            isLoading={sessionsLoading}
            emptyMessage="No sessions recorded for the selected date range."
            columns={[
              {
                key: 'session_date',
                header: 'Date',
                cell: (session) => (
                  <span className="font-medium">{formatDate(session.session_date)}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (session) => (
                  <Badge className={cn('font-normal shrink-0 w-fit text-xs', STATUS_COLORS[session.status])}>
                    {session.status_display}
                  </Badge>
                ),
              },
              {
                key: 'opened_by_name',
                header: 'Opened By',
                cell: (session) => session.opened_by_name || '--',
                hideOnMobile: true,
              },
              {
                key: 'opened_at',
                header: 'Opened',
                cell: (session) => formatTime(session.opened_at),
                hideOnMobile: true,
              },
              {
                key: 'closed_at',
                header: 'Closed',
                cell: (session) => formatTime(session.closed_at),
                hideOnMobile: true,
              },
              {
                key: 'duration',
                header: 'Duration',
                cell: (session) => calculateSessionDuration(session.opened_at, session.closed_at),
                hideOnMobile: true,
              },
              {
                key: 'patients_registered',
                header: 'Reg',
                cell: (session) => <span className="font-medium">{session.patients_registered}</span>,
                className: 'text-right',
              },
              {
                key: 'patients_seen',
                header: 'Seen',
                cell: (session) => (
                  <span className="font-medium text-green-600">{session.patients_seen}</span>
                ),
                className: 'text-right',
              },
              {
                key: 'patients_waiting',
                header: 'Wait',
                cell: (session) => (
                  session.patients_waiting > 0 ? (
                    <span className="text-orange-600 font-medium">{session.patients_waiting}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )
                ),
                className: 'text-right',
              },
            ]}
            mobileCard={(session) => (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">
                    {formatDate(session.session_date)}
                  </span>
                  <Badge className={cn('font-normal shrink-0 text-xs', STATUS_COLORS[session.status])}>
                    {session.status_display}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Reg:</span>{' '}
                    <span className="font-medium">{session.patients_registered}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Seen:</span>{' '}
                    <span className="font-medium text-green-600">{session.patients_seen}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Wait:</span>{' '}
                    {session.patients_waiting > 0 ? (
                      <span className="font-medium text-orange-600">{session.patients_waiting}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </div>
                </div>
                {session.opened_at && (
                  <p className="text-xs text-muted-foreground">
                    {formatTime(session.opened_at)} - {formatTime(session.closed_at)} ({calculateSessionDuration(session.opened_at, session.closed_at)})
                  </p>
                )}
              </div>
            )}
          />
        </CardContent>
      </Card>
    </div>
    </PullToRefresh>
  );
}
