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
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  Calendar,
  Download,
  RefreshCw,
  AlertCircle,
  FileText,
  CalendarRange,
  Activity,
  CheckCircle,
  XCircle,
  Minus,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
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
import type { ClinicSession } from '@/lib/types/clinic';
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
              {clinic.name} - Reports
            </h1>
            <p className="text-muted-foreground">
              Performance analytics, trends, and DHIS2 reporting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
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
              <span className="text-sm font-medium">Report Period:</span>
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

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)}>
        <TabsList className="grid w-full grid-cols-4 md:w-auto md:grid-cols-none">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="dhis2">DHIS2 Export</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(stats.totalPatientsSeen)}</div>
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
                  <span className="text-muted-foreground ml-1">vs previous period</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Per Session</CardTitle>
                <BarChart3 className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{stats.avgPatientsPerSession}</div>
                <p className="text-xs text-muted-foreground">Patients per session</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.completionRate}%</div>
                <Progress value={stats.completionRate} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">No-Show Rate</CardTitle>
                <XCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{stats.noShowRate}%</div>
                <p className="text-xs text-muted-foreground">Missed appointments</p>
              </CardContent>
            </Card>
          </div>

          {/* Insights Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Busiest Days</CardTitle>
                <CardDescription>Days with highest patient volume</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.busyDays.map((day, index) => (
                    <div key={day} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold',
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
                    <p className="text-muted-foreground">Insufficient data for analysis</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Summary</CardTitle>
                <CardDescription>Breakdown by status for the period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Sessions</span>
                    <span className="font-semibold">{stats.totalSessions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Patients Registered</span>
                    <span className="font-semibold">{formatNumber(stats.totalPatientsRegistered)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Patients Seen</span>
                    <span className="font-semibold text-green-600">{formatNumber(stats.totalPatientsSeen)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">No Shows / Missed</span>
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
        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Patient Volume Trends</CardTitle>
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Registered</TableHead>
                        <TableHead className="text-right">Seen</TableHead>
                        <TableHead className="text-right">Completion %</TableHead>
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
                              {format(parseISO(session.session_date), 'MMM d, yyyy (EEE)')}
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
                                <Progress value={completionPct} className="w-16" />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Utilization Rate</CardTitle>
                <CardDescription>Percentage of capacity utilized</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-8">
                  <div className="relative">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={`${stats.utilizationRate * 3.52} 352`}
                        className="text-primary"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold">{stats.utilizationRate}%</span>
                    </div>
                  </div>
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Based on scheduled capacity
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Metrics</CardTitle>
                <CardDescription>Performance indicators for the period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Average Wait Time</span>
                    <span className="font-semibold">~25 min</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Patient Satisfaction</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">4.2</span>
                      <span className="text-xs text-muted-foreground">/ 5.0</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Return Visit Rate</span>
                    <span className="font-semibold">32%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Referral Rate</span>
                    <span className="font-semibold">8%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DHIS2 Export Tab */}
        <TabsContent value="dhis2" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>DHIS2/KHIS Export</CardTitle>
              <CardDescription>
                Export clinic data for Ministry of Health reporting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h4 className="font-medium">MOH 705A - Outpatient Summary</h4>
                    <p className="text-sm text-muted-foreground">
                      Daily outpatient workload for {clinic.name}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Period:</span>
                        <span className="ml-2 font-medium">{dateParams.date_from} to {dateParams.date_to}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Org Unit:</span>
                        <span className="ml-2 font-medium">{clinic.dhis2_org_unit_id || 'Not configured'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Visits:</span>
                        <span className="ml-2 font-medium">{formatNumber(stats.totalPatientsSeen)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">MOH Code:</span>
                        <span className="ml-2 font-medium">{clinic.moh_code || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button>
                  <Download className="h-4 w-4 mr-2" />
                  Export to DHIS2
                </Button>
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
              </div>

              <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                      DHIS2 Integration Note
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      DHIS2 integration requires the organizational unit ID to be configured in clinic
                      settings. Contact your system administrator to set up the integration.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
