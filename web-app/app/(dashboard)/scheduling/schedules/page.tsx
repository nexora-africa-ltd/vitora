'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Clock,
  CalendarDays,
  Trash2,
  Coffee,
  ChevronDown,
  ChevronRight,
  Users,
  Settings,
  Calendar,
  Repeat,
  Ban,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { toast } from 'sonner';
import { schedulesApi, resourcesApi } from '@/lib/api/scheduling';
import type {
  ScheduleType,
  Schedule,
  ScheduleCreateData,
  ScheduleBreakCreateData,
} from '@/lib/types/scheduling';

const DAY_LABELS: Record<number, string> = {
  0: 'Monday', 1: 'Tuesday', 2: 'Wednesday', 3: 'Thursday',
  4: 'Friday', 5: 'Saturday', 6: 'Sunday',
};

const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: 'RECURRING', label: 'Recurring Weekly' },
  { value: 'ONE_TIME', label: 'One-Time' },
  { value: 'BLOCK', label: 'Blocked Time' },
];

const typeColors: Record<ScheduleType, string> = {
  RECURRING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ONE_TIME: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  BLOCK: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const typeIcons: Record<ScheduleType, typeof Repeat> = {
  RECURRING: Repeat,
  ONE_TIME: Calendar,
  BLOCK: Ban,
};

// =============================================================================
// Collapsible Resource Group
// =============================================================================

function ResourceGroup({
  resourceName,
  schedules,
  defaultOpen,
  onAddBreak,
  onDelete,
  onRowClick,
  selectedId,
}: {
  resourceName: string;
  schedules: Schedule[];
  defaultOpen: boolean;
  onAddBreak: (id: number) => void;
  onDelete: (id: number) => void;
  onRowClick: (s: Schedule) => void;
  selectedId: number | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const recurringCount = schedules.filter(s => s.schedule_type === 'RECURRING').length;
  const oneTimeCount = schedules.filter(s => s.schedule_type === 'ONE_TIME').length;
  const blockCount = schedules.filter(s => s.schedule_type === 'BLOCK').length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <CardTitle className="text-sm font-semibold truncate">{resourceName}</CardTitle>
                <Badge variant="secondary" className="text-xs shrink-0">{schedules.length}</Badge>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {recurringCount > 0 && (
                  <Badge className={`${typeColors.RECURRING} text-xs`} variant="secondary">
                    {recurringCount} weekly
                  </Badge>
                )}
                {oneTimeCount > 0 && (
                  <Badge className={`${typeColors.ONE_TIME} text-xs`} variant="secondary">
                    {oneTimeCount} one-time
                  </Badge>
                )}
                {blockCount > 0 && (
                  <Badge className={`${typeColors.BLOCK} text-xs`} variant="secondary">
                    {blockCount} block
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-0 sm:px-4 pb-2">
            {/* Desktop table */}
            <div className="hidden sm:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Day / Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Slot</TableHead>
                      <TableHead>Breaks</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((s) => {
                      const Icon = typeIcons[s.schedule_type];
                      return (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer transition-colors ${
                            selectedId === s.id ? 'bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => onRowClick(s)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                              <Badge className={`${typeColors[s.schedule_type]} text-xs`} variant="secondary">
                                {s.schedule_type === 'RECURRING' ? 'Weekly' : s.schedule_type === 'ONE_TIME' ? 'Once' : 'Block'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {s.schedule_type === 'RECURRING'
                              ? s.day_of_week_display || DAY_LABELS[s.day_of_week!]
                              : s.specific_date || '—'}
                          </TableCell>
                          <TableCell>{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {s.slot_duration_minutes}min{s.buffer_minutes ? ` +${s.buffer_minutes}buf` : ''}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span>{s.breaks.length}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => { e.stopPropagation(); onAddBreak(s.id); }}
                                title="Add break"
                              >
                                <Coffee className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                              {s.is_active ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                              title="Delete schedule"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2 px-3">
              {schedules.map((s) => {
                const Icon = typeIcons[s.schedule_type];
                return (
                  <div
                    key={s.id}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedId === s.id ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => onRowClick(s)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <Badge className={`${typeColors[s.schedule_type]} text-xs`} variant="secondary">
                            {s.schedule_type === 'RECURRING' ? 'Weekly' : s.schedule_type === 'ONE_TIME' ? 'Once' : 'Block'}
                          </Badge>
                          <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                            {s.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">
                          {s.schedule_type === 'RECURRING'
                            ? s.day_of_week_display || DAY_LABELS[s.day_of_week!]
                            : s.specific_date}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} · {s.slot_duration_minutes}min slots
                          {s.breaks.length > 0 && ` · ${s.breaks.length} break${s.breaks.length > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); onAddBreak(s.id); }}
                        >
                          <Coffee className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inline detail panel when a schedule is selected */}
            {selectedId && schedules.find(s => s.id === selectedId) && (() => {
              const s = schedules.find(s => s.id === selectedId)!;
              return (
                <div className="mx-3 sm:mx-0 mt-3 rounded-lg border bg-muted/30 p-3 sm:p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Schedule Details</p>
                    <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                      {s.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Time</p>
                      <p className="font-medium">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Slot Duration</p>
                      <p className="font-medium">{s.slot_duration_minutes} min</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Buffer</p>
                      <p className="font-medium">{s.buffer_minutes} min</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max Appointments</p>
                      <p className="font-medium">{s.max_appointments ?? '∞'}</p>
                    </div>
                  </div>
                  {s.breaks.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Breaks</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.breaks.map((b, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                            {b.reason && ` (${b.reason})`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm">{s.notes}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();

  const [resourceFilter, setResourceFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [showCreate, setShowCreate] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState<number | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

  // Form state
  const [formResource, setFormResource] = useState('');
  const [formType, setFormType] = useState<ScheduleType>('RECURRING');
  const [formDayOfWeek, setFormDayOfWeek] = useState<string>('0');
  const [formSpecificDate, setFormSpecificDate] = useState('');
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('17:00');
  const [formSlotDuration, setFormSlotDuration] = useState('30');
  const [formBuffer, setFormBuffer] = useState('0');
  const [formMaxAppts, setFormMaxAppts] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Break form
  const [breakStart, setBreakStart] = useState('12:00');
  const [breakEnd, setBreakEnd] = useState('13:00');
  const [breakReason, setBreakReason] = useState('Lunch Break');

  // Resources
  const { data: resourceData } = useQuery({
    queryKey: ['scheduling-resources-all'],
    queryFn: () => resourcesApi.list({ is_active: true, page_size: 200, ordering: 'resource_type,name' }),
  });
  const resources = resourceData?.results || [];

  // Schedules
  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ['scheduling-schedules', resourceFilter, page],
    queryFn: () => schedulesApi.list({
      resource: resourceFilter ? Number(resourceFilter) : undefined,
      page,
      page_size: PAGE_SIZE,
    }),
  });
  const schedules = scheduleData?.results || [];
  const totalCount = scheduleData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Group schedules by resource
  const groupedSchedules = useMemo(() => {
    const groups: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      const key = s.resource_name || `Resource ${s.resource}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    // Sort groups alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [schedules]);

  const createMutation = useMutation({
    mutationFn: (d: ScheduleCreateData) => schedulesApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-schedules'] });
      toast.success('Schedule created');
      closeCreate();
    },
    onError: () => toast.error('Failed to create schedule'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => schedulesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-schedules'] });
      toast.success('Schedule deleted');
      if (selectedScheduleId) setSelectedScheduleId(null);
    },
    onError: () => toast.error('Failed to delete schedule'),
  });

  const addBreakMutation = useMutation({
    mutationFn: ({ scheduleId, data }: { scheduleId: number; data: ScheduleBreakCreateData }) =>
      schedulesApi.addBreak(scheduleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-schedules'] });
      toast.success('Break added');
      setShowBreakDialog(null);
    },
    onError: () => toast.error('Failed to add break'),
  });

  function closeCreate() {
    setShowCreate(false);
    setFormResource('');
    setFormType('RECURRING');
    setFormDayOfWeek('0');
    setFormSpecificDate('');
    setFormStart('08:00');
    setFormEnd('17:00');
    setFormSlotDuration('30');
    setFormBuffer('0');
    setFormMaxAppts('');
    setFormNotes('');
  }

  function handleSubmit() {
    const data: ScheduleCreateData = {
      resource: Number(formResource),
      schedule_type: formType,
      day_of_week: formType === 'RECURRING' ? Number(formDayOfWeek) : undefined,
      specific_date: formType !== 'RECURRING' ? formSpecificDate || undefined : undefined,
      start_time: formStart,
      end_time: formEnd,
      slot_duration_minutes: parseInt(formSlotDuration, 10) || 30,
      buffer_minutes: parseInt(formBuffer, 10) || 0,
      max_appointments: formMaxAppts ? parseInt(formMaxAppts, 10) : undefined,
      notes: formNotes,
    };
    createMutation.mutate(data);
  }

  function handleAddBreak() {
    if (!showBreakDialog) return;
    addBreakMutation.mutate({
      scheduleId: showBreakDialog,
      data: { start_time: breakStart, end_time: breakEnd, reason: breakReason },
    });
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Schedules"
          helpContent="Define when resources are available for booking. Add recurring weekly schedules or one-time availability. Breaks exclude time blocks from scheduling. Schedules are grouped by resource — click a row to see details."
          actions={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Add Schedule</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        {/* Summary + Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {totalCount} schedule{totalCount !== 1 ? 's' : ''} across {groupedSchedules.length} resource{groupedSchedules.length !== 1 ? 's' : ''}
          </p>
          <Select
            value={resourceFilter || '_all'}
            onValueChange={(v) => { setResourceFilter(v === '_all' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Filter by resource" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Resources</SelectItem>
              {resources.map((r) => (
                <SelectItem key={r.id} value={r.id.toString()}>
                  {r.name} ({r.resource_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Collapsible Resource Groups */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groupedSchedules.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Settings className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
              <p className="text-sm font-medium text-muted-foreground">No schedules defined</p>
              <p className="text-xs text-muted-foreground mt-1">Add schedules to define when resources are available.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groupedSchedules.map(([resourceName, groupSchedules], index) => (
              <ResourceGroup
                key={resourceName}
                resourceName={resourceName}
                schedules={groupSchedules}
                defaultOpen={index < 3}
                onAddBreak={setShowBreakDialog}
                onDelete={(id) => deleteMutation.mutate(id)}
                onRowClick={(s) => setSelectedScheduleId(selectedScheduleId === s.id ? null : s.id)}
                selectedId={selectedScheduleId}
              />
            ))}
          </div>
        )}

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
      </div>

      {/* Create Schedule Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>New Schedule</DialogTitle>
              <HelpPopover content="Define availability for a resource. Recurring schedules repeat weekly; one-time schedules apply to a specific date." />
            </div>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Resource *</Label>
              <Select value={formResource} onValueChange={setFormResource}>
                <SelectTrigger>
                  <SelectValue placeholder="Select resource..." />
                </SelectTrigger>
                <SelectContent>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.name} ({r.resource_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Schedule Type</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as ScheduleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formType === 'RECURRING' && (
              <div>
                <Label>Day of Week</Label>
                <Select value={formDayOfWeek} onValueChange={setFormDayOfWeek}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DAY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formType !== 'RECURRING' && (
              <div>
                <Label>Date *</Label>
                <Input type="date" value={formSpecificDate} onChange={(e) => setFormSpecificDate(e.target.value)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start Time *</Label>
                <Input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
              </div>
              <div>
                <Label>End Time *</Label>
                <Input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Slot (min)</Label>
                <Input type="number" value={formSlotDuration} onChange={(e) => setFormSlotDuration(e.target.value)} min="5" />
              </div>
              <div>
                <Label>Buffer (min)</Label>
                <Input type="number" value={formBuffer} onChange={(e) => setFormBuffer(e.target.value)} min="0" />
              </div>
              <div>
                <Label>Max Appts</Label>
                <Input type="number" value={formMaxAppts} onChange={(e) => setFormMaxAppts(e.target.value)} placeholder="∞" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formResource || !formStart || !formEnd || createMutation.isPending}
            >
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Break Dialog */}
      <Dialog open={!!showBreakDialog} onOpenChange={(o) => !o && setShowBreakDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Add Break</DialogTitle>
              <HelpPopover content="Breaks are excluded from available slots. Common examples: lunch break, tea break." />
            </div>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start</Label>
                <Input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={breakReason} onChange={(e) => setBreakReason(e.target.value)} placeholder="e.g., Lunch Break" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBreakDialog(null)}>Cancel</Button>
            <Button onClick={handleAddBreak} disabled={addBreakMutation.isPending}>
              Add Break
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
