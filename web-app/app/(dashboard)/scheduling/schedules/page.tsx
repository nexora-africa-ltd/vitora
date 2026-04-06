'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Clock,
  CalendarDays,
  Trash2,
  Coffee,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
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

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();

  const [resourceFilter, setResourceFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState<number | null>(null);

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
    queryKey: ['scheduling-schedules', resourceFilter],
    queryFn: () => schedulesApi.list({
      resource: resourceFilter ? Number(resourceFilter) : undefined,
    }),
  });
  const schedules = scheduleData?.results || [];

  const createMutation = useMutation({
    mutationFn: (d: ScheduleCreateData) => schedulesApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-schedules'] });
      toast({ title: 'Schedule Created' });
      closeCreate();
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create schedule.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => schedulesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-schedules'] });
      toast({ title: 'Schedule Deleted' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' }),
  });

  const addBreakMutation = useMutation({
    mutationFn: ({ scheduleId, data }: { scheduleId: number; data: ScheduleBreakCreateData }) =>
      schedulesApi.addBreak(scheduleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-schedules'] });
      toast({ title: 'Break Added' });
      setShowBreakDialog(null);
    },
    onError: () => toast({ title: 'Error', description: 'Failed to add break.', variant: 'destructive' }),
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
          helpContent="Define when resources are available for booking. Add recurring weekly schedules or one-time availability. Breaks exclude time blocks from scheduling."
          actions={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Add Schedule</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        {/* Filter */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={resourceFilter || '_all'}
            onValueChange={(v) => setResourceFilter(v === '_all' ? '' : v)}
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

        {/* Table */}
        <ResponsiveTable
          data={schedules}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No schedules defined"
          columns={[
            {
              key: 'resource_name',
              header: 'Resource',
              sortable: true,
              cell: (s) => <span className="font-medium">{s.resource_name}</span>,
            },
            {
              key: 'schedule_type',
              header: 'Type',
              sortable: true,
              cell: (s) => (
                <Badge className={`${typeColors[s.schedule_type]} w-fit`}>
                  {s.schedule_type === 'RECURRING' ? 'Weekly' : s.schedule_type === 'ONE_TIME' ? 'One-Time' : 'Block'}
                </Badge>
              ),
            },
            {
              key: 'day_of_week',
              header: 'Day / Date',
              sortable: true,
              cell: (s) =>
                s.schedule_type === 'RECURRING'
                  ? s.day_of_week_display || DAY_LABELS[s.day_of_week!]
                  : s.specific_date || '—',
            },
            {
              key: 'start_time',
              header: 'Time',
              cell: (s) => `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}`,
            },
            {
              key: 'slot_duration_minutes',
              header: 'Slot',
              hideOnMobile: true,
              cell: (s) => `${s.slot_duration_minutes}min${s.buffer_minutes ? ` +${s.buffer_minutes}buf` : ''}`,
            },
            {
              key: 'breaks',
              header: 'Breaks',
              hideOnMobile: true,
              cell: (s) => (
                <div className="flex items-center gap-1">
                  <span className="text-sm">{s.breaks.length}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => { e.stopPropagation(); setShowBreakDialog(s.id); }}
                    title="Add break"
                  >
                    <Coffee className="h-3 w-3" />
                  </Button>
                </div>
              ),
            },
            {
              key: 'is_active',
              header: 'Active',
              cell: (s) => (
                <Badge variant={s.is_active ? 'default' : 'secondary'}>
                  {s.is_active ? 'Yes' : 'No'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              cell: (s) => (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id); }}
                  title="Delete schedule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]}
          mobileCard={(s: Schedule) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{s.resource_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.schedule_type === 'RECURRING'
                      ? s.day_of_week_display || DAY_LABELS[s.day_of_week!]
                      : s.specific_date}
                    {' · '}
                    {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                    {' · '}
                    {s.slot_duration_minutes}min slots
                  </p>
                  {s.breaks.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.breaks.length} break{s.breaks.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 items-center shrink-0">
                  <Badge className={`${typeColors[s.schedule_type]} w-fit text-xs`}>
                    {s.schedule_type === 'RECURRING' ? 'Weekly' : s.schedule_type === 'ONE_TIME' ? 'Once' : 'Block'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setShowBreakDialog(s.id)}
                  >
                    <Coffee className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        />
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
