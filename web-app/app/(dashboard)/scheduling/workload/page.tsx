'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  Users,
  CheckCircle,
  Activity,
  CalendarDays,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useSchedulingSocket } from '@/lib/hooks/use-websocket';
import { shiftsApi } from '@/lib/api/scheduling';
import type { StaffWorkload } from '@/lib/types/scheduling';

export default function StaffWorkloadPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useSchedulingSocket(facility?.id ?? null);

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);

  const { data: workload, isLoading } = useQuery({
    queryKey: ['scheduling-staff-workload', fromDate, toDate],
    queryFn: () =>
      shiftsApi.staffWorkload({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
  });

  const staffList = workload || [];

  // Summary stats
  const summary = useMemo(() => {
    const totalStaff = staffList.length;
    const totalShifts = staffList.reduce((sum, s) => sum + s.shift_count, 0);
    const totalHours = staffList.reduce((sum, s) => sum + s.total_hours, 0);
    const activeNow = staffList.reduce((sum, s) => sum + s.active_shifts, 0);
    const totalAppointments = staffList.reduce((sum, s) => sum + s.appointment_count, 0);
    const avgHoursPerStaff = totalStaff > 0 ? totalHours / totalStaff : 0;
    const maxHours = Math.max(...staffList.map(s => s.total_hours), 1);
    return { totalStaff, totalShifts, totalHours, activeNow, totalAppointments, avgHoursPerStaff, maxHours };
  }, [staffList]);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Staff Workload"
          helpContent="Analyse staff workload distribution across a date range. Track shift counts, hours worked, and appointment volumes to identify overworked or underutilised staff."
        />

        {/* Date Range */}
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <div className="w-[125px] sm:w-[140px] shrink-0">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">to</span>
          <div className="w-[125px] sm:w-[140px] shrink-0">
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatsCard
            title="Staff Members"
            value={summary.totalStaff}
            icon={Users}
            meta="With scheduling resources"
          />
          <StatsCard
            title="Total Shifts"
            value={summary.totalShifts}
            icon={CheckCircle}
            meta={`${summary.totalHours.toFixed(0)} hours total`}
          />
          <StatsCard
            title="Avg Hours / Staff"
            value={summary.avgHoursPerStaff.toFixed(1)}
            icon={BarChart3}
            variant={summary.avgHoursPerStaff > 50 ? 'warning' : 'default'}
            meta="In selected period"
          />
          <StatsCard
            title="Active Now"
            value={summary.activeNow}
            icon={Activity}
            variant={summary.activeNow > 0 ? 'success' : 'default'}
            meta="Currently on shift"
          />
        </div>

        {/* Workload Table */}
        <ResponsiveTable
          data={staffList}
          keyExtractor={(s) => s.resource_id}
          isLoading={isLoading}
          emptyMessage="No staff workload data for the selected period"
          defaultSortColumn="total_hours"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'resource_name',
              header: 'Staff Member',
              sortable: true,
              cell: (s) => (
                <div className="flex items-center gap-2">
                  <div className="shrink-0 rounded-full bg-primary/10 border border-primary/20 w-7 h-7 flex items-center justify-center">
                    <span className="text-xs font-medium text-primary">
                      {s.resource_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{s.resource_name}</p>
                    <p className="text-xs text-muted-foreground">{s.resource_code}</p>
                  </div>
                </div>
              ),
            },
            {
              key: 'shift_count',
              header: 'Shifts',
              sortable: true,
              sortType: 'number',
              cell: (s) => (
                <span className="font-medium tabular-nums">{s.shift_count}</span>
              ),
            },
            {
              key: 'total_hours',
              header: 'Hours',
              sortable: true,
              sortType: 'number',
              cell: (s) => (
                <div className="flex items-center gap-2 min-w-[120px]">
                  <Progress
                    value={summary.maxHours > 0 ? (s.total_hours / summary.maxHours) * 100 : 0}
                    className="h-1.5 flex-1"
                  />
                  <span className="text-sm font-medium tabular-nums w-12 text-right">{s.total_hours.toFixed(1)}h</span>
                </div>
              ),
            },
            {
              key: 'appointment_count',
              header: 'Appointments',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (s) => (
                <span className="tabular-nums">{s.appointment_count}</span>
              ),
            },
            {
              key: 'active_shifts',
              header: 'Status',
              sortable: true,
              sortType: 'number',
              cell: (s) =>
                s.active_shifts > 0 ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 shrink-0 w-fit" variant="secondary">
                    On Duty ({s.active_shifts})
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Off duty</span>
                ),
            },
            {
              key: 'completed_shifts',
              header: 'Completed',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (s) => (
                <span className="tabular-nums text-muted-foreground">{s.completed_shifts}</span>
              ),
            },
          ]}
          mobileCard={(s: StaffWorkload) => (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="shrink-0 rounded-full bg-primary/10 border border-primary/20 w-8 h-8 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {s.resource_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{s.resource_name}</p>
                    <p className="text-xs text-muted-foreground">{s.resource_code}</p>
                  </div>
                </div>
                {s.active_shifts > 0 ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs shrink-0" variant="secondary">
                    On Duty
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Off duty</span>
                )}
              </div>
              {/* Hours bar */}
              <div className="flex items-center gap-2">
                <Progress
                  value={summary.maxHours > 0 ? (s.total_hours / summary.maxHours) * 100 : 0}
                  className="h-2 flex-1"
                />
                <span className="text-xs font-medium tabular-nums">{s.total_hours.toFixed(1)}h</span>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div>
                  <p className="text-lg font-bold tabular-nums">{s.shift_count}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Shifts</p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{s.appointment_count}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Appts</p>
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{s.completed_shifts}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Done</p>
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </PullToRefresh>
  );
}
