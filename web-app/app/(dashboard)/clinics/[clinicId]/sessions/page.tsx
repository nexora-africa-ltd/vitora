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
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Filter,
  Download,
  Eye,
  BarChart3,
  AlertCircle,
  RefreshCw,
  CalendarRange,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const clinicId = Number(params.clinicId);

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
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild>
          <Link href="/clinics">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clinics
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/clinics/${clinicId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {clinic.name} - Session History
            </h1>
            <p className="text-muted-foreground">
              View historical session data, patient counts, and performance metrics
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />

      {/* Date Range Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Date Range:</span>
            </div>

            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[160px]">
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
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, 'MMM d, yyyy') : 'Start Date'}
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

                <span className="text-muted-foreground">to</span>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, 'MMM d, yyyy') : 'End Date'}
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
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions}</div>
            <p className="text-xs text-muted-foreground">In selected period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patients Seen</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.totalPatientsSeen}</div>
            <p className="text-xs text-muted-foreground">Total consultations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Per Session</CardTitle>
            <BarChart3 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.avgPatientsPerSession}</div>
            <p className="text-xs text-muted-foreground">Patients per session</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.completionRate}%</div>
            <p className="text-xs text-muted-foreground">Sessions completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Session History</CardTitle>
          <CardDescription>
            Detailed view of all clinic sessions in the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <Skeleton className="h-96" />
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sessions found</h3>
              <p className="text-muted-foreground text-center">
                No sessions recorded for the selected date range.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Opened By</TableHead>
                    <TableHead>Opened At</TableHead>
                    <TableHead>Closed At</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Registered</TableHead>
                    <TableHead className="text-right">Seen</TableHead>
                    <TableHead className="text-right">Waiting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{formatDate(session.session_date)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('font-normal', STATUS_COLORS[session.status])}>
                          {session.status_display}
                        </Badge>
                      </TableCell>
                      <TableCell>{session.opened_by_name || '--'}</TableCell>
                      <TableCell>{formatTime(session.opened_at)}</TableCell>
                      <TableCell>{formatTime(session.closed_at)}</TableCell>
                      <TableCell>
                        {calculateSessionDuration(session.opened_at, session.closed_at)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {session.patients_registered}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {session.patients_seen}
                      </TableCell>
                      <TableCell className="text-right">
                        {session.patients_waiting > 0 ? (
                          <span className="text-orange-600 font-medium">
                            {session.patients_waiting}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
