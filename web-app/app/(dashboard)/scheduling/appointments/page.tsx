'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  Search,
  CalendarDays,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useSchedulingSocket } from '@/lib/hooks/use-websocket';
import { appointmentsApi } from '@/lib/api/scheduling';
import { formatDate } from '@/lib/utils/format';
import type {
  AppointmentStatus,
  AppointmentType,
  AppointmentPriority,
  AppointmentListItem,
} from '@/lib/types/scheduling';

const STATUS_OPTIONS: { value: AppointmentStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'CREATED', label: 'Created' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CHECKED_IN', label: 'Checked In' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No Show' },
];

const TYPE_OPTIONS: { value: AppointmentType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'PROCEDURE', label: 'Procedure' },
  { value: 'LAB_TEST', label: 'Lab Test' },
  { value: 'IMAGING', label: 'Imaging' },
  { value: 'VACCINATION', label: 'Vaccination' },
  { value: 'THERAPY', label: 'Therapy' },
  { value: 'OTHER', label: 'Other' },
];

const PRIORITY_OPTIONS: { value: AppointmentPriority | ''; label: string }[] = [
  { value: '', label: 'All Priorities' },
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

const statusColors: Record<AppointmentStatus, string> = {
  CREATED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  CONFIRMED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  CHECKED_IN: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  NO_SHOW: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const priorityColors: Record<AppointmentPriority, string> = {
  ROUTINE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  URGENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<AppointmentStatus, string> = {
  CREATED: 'Created',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

export default function AppointmentsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useSchedulingSocket(facility?.id ?? null);

  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | ''>(
    (searchParams.get('status') as AppointmentStatus) || '',
  );
  const [typeFilter, setTypeFilter] = useState<AppointmentType | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<AppointmentPriority | ''>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['scheduling-appointments', statusFilter, typeFilter, priorityFilter, fromDate, toDate, page],
    queryFn: () =>
      appointmentsApi.list({
        status: statusFilter || undefined,
        appointment_type: typeFilter || undefined,
        priority: priorityFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page,
        page_size: 20,
        ordering: '-scheduled_start',
      }),
  });

  const appointments = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Appointments"
          helpContent="View and manage all facility appointments. Filter by status, type, priority, and date range. Click a row to see details and manage lifecycle."
          actions={
            <Button size="sm" onClick={() => router.push('/scheduling/appointments/new')}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Appointment</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={statusFilter || '_all'}
            onValueChange={(v) => { setStatusFilter(v === '_all' ? '' : (v as AppointmentStatus)); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || '_all'} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={typeFilter || '_all'}
            onValueChange={(v) => { setTypeFilter(v === '_all' ? '' : (v as AppointmentType)); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || '_all'} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priorityFilter || '_all'}
            onValueChange={(v) => { setPriorityFilter(v === '_all' ? '' : (v as AppointmentPriority)); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || '_all'} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="w-full sm:w-[150px]"
            placeholder="From"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="w-full sm:w-[150px]"
            placeholder="To"
          />
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground">
          {totalCount} appointment{totalCount !== 1 ? 's' : ''}
        </p>

        {/* Table */}
        <ResponsiveTable
          data={appointments}
          keyExtractor={(a) => a.id}
          onRowClick={(a) => router.push(`/scheduling/appointments/${a.id}`)}
          isLoading={isLoading}
          emptyMessage="No appointments found"
          defaultSortColumn="scheduled_start"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'appointment_number',
              header: 'Appointment #',
              sortable: true,
              cell: (a) => (
                <span className="font-mono text-xs">{a.appointment_number}</span>
              ),
            },
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              cell: (a) => <span className="font-medium">{a.patient_name}</span>,
            },
            {
              key: 'resource_name',
              header: 'Resource',
              sortable: true,
              hideOnMobile: true,
              cell: (a) => a.resource_name,
            },
            {
              key: 'appointment_type',
              header: 'Type',
              sortable: true,
              hideOnMobile: true,
              cell: (a) => (
                <span className="text-sm capitalize">{a.appointment_type.toLowerCase().replace('_', ' ')}</span>
              ),
            },
            {
              key: 'scheduled_start',
              header: 'Date & Time',
              sortable: true,
              sortType: 'date',
              cell: (a) => (
                <span className="text-sm">{formatDate(a.scheduled_start, 'MMM d, yyyy h:mm a')}</span>
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              sortable: true,
              hideOnMobile: true,
              cell: (a) => (
                <Badge className={`${priorityColors[a.priority]} shrink-0 w-fit`}>
                  {a.priority}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (a) => (
                <Badge className={`${statusColors[a.status]} shrink-0 w-fit`}>
                  {statusLabels[a.status]}
                </Badge>
              ),
            },
          ]}
          mobileCard={(a: AppointmentListItem) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{a.patient_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.appointment_number} &bull; {a.resource_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(a.scheduled_start, 'MMM d, h:mm a')} &bull;{' '}
                    {a.appointment_type.toLowerCase().replace('_', ' ')}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  <Badge className={`${statusColors[a.status]} w-fit text-xs`}>
                    {statusLabels[a.status]}
                  </Badge>
                  {a.priority !== 'ROUTINE' && (
                    <Badge className={`${priorityColors[a.priority]} w-fit text-xs`}>
                      {a.priority}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
