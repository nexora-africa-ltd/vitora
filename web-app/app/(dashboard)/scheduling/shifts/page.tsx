'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  CalendarDays,
  Users,
  Activity,
  RefreshCw,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Phone,
  Timer,
  SunMedium,
  MoonStar,
  CalendarOff,
  Palmtree,
  Thermometer,
  Coffee,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useSchedulingSocket } from '@/lib/hooks/use-websocket';
import { shiftsApi, resourcesApi } from '@/lib/api/scheduling';
import { formatDate, formatTime } from '@/lib/utils/format';
import { toast } from 'sonner';
import type {
  ShiftType,
  ShiftStatus,
  ShiftListItem,
  ShiftCreateData,
} from '@/lib/types/scheduling';

// =============================================================================
// Constants
// =============================================================================

const SHIFT_TYPE_OPTIONS: { value: ShiftType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'ON_CALL', label: 'On Call' },
  { value: 'OVERTIME', label: 'Overtime' },
  { value: 'DAY_OFF', label: 'Day Off' },
  { value: 'NIGHT_OFF', label: 'Night Off' },
  { value: 'OFF', label: 'Off' },
  { value: 'AFTERNOON_OFF', label: 'Afternoon Off' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'SICK_LEAVE', label: 'Sick Leave' },
  { value: 'REST', label: 'Rest Day' },
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
  ON_BREAK: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const shiftTypeColors: Partial<Record<ShiftType, string>> = {
  DAY: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  NIGHT: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  MORNING: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  AFTERNOON: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  ON_CALL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  OVERTIME: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  DAY_OFF: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  NIGHT_OFF: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  OFF: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  AFTERNOON_OFF: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  LEAVE: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  SICK_LEAVE: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  REST: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
};

const shiftTypeIcons: Partial<Record<ShiftType, typeof Sun>> = {
  DAY: Sun,
  NIGHT: Moon,
  MORNING: Sunrise,
  AFTERNOON: Sunset,
  ON_CALL: Phone,
  OVERTIME: Timer,
  DAY_OFF: SunMedium,
  NIGHT_OFF: MoonStar,
  OFF: CalendarOff,
  AFTERNOON_OFF: Sunset,
  LEAVE: Palmtree,
  SICK_LEAVE: Thermometer,
  REST: Coffee,
};

// =============================================================================
// Main Component
// =============================================================================

export default function DutyRosterPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useSchedulingSocket(facility?.id ?? null);

  const today = new Date().toISOString().split('T')[0] ?? '';

  const [typeFilter, setTypeFilter] = useState<ShiftType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | ''>('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('today');

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ShiftCreateData>({
    staff_resource: 0,
    shift_date: today,
    start_time: '',
    end_time: '',
    shift_type: 'DAY',
    department: '',
    notes: '',
  });

  // Cancel dialog state
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Handle tab changes for quick date filtering
  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setPage(1);
    const now = new Date();
    if (tab === 'today') {
      const d = now.toISOString().split('T')[0] ?? '';
      setFromDate(d);
      setToDate(d);
    } else if (tab === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay()); // Sunday
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      setFromDate(start.toISOString().split('T')[0] ?? '');
      setToDate(end.toISOString().split('T')[0] ?? '');
    } else if (tab === 'all') {
      setFromDate('');
      setToDate('');
    }
  }

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
  const { data: resourcesData, isLoading: resourcesLoading } = useQuery({
    queryKey: ['scheduling-resources-person'],
    queryFn: () => resourcesApi.list({ resource_type: 'PERSON', is_active: true, page_size: 200 }),
    enabled: createOpen,
  });

  const shifts = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  // Compute stats from visible shifts
  const stats = useMemo(() => {
    const active = shifts.filter(s => s.status === 'ACTIVE').length;
    const scheduled = shifts.filter(s => s.status === 'SCHEDULED').length;
    const completed = shifts.filter(s => s.status === 'COMPLETED').length;
    const totalHours = shifts.reduce((sum, s) => sum + (s.duration_hours || 0), 0);
    return { active, scheduled, completed, totalHours };
  }, [shifts]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (d: ShiftCreateData) => shiftsApi.create(d),
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
      toast.success('Shift started — clock in recorded');
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
    },
    onError: () => toast.error('Failed to start shift'),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => shiftsApi.complete(id),
    onSuccess: () => {
      toast.success('Shift completed — clock out recorded');
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

  const syncMutation = useMutation({
    mutationFn: () => resourcesApi.syncFromStaff(),
    onSuccess: (result) => {
      if (result.created > 0) {
        toast.success(`Synced ${result.created} staff member(s) as scheduling resources`);
        queryClient.invalidateQueries({ queryKey: ['scheduling-resources-person'] });
      } else {
        toast.info('All staff already have scheduling resources');
      }
    },
    onError: () => toast.error('Failed to sync staff'),
  });

  function resetCreateForm() {
    setCreateForm({
      staff_resource: 0,
      shift_date: today,
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

  // Pre-fill times when shift type changes
  function handleShiftTypeChange(type: ShiftType) {
    const timeDefaults: Partial<Record<ShiftType, { start: string; end: string }>> = {
      DAY: { start: '07:00', end: '19:00' },
      NIGHT: { start: '19:00', end: '07:00' },
      MORNING: { start: '06:00', end: '14:00' },
      AFTERNOON: { start: '14:00', end: '22:00' },
      ON_CALL: { start: '00:00', end: '23:59' },
      OFF: { start: '00:00', end: '23:59' },
      DAY_OFF: { start: '07:00', end: '19:00' },
      NIGHT_OFF: { start: '19:00', end: '07:00' },
      AFTERNOON_OFF: { start: '14:00', end: '22:00' },
      LEAVE: { start: '00:00', end: '23:59' },
      SICK_LEAVE: { start: '00:00', end: '23:59' },
      REST: { start: '00:00', end: '23:59' },
    };
    const defaults = timeDefaults[type];
    setCreateForm(prev => ({
      ...prev,
      shift_type: type,
      start_time: defaults?.start || prev.start_time,
      end_time: defaults?.end || prev.end_time,
    }));
  }

  const hasResources = (resourcesData?.results?.length ?? 0) > 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Duty Roster"
          helpContent="Manage staff shifts and duty assignments. Create shifts, clock in/out, and track coverage across departments. Use the 'Sync Staff' button in the New Shift dialog to import staff profiles as scheduling resources."
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Shift</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatsCard
            title="On Duty"
            value={stats.active}
            icon={Activity}
            variant={stats.active > 0 ? 'success' : 'default'}
            meta="Currently active"
          />
          <StatsCard
            title="Upcoming"
            value={stats.scheduled}
            icon={CalendarDays}
            variant={stats.scheduled === 0 && stats.active === 0 ? 'warning' : 'default'}
            meta="Scheduled shifts"
          />
          <StatsCard
            title="Completed"
            value={stats.completed}
            icon={CheckCircle}
            meta="Finished shifts"
          />
          <StatsCard
            title="Coverage"
            value={`${stats.totalHours.toFixed(0)}h`}
            icon={Clock}
            meta="Total shift hours"
          />
        </div>

        {/* Quick Date Tabs + Filters */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              <TabsTrigger value="today" className="text-xs sm:text-sm">Today</TabsTrigger>
              <TabsTrigger value="week" className="text-xs sm:text-sm">This Week</TabsTrigger>
              <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap gap-2">
              <Select
                value={typeFilter || '_all'}
                onValueChange={(v) => { setTypeFilter(v === '_all' ? '' : (v as ShiftType)); setPage(1); }}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Type" />
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
                <SelectTrigger className="w-[130px] h-8 text-xs">
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
                className="w-[130px] h-8 text-xs"
              />
            </div>
          </div>

          {/* Custom date range (visible on "All" tab) */}
          {activeTab === 'all' && (
            <div className="flex flex-wrap gap-2 mt-3">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="w-full sm:w-[150px] h-8 text-xs"
              />
              <span className="hidden sm:flex items-center text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="w-full sm:w-[150px] h-8 text-xs"
              />
            </div>
          )}

          <TabsContent value={activeTab || 'today'} className="mt-4 space-y-3">
            {/* Results count */}
            <p className="text-sm text-muted-foreground">
              {totalCount} shift{totalCount !== 1 ? 's' : ''}
              {fromDate && toDate && fromDate === toDate && ` for ${formatDate(fromDate)}`}
              {fromDate && toDate && fromDate !== toDate && ` from ${formatDate(fromDate)} to ${formatDate(toDate)}`}
            </p>

            {/* Table */}
            <ResponsiveTable
              data={shifts}
              keyExtractor={(s) => s.id}
              isLoading={isLoading}
              emptyMessage={
                activeTab === 'today'
                  ? 'No shifts scheduled for today'
                  : 'No shifts found for the selected period'
              }
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
                  cell: (s) => {
                    const Icon = shiftTypeIcons[s.shift_type] || Clock;
                    return (
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm">{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                      </div>
                    );
                  },
                },
                {
                  key: 'shift_type',
                  header: 'Type',
                  sortable: true,
                  hideOnMobile: true,
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
                            title="Clock in"
                          >
                            <Play className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setCancelId(s.id)}
                            title="Cancel"
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
                          title="Clock out"
                        >
                          <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              mobileCard={(s: ShiftListItem) => {
                const Icon = shiftTypeIcons[s.shift_type] || Clock;
                return (
                  <div className="p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`shrink-0 rounded-md p-1.5 ${shiftTypeColors[s.shift_type]}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{s.staff_resource_name}</p>
                          <p className="text-xs text-muted-foreground">{s.department || 'No department'}</p>
                        </div>
                      </div>
                      <Badge className={`${statusColors[s.status]} shrink-0 w-fit text-xs`} variant="secondary">
                        {s.status_display}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(s.shift_date)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatTime(s.start_time)} – {formatTime(s.end_time)}
                        {s.duration_hours != null && (
                          <span className="font-medium text-foreground">({s.duration_hours.toFixed(1)}h)</span>
                        )}
                      </div>
                    </div>
                    {(s.status === 'SCHEDULED' || s.status === 'ACTIVE') && (
                      <div className="flex gap-2 pt-0.5">
                        {s.status === 'SCHEDULED' && (
                          <>
                            <Button size="sm" variant="default" className="h-7 text-xs flex-1" onClick={() => startMutation.mutate(s.id)}>
                              <Play className="h-3 w-3 mr-1" /> Clock In
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCancelId(s.id)}>
                              <XCircle className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          </>
                        )}
                        {s.status === 'ACTIVE' && (
                          <Button size="sm" variant="default" className="h-7 text-xs flex-1" onClick={() => completeMutation.mutate(s.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Clock Out
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }}
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
          </TabsContent>
        </Tabs>

        {/* Create Shift Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Shift</DialogTitle>
              <DialogDescription>
                Schedule a new shift assignment for a staff member.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Staff Member Selection */}
              <div className="space-y-2">
                <Label>Staff Member *</Label>
                {resourcesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Loading staff...
                  </div>
                ) : !hasResources ? (
                  <Card className="border-dashed">
                    <CardContent className="p-4 text-center space-y-3">
                      <Users className="h-8 w-8 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">No staff resources found</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Staff profiles need to be synced as scheduling resources before they can be assigned shifts.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                        {syncMutation.isPending ? 'Syncing...' : 'Sync Staff Profiles'}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
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
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Shift Type with time pre-fill */}
              <div className="space-y-2">
                <Label>Shift Type</Label>
                <Select
                  value={createForm.shift_type}
                  onValueChange={(v) => handleShiftTypeChange(v as ShiftType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">
                      <div className="flex items-center gap-2"><Sun className="h-3.5 w-3.5" /> Day (7am–7pm)</div>
                    </SelectItem>
                    <SelectItem value="NIGHT">
                      <div className="flex items-center gap-2"><Moon className="h-3.5 w-3.5" /> Night (7pm–7am)</div>
                    </SelectItem>
                    <SelectItem value="MORNING">
                      <div className="flex items-center gap-2"><Sunrise className="h-3.5 w-3.5" /> Morning (6am–2pm)</div>
                    </SelectItem>
                    <SelectItem value="AFTERNOON">
                      <div className="flex items-center gap-2"><Sunset className="h-3.5 w-3.5" /> Afternoon (2pm–10pm)</div>
                    </SelectItem>
                    <SelectItem value="ON_CALL">
                      <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> On-Call (24h)</div>
                    </SelectItem>
                    <SelectItem value="OVERTIME">
                      <div className="flex items-center gap-2"><Timer className="h-3.5 w-3.5" /> Overtime</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={createForm.shift_date}
                  onChange={(e) => setCreateForm({ ...createForm, shift_date: e.target.value })}
                />
              </div>

              {/* Time Range */}
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

              {/* Department */}
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="e.g. Emergency, Outpatient"
                  value={createForm.department || ''}
                  onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                />
              </div>

              {/* Notes */}
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
              <Button onClick={handleCreate} disabled={createMutation.isPending || !hasResources}>
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
              <DialogDescription>
                This will remove the shift from the roster. Please provide a reason.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  placeholder="e.g. Staff called in sick, coverage already arranged"
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
                onClick={() => { if (cancelId) cancelMutation.mutate({ id: cancelId, reason: cancelReason }); }}
                disabled={cancelMutation.isPending}
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
