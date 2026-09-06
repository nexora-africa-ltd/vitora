// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Facility scheduling vacancy list, creation, and lifecycle actions.
 * Available at /scheduling/vacancies for users with scheduling access.
 */

'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarDays, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFacility } from '@/lib/context/facility-context';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import {
  useCancelShiftVacancy,
  useCreateShiftVacancy,
  useFillShiftVacancy,
  useShiftVacancies,
} from '@/lib/hooks/use-shift-vacancies';
import { departmentsApi } from '@/lib/api/rbac';
import { useQuery } from '@tanstack/react-query';
import type { ShiftType, ShiftVacancy, ShiftVacancyCreateData, ShiftVacancyStatus } from '@/lib/types/scheduling';
import { formatDate, formatTime } from '@/lib/utils/format';
import { toast } from 'sonner';

const vacancyStatuses: Array<{ value: ShiftVacancyStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'FILLED', label: 'Filled' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const shiftTypes: Array<{ value: ShiftType; label: string }> = [
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'ON_CALL', label: 'On Call' },
  { value: 'OVERTIME', label: 'Overtime' },
];

const statusStyles: Record<ShiftVacancyStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  FILLED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function emptyVacancyForm(): ShiftVacancyCreateData {
  return {
    shift_date: new Date().toISOString().slice(0, 10),
    start_time: '08:00',
    end_time: '16:00',
    shift_type: 'DAY',
    department: null,
    notes: '',
  };
}

export default function ShiftVacanciesPage() {
  const { facility } = useFacility();
  const { refresh, isRefreshing } = usePageRefresh();
  const { hasPermission } = usePermissions();
  const canManageVacancies = hasPermission('scheduling.manage_schedules');
  const [status, setStatus] = useState<ShiftVacancyStatus>('OPEN');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ShiftVacancyCreateData>(emptyVacancyForm);

  const vacanciesQuery = useShiftVacancies(facility?.id, {
    status,
    page,
    page_size: 20,
    ordering: 'shift_date,start_time',
  });
  const { data: departmentsData } = useQuery({
    queryKey: ['departments-list', facility?.id],
    queryFn: () => departmentsApi.list({ page_size: 200, is_active: true }),
    enabled: createOpen && Boolean(facility),
  });
  const createMutation = useCreateShiftVacancy();
  const fillMutation = useFillShiftVacancy();
  const cancelMutation = useCancelShiftVacancy();
  const vacancies = vacanciesQuery.data?.results ?? [];
  const departments = departmentsData?.results ?? [];
  const totalPages = Math.ceil((vacanciesQuery.data?.count ?? 0) / 20);

  function submitCreate() {
    if (!form.shift_date || !form.start_time || !form.end_time) {
      toast.error('Date, start time, and end time are required');
      return;
    }
    createMutation.mutate(form, {
      onSuccess: () => {
        toast.success('Shift vacancy created');
        setCreateOpen(false);
        setForm(emptyVacancyForm());
      },
      onError: () => toast.error('Failed to create shift vacancy'),
    });
  }

  function fillVacancy(id: number) {
    fillMutation.mutate(id, {
      onSuccess: () => toast.success('Vacancy marked as filled'),
      onError: () => toast.error('Failed to fill vacancy'),
    });
  }

  function cancelVacancy(id: number) {
    cancelMutation.mutate(id, {
      onSuccess: () => toast.success('Vacancy cancelled'),
      onError: () => toast.error('Failed to cancel vacancy'),
    });
  }

  const columns = [
    {
      key: 'shift_date',
      header: 'Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ShiftVacancy) => formatDate(item.shift_date),
    },
    {
      key: 'shift_type',
      header: 'Shift',
      sortable: true,
      cell: (item: ShiftVacancy) => <Badge variant="outline">{item.shift_type_display}</Badge>,
    },
    {
      key: 'start_time',
      header: 'Time',
      sortable: true,
      cell: (item: ShiftVacancy) => `${formatTime(item.start_time)} - ${formatTime(item.end_time)}`,
    },
    {
      key: 'department_name',
      header: 'Department',
      sortable: true,
      cell: (item: ShiftVacancy) => item.department_name || 'All departments',
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ShiftVacancy) => (
        <Badge className={`${statusStyles[item.status]} w-fit shrink-0`}>{item.status_display}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ShiftVacancy) =>
        canManageVacancies && item.status === 'OPEN' ? (
          <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
            <Button size="sm" onClick={() => fillVacancy(item.id)} disabled={fillMutation.isPending}>
              Fill
            </Button>
            <Button size="sm" variant="outline" onClick={() => cancelVacancy(item.id)} disabled={cancelMutation.isPending}>
              Cancel
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Shift Vacancies"
          helpContent="Publish unassigned shifts that need cover, then mark them filled or cancelled as staffing is confirmed."
          actions={
            canManageVacancies ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">New Vacancy</span>
                <span className="sm:hidden">New</span>
              </Button>
            ) : null
          }
        />

        <div className="flex flex-wrap gap-2">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as ShiftVacancyStatus);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {vacancyStatuses.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ResponsiveTable
          data={vacancies}
          keyExtractor={(item) => item.id}
          columns={columns}
          defaultSortColumn="shift_date"
          defaultSortDirection="asc"
          isLoading={vacanciesQuery.isLoading}
          emptyMessage={`No ${status.toLowerCase()} shift vacancies.`}
          mobileCard={(item: ShiftVacancy) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{formatDate(item.shift_date)}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.shift_type_display} | {formatTime(item.start_time)} - {formatTime(item.end_time)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.department_name || 'All departments'}</p>
                </div>
                <Badge className={`${statusStyles[item.status]} w-fit shrink-0`}>{item.status_display}</Badge>
              </div>
              {canManageVacancies && item.status === 'OPEN' ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => fillVacancy(item.id)} disabled={fillMutation.isPending}>Fill</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => cancelVacancy(item.id)} disabled={cancelMutation.isPending}>Cancel</Button>
                </div>
              ) : null}
            </Card>
          )}
        />

        {totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((current) => current - 1)} disabled={page === 1}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((current) => current + 1)} disabled={page === totalPages}>Next</Button>
          </div>
        ) : null}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />New Shift Vacancy</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vacancy-date">Date</Label>
              <Input id="vacancy-date" type="date" value={form.shift_date} onChange={(event) => setForm((current) => ({ ...current, shift_date: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vacancy-shift-type">Shift type</Label>
              <Select value={form.shift_type} onValueChange={(value) => setForm((current) => ({ ...current, shift_type: value as ShiftType }))}>
                <SelectTrigger id="vacancy-shift-type"><SelectValue /></SelectTrigger>
                <SelectContent>{shiftTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vacancy-start">Start time</Label>
              <Input id="vacancy-start" type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vacancy-end">End time</Label>
              <Input id="vacancy-end" type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vacancy-department">Department</Label>
              <Select value={form.department ? String(form.department) : '_all'} onValueChange={(value) => setForm((current) => ({ ...current, department: value === '_all' ? null : Number(value) }))}>
                <SelectTrigger id="vacancy-department"><SelectValue placeholder="All departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All departments</SelectItem>
                  {departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vacancy-notes">Notes</Label>
              <Textarea id="vacancy-notes" value={form.notes ?? ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}><CalendarDays className="mr-2 h-4 w-4" />Create Vacancy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
