'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Play,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useSchedulingSocket } from '@/lib/hooks/use-websocket';
import { shiftsApi } from '@/lib/api/scheduling';
import { resourcesApi } from '@/lib/api/scheduling';
import { formatDate, formatTime } from '@/lib/utils/format';
import { toast } from 'sonner';
import type {
  ShiftType,
  ShiftStatus,
  ShiftListItem,
  ShiftCreateData,
} from '@/lib/types/scheduling';

const SHIFT_TYPE_OPTIONS: { value: ShiftType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'ON_CALL', label: 'On Call' },
  { value: 'OVERTIME', label: 'Overtime' },
];

const STATUS_OPTIONS: { value: ShiftStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const statusColors: Record<ShiftStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const shiftTypeColors: Record<ShiftType, string> = {
  DAY: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  NIGHT: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  MORNING: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  AFTERNOON: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  ON_CALL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  OVERTIME: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
};

export default function DutyRosterPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useSchedulingSocket(facility?.id ?? null);

  const [typeFilter, setTypeFilter] = useState<ShiftType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | ''>('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState(1);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ShiftCreateData>({
    staff_resource: 0,
    shift_date: '',
    start_time: '',
    end_time: '',
    shift_type: 'DAY',
    department: '',
    notes: '',
  });

  // Cancel dialog state
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Fetch shifts
  const { data, isLoading } = useQuery({
    queryKey: ['scheduling-shifts', typeFilter, statusFilter, departmentFilter, fromDate, toDate, page],
    queryFn: () =>
      shiftsApi.list({
        shift_type: typeFilter || undefined,
        status: statusFilter || undefined,
        department: departmentFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page,
        page_size: 20,
        ordering: '-shift_date,-start_time',
      }),
  });

  // Fetch PERSON resources for create dialog
  const { data: resourcesData } = useQuery({
    queryKey: ['scheduling-resources-person'],
    queryFn: () => resourcesApi.list({ resource_type: 'PERSON', is_active: true, page_size: 200 }),
    enabled: createOpen,
  });

  const shifts = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: ShiftCreateData) => shiftsApi.create(data),
    onSuccess: () => {
      toast.success('Shift created');
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      setCreateOpen(false);
      resetCreateForm();
    },
    onError: () => toast.error('Failed to create shift'),
  });

  const startMutation = useMutation({
    mutationFn: (id: number) => shiftsApi.start(id),
    onSuccess: () => {
      toast.success('Shift started');
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
    },
    onError: () => toast.error('Failed to start shift'),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => shiftsApi.complete(id),
    onSuccess: () => {
      toast.success('Shift completed');
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
    },
    onError: () => toast.error('Failed to complete shift'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => shiftsApi.cancel(id, reason),
    onSuccess: () => {
      toast.success('Shift cancelled');
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      setCancelId(null);
      setCancelReason('');
    },
    onError: () => toast.error('Failed to cancel shift'),
  });

  function resetCreateForm() {
    setCreateForm({
      staff_resource: 0,
      shift_date: '',
      start_time: '',
      end_time: '',
      shift_type: 'DAY',
      department: '',
      notes: '',
    });
  }

  function handleCreate() {
    if (!createForm.staff_resource || !createForm.shift_date || !createForm.start_time || !createForm.end_time) {
      toast.error('Please fill in all required fields');
      return;
    }
    createMutation.mutate(createForm);
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Duty Roster"
          helpContent="View and manage staff shifts and duty roster. Create new shifts, clock in/out, and track shift assignments across departments."
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Shift</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={typeFilter || '_all'}
            onValueChange={(v) => { setTypeFilter(v === '_all' ? '' : (v as ShiftType)); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Shift Type" />
            </SelectTrigger>
            <SelectContent>
              {SHIFT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || '_all'} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter || '_all'}
            onValueChange={(v) => { setStatusFilter(v === '_all' ? '' : (v as ShiftStatus)); setPage(1); }}
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

          <Input
            placeholder="Department"
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
            className="w-full sm:w-[150px]"
          />

          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="w-full sm:w-[150px]"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="w-full sm:w-[150px]"
          />
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground">
          {totalCount} shift{totalCount !== 1 ? 's' : ''}
        </p>

        {/* Table */}
        <ResponsiveTable
          data={shifts}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No shifts found"
          defaultSortColumn="shift_date"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'staff_resource_name',
              header: 'Staff',
              sortable: true,
              cell: (s) => <span className="font-medium">{s.staff_resource_name}</span>,
            },
            {
              key: 'shift_date',
              header: 'Date',
              sortable: true,
              sortType: 'date',
              cell: (s) => formatDate(s.shift_date),
            },
            {
              key: 'start_time',
              header: 'Time',
              cell: (s) => (
                <span className="text-sm">
                  {formatTime(s.start_time)} – {formatTime(s.end_time)}
                </span>
              ),
            },
            {
              key: 'shift_type',
              header: 'Type',
              sortable: true,
              cell: (s) => (
                <Badge className={`${shiftTypeColors[s.shift_type]} shrink-0 w-fit`} variant="secondary">
                  {s.shift_type_display}
                </Badge>
              ),
            },
            {
              key: 'department',
              header: 'Department',
              sortable: true,
              hideOnMobile: true,
              cell: (s) => s.department || '—',
            },
            {
              key: 'duration_hours',
              header: 'Hours',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (s) => (s.duration_hours != null ? `${s.duration_hours.toFixed(1)}h` : '—'),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (s) => (
                <Badge className={`${statusColors[s.status]} shrink-0 w-fit`} variant="secondary">
                  {s.status_display}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              cell: (s) => (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {s.status === 'SCHEDULED' && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startMutation.mutate(s.id)}
                        title="Start shift"
                      >
                        <Play className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCancelId(s.id)}
                        title="Cancel shift"
                      >
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </>
                  )}
                  {s.status === 'ACTIVE' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => completeMutation.mutate(s.id)}
                      title="Complete shift"
                    >
                      <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          mobileCard={(s: ShiftListItem) => (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{s.staff_resource_name}</span>
                <Badge className={`${statusColors[s.status]} shrink-0 w-fit text-xs`} variant="secondary">
                  {s.status_display}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDate(s.shift_date)} · {formatTime(s.start_time)} – {formatTime(s.end_time)}
              </div>
              <div className="flex items-center justify-between">
                <Badge className={`${shiftTypeColors[s.shift_type]} text-xs`} variant="secondary">
                  {s.shift_type_display}
                </Badge>
                {s.department && (
                  <span className="text-xs text-muted-foreground">{s.department}</span>
                )}
              </div>
              <div className="flex gap-1 pt-1">
                {s.status === 'SCHEDULED' && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startMutation.mutate(s.id)}>
                      <Play className="h-3 w-3 mr-1" /> Start
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => setCancelId(s.id)}>
                      <XCircle className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </>
                )}
                {s.status === 'ACTIVE' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => completeMutation.mutate(s.id)}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Complete
                  </Button>
                )}
              </div>
            </div>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Create Shift Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Shift</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Staff Member *</Label>
                <Select
                  value={createForm.staff_resource ? String(createForm.staff_resource) : ''}
                  onValueChange={(v) => setCreateForm({ ...createForm, staff_resource: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {resourcesData?.results?.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                    {(!resourcesData?.results || resourcesData.results.length === 0) && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No staff resources found</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={createForm.shift_date}
                  onChange={(e) => setCreateForm({ ...createForm, shift_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Time *</Label>
                  <Input
                    type="time"
                    value={createForm.start_time}
                    onChange={(e) => setCreateForm({ ...createForm, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time *</Label>
                  <Input
                    type="time"
                    value={createForm.end_time}
                    onChange={(e) => setCreateForm({ ...createForm, end_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Shift Type</Label>
                <Select
                  value={createForm.shift_type}
                  onValueChange={(v) => setCreateForm({ ...createForm, shift_type: v as ShiftType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day</SelectItem>
                    <SelectItem value="NIGHT">Night</SelectItem>
                    <SelectItem value="MORNING">Morning</SelectItem>
                    <SelectItem value="AFTERNOON">Afternoon</SelectItem>
                    <SelectItem value="ON_CALL">On Call</SelectItem>
                    <SelectItem value="OVERTIME">Overtime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="e.g. Emergency, Outpatient"
                  value={createForm.department || ''}
                  onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Optional notes"
                  value={createForm.notes || ''}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Shift'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Shift Dialog */}
        <Dialog open={cancelId !== null} onOpenChange={(open) => { if (!open) { setCancelId(null); setCancelReason(''); } }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel Shift</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>Reason *</Label>
                <Textarea
                  placeholder="Reason for cancellation"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCancelId(null); setCancelReason(''); }}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={() => { if (cancelId && cancelReason.trim()) cancelMutation.mutate({ id: cancelId, reason: cancelReason }); }}
                disabled={cancelMutation.isPending || !cancelReason.trim()}
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Shift'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
