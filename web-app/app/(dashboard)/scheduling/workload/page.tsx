'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Users, CheckCircle, Activity } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const totalStaff = staffList.length;
  const totalShifts = staffList.reduce((sum, s) => sum + s.shift_count, 0);
  const totalHours = staffList.reduce((sum, s) => sum + s.total_hours, 0);
  const activeNow = staffList.reduce((sum, s) => sum + s.active_shifts, 0);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Staff Workload"
          helpContent="View staff workload aggregations including shift counts, total hours, and appointment volumes for a selected date range."
        />

        {/* Date Range */}
        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full sm:w-[160px]"
          />
          <span className="hidden sm:flex items-center text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full sm:w-[160px]"
          />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium">Staff</span>
              </div>
              <p className="text-2xl font-bold">{totalStaff}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Shifts</span>
              </div>
              <p className="text-2xl font-bold">{totalShifts}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Total Hours</span>
              </div>
              <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium">Active Now</span>
              </div>
              <p className="text-2xl font-bold">{activeNow}</p>
            </CardContent>
          </Card>
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
                <div>
                  <span className="font-medium">{s.resource_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{s.resource_code}</span>
                </div>
              ),
            },
            {
              key: 'shift_count',
              header: 'Shifts',
              sortable: true,
              sortType: 'number',
              cell: (s) => s.shift_count,
            },
            {
              key: 'total_hours',
              header: 'Hours',
              sortable: true,
              sortType: 'number',
              cell: (s) => `${s.total_hours.toFixed(1)}h`,
            },
            {
              key: 'appointment_count',
              header: 'Appointments',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (s) => s.appointment_count,
            },
            {
              key: 'active_shifts',
              header: 'Active',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (s) =>
                s.active_shifts > 0 ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">{s.active_shifts}</span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                ),
            },
            {
              key: 'completed_shifts',
              header: 'Completed',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (s) => s.completed_shifts,
            },
          ]}
          mobileCard={(s: StaffWorkload) => (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{s.resource_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{s.resource_code}</span>
                </div>
                {s.active_shifts > 0 && (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                    {s.active_shifts} active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold">{s.shift_count}</p>
                  <p className="text-xs text-muted-foreground">Shifts</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{s.total_hours.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Hours</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{s.appointment_count}</p>
                  <p className="text-xs text-muted-foreground">Appts</p>
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </PullToRefresh>
  );
}
