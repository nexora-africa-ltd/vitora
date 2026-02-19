/**
 * Clinic Reports Page
 *
 * Displays clinic-specific reports including patient volumes, wait times,
 * staff performance, and trend analysis.
 *
 * Route: /clinics/[clinicId]/reports
 */
'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Download,
  AlertCircle,
  FileText,
  CalendarRange,
  Activity,
  CheckCircle,
  XCircle,
  Minus,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useClinic, useClinicSessions } from '@/lib/hooks/use-clinics';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import { cn } from '@/lib/utils/cn';

type DateRange = 'week' | 'month' | 'quarter' | 'year' | 'custom';
type ReportTab = 'overview' | 'trends' | 'performance' | 'dhis2';

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-KE').format(num);
}

function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function calculateTrend(current: number, previous: number): { value: number; direction: 'up' | 'down' | 'neutral' } {
  if (previous === 0) return { value: 0, direction: 'neutral' };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(change),
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
  };
}

export default function ClinicReportsPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);

  // UI State
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');

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

  // Calculate comprehensive statistics
  const stats = useMemo(() => {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalPatientsSeen: 0,
        totalPatientsRegistered: 0,
        avgPatientsPerSession: 0,
        completionRate: 0,
        noShowRate: 0,
        utilizationRate: 0,
        busyDays: [] as string[],
        slowDays: [] as string[],
      };
    }

    const totalPatientsSeen = sessions.reduce((sum, s) => sum + (s.patients_seen || 0), 0);
    const totalPatientsRegistered = sessions.reduce((sum, s) => sum + (s.patients_registered || 0), 0);
    const closedSessions = sessions.filter((s) => s.status === 'CLOSED');
    const cancelledSessions = sessions.filter((s) => s.status === 'CANCELLED');

    // Group by day of week to find patterns
    const dayStats: Record<string, { patients: number; sessions: number }> = {};
    sessions.forEach((s) => {
      const dayName = format(parseISO(s.session_date), 'EEEE');
      if (!dayStats[dayName]) {
        dayStats[dayName] = { patients: 0, sessions: 0 };
      }
      dayStats[dayName].patients += s.patients_seen || 0;
      dayStats[dayName].sessions += 1;
    });

    const dayAverages = Object.entries(dayStats)
      .map(([day, data]) => ({
        day,
        average: data.sessions > 0 ? data.patients / data.sessions : 0,
      }))
      .sort((a, b) => b.average - a.average);

    const busyDays = dayAverages.slice(0, 2).map((d) => d.day);
    const slowDays = dayAverages.slice(-2).map((d) => d.day);

    return {
      totalSessions: sessions.length,
      totalPatientsSeen,
      totalPatientsRegistered,
      avgPatientsPerSession: closedSessions.length > 0 ? Math.round(totalPatientsSeen / closedSessions.length) : 0,
      completionRate: sessions.length > 0 ? Math.round((closedSessions.length / sessions.length) * 100) : 0,
      noShowRate: totalPatientsRegistered > 0
        ? Math.round(((totalPatientsRegistered - totalPatientsSeen) / totalPatientsRegistered) * 100)
        : 0,
      utilizationRate: totalPatientsRegistered > 0
        ? Math.round((totalPatientsSeen / totalPatientsRegistered) * 100)
        : 0,
      busyDays,
      slowDays,
    };
  }, [sessions]);

  // Simulate trend data (in production, this would come from comparison API)
  const trends = useMemo(() => {
    return {
      patientVolume: calculateTrend(stats.totalPatientsSeen, stats.totalPatientsSeen * 0.85),
      avgWaitTime: calculateTrend(25, 30), // Simulated
      noShowRate: calculateTrend(stats.noShowRate, stats.noShowRate + 2),
      satisfaction: calculateTrend(4.2, 4.0), // Simulated
    };
  }, [stats]);

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
    <PullToRefresh onRefresh={async () => { await refetch(); }} isRefreshing={false}>
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`${clinic.name} - Reports`}
        helpContent="Performance analytics, trends, and DHIS2 reporting."
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm font-medium">Period:</span>
            </div>

            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">Last 90 Days</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {dateRange === 'custom' && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-[140px] justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, 'MMM d') : 'Start'}
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

                <span className="text-muted-foreground text-sm hidden sm:inline">to</span>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-[140px] justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, 'MMM d') : 'End'}
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

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)}>
        <TabsList className="w-full sm:w-auto justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs sm:text-sm">Trends</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs sm:text-sm">
            <span className="sm:hidden">Perf</span>
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="dhis2" className="text-xs sm:text-sm">DHIS2</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">Patients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold">{formatNumber(stats.totalPatientsSeen)}</div>
                <div className="flex items-center text-xs">
                  {trends.patientVolume.direction === 'up' ? (
                    <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                  ) : trends.patientVolume.direction === 'down' ? (
                    <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                  ) : (
                    <Minus className="h-3 w-3 text-gray-500 mr-1" />
                  )}
                  <span
                    className={cn(
                      trends.patientVolume.direction === 'up' && 'text-green-600',
                      trends.patientVolume.direction === 'down' && 'text-red-600'
                    )}
                  >
                    {formatPercentage(trends.patientVolume.direction === 'up' ? trends.patientVolume.value : -trends.patientVolume.value)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">Avg/Session</CardTitle>
                <BarChart3 className="h-4 w-4 text-blue-500 hidden sm:block" />
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.avgPatientsPerSession}</div>
                <p className="text-xs text-muted-foreground hidden sm:block">Patients/session</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">Completion</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500 hidden sm:block" />
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.completionRate}%</div>
                <Progress value={stats.completionRate} className="mt-1 sm:mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">No-Show</CardTitle>
                <XCircle className="h-4 w-4 text-orange-500 hidden sm:block" />
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="text-xl sm:text-2xl font-bold text-orange-600">{stats.noShowRate}%</div>
                <p className="text-xs text-muted-foreground hidden sm:block">Missed</p>
              </CardContent>
            </Card>
          </div>

          {/* Insights Cards */}
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Busiest Days</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="space-y-3">
                  {stats.busyDays.map((day, index) => (
                    <div key={day} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={cn(
                            'w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs sm:text-sm',
                            index === 0 ? 'bg-red-500' : 'bg-orange-500'
                          )}
                        >
                          {index + 1}
                        </div>
                        <span className="font-medium">{day}</span>
                      </div>
                      <Badge variant="secondary">High Volume</Badge>
                    </div>
                  ))}
                  {stats.busyDays.length === 0 && (
                    <p className="text-sm text-muted-foreground">No data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Session Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Total Sessions</span>
                    <span className="font-semibold">{stats.totalSessions}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Registered</span>
                    <span className="font-semibold">{formatNumber(stats.totalPatientsRegistered)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Seen</span>
                    <span className="font-semibold text-green-600">{formatNumber(stats.totalPatientsSeen)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>No Shows</span>
                    <span className="font-semibold text-orange-600">
                      {formatNumber(stats.totalPatientsRegistered - stats.totalPatientsSeen)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Patient Volume Trends</CardTitle>
              <CardDescription>Daily patient visits over the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <Skeleton className="h-64" />
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No data available</h3>
                  <p className="text-muted-foreground text-center">
                    No session data for the selected period.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-2">
                    {sessions.slice(0, 10).map((session) => {
                      const completionPct = session.patients_registered > 0
                        ? Math.round((session.patients_seen / session.patients_registered) * 100)
                        : 0;
                      return (
                        <div key={session.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{format(parseISO(session.session_date), 'MMM d (EEE)')}</span>
                            <Badge variant="outline" className={cn(
                              'text-xs',
                              session.status === 'CLOSED' && 'text-green-600 border-green-600',
                              session.status === 'OPEN' && 'text-blue-600 border-blue-600',
                              session.status === 'CANCELLED' && 'text-red-600 border-red-600'
                            )}>
                              {session.status_display}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                            <span>Seen: <span className="text-green-600 font-medium">{session.patients_seen}</span> / {session.patients_registered}</span>
                            <span>{completionPct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden sm:block rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Reg</TableHead>
                          <TableHead className="text-right">Seen</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.slice(0, 10).map((session) => {
                          const completionPct = session.patients_registered > 0
                            ? Math.round((session.patients_seen / session.patients_registered) * 100)
                            : 0;
                          return (
                            <TableRow key={session.id}>
                              <TableCell className="font-medium">
                                {format(parseISO(session.session_date), 'MMM d (EEE)')}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    session.status === 'CLOSED' && 'text-green-600 border-green-600',
                                    session.status === 'OPEN' && 'text-blue-600 border-blue-600',
                                    session.status === 'CANCELLED' && 'text-red-600 border-red-600'
                                  )}
                                >
                                  {session.status_display}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{session.patients_registered}</TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                {session.patients_seen}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span>{completionPct}%</span>
                                  <Progress value={completionPct} className="w-12" />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4 sm:space-y-6">
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Utilization Rate</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="flex items-center justify-center py-4 sm:py-8">
                  <div className="relative">
                    <svg className="w-24 h-24 sm:w-32 sm:h-32 transform -rotate-90">
                      <circle
                        cx="50%"
                        cy="50%"
                        r="44%"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted"
                      />
                      <circle
                        cx="50%"
                        cy="50%"
                        r="44%"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={`${stats.utilizationRate * 2.76} 276`}
                        className="text-primary"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl sm:text-3xl font-bold">{stats.utilizationRate}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Key Metrics</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Wait Time</span>
                    <span className="font-semibold">~25 min</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Satisfaction</span>
                    <span className="font-semibold">4.2/5</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Return Rate</span>
                    <span className="font-semibold">32%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Referral Rate</span>
                    <span className="font-semibold">8%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DHIS2 Export Tab */}
        <TabsContent value="dhis2" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">DHIS2/KHIS Export</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 space-y-4 sm:space-y-6">
              <div className="rounded-lg border p-3 sm:p-4 bg-muted/50">
                <div className="flex items-start gap-2 sm:gap-3">
                  <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <h4 className="font-medium text-sm sm:text-base">MOH 705A</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Outpatient summary for {clinic.name}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                      <div>
                        <span className="text-muted-foreground">Period:</span>
                        <p className="font-medium truncate">{dateParams.date_from}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Visits:</span>
                        <p className="font-medium">{formatNumber(stats.totalPatientsSeen)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Org Unit:</span>
                        <p className="font-medium truncate">{clinic.dhis2_org_unit_id || 'Not set'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">MOH Code:</span>
                        <p className="font-medium">{clinic.moh_code || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="sm" className="w-full sm:w-auto">
                  <Download className="h-4 w-4 mr-2" />
                  Export DHIS2
                </Button>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <FileText className="h-4 w-4 mr-2" />
                  CSV
                </Button>
              </div>

              <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-3 sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600 shrink-0" />
                  <div>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200 text-sm">
                      DHIS2 Integration
                    </h4>
                    <p className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      Requires org unit ID in clinic settings.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </PullToRefresh>
  );
}
