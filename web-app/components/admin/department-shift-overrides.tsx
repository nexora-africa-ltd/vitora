// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Department-level roster shift override editor.
 * Render on an administrative department detail page with a department ID and name.
 * Inputs: departmentId and departmentName props.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  departmentRosterSettingsApi,
  departmentShiftConfigsApi,
  shiftTypeConfigsApi,
} from '@/lib/api/scheduling';
import type {
  DepartmentShiftConfig,
  DepartmentShiftConfigCreateData,
} from '@/lib/types/scheduling';
import { HelpPopover } from '@/components/shared/help-popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

const WORKING_SHIFT_TYPES = [
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'ON_CALL', label: 'On Call' },
  { value: 'OVERTIME', label: 'Overtime' },
];
const NON_WORKING_SHIFT_TYPES = [
  { value: 'DAY_OFF', label: 'Day Off' },
  { value: 'NIGHT_OFF', label: 'Night Off' },
  { value: 'OFF', label: 'Off' },
  { value: 'AFTERNOON_OFF', label: 'Afternoon Off' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'SICK_LEAVE', label: 'Sick Leave' },
  { value: 'REST', label: 'Rest' },
];
const WORKING_SHIFT_VALUES = new Set(WORKING_SHIFT_TYPES.map((item) => item.value));

function createForm(department: number): DepartmentShiftConfigCreateData {
  return {
    department,
    shift_type: 'DAY',
    start_time: '08:00',
    end_time: '16:00',
    is_active: true,
    label: '',
    color: '',
    min_staff: 1,
    max_staff: null,
  };
}

export function DepartmentShiftOverrides({
  departmentId,
  departmentName,
}: {
  departmentId: number;
  departmentName: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentShiftConfig | null>(null);
  const [form, setForm] = useState<DepartmentShiftConfigCreateData>(() => createForm(departmentId));
  const [pendingRota, setPendingRota] = useState<string[] | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['department-shift-configs', departmentId],
    queryFn: () => departmentShiftConfigsApi.list({ department: departmentId, page_size: 100 }),
  });
  const { data: facilityShiftDefaults } = useQuery({
    queryKey: ['shift-type-config-defaults'],
    queryFn: () => shiftTypeConfigsApi.defaults(),
  });
  const { data: rosterSettingsData, isLoading: isRosterSettingsLoading } = useQuery({
    queryKey: ['department-roster-settings', departmentId],
    queryFn: () => departmentRosterSettingsApi.list({ department: departmentId, page_size: 1 }),
  });
  const configs = data?.results ?? [];
  const configuredTypes = new Set(configs.map((config) => config.shift_type));
  const availableShiftTypes = Object.entries(facilityShiftDefaults ?? {}).length
    ? [
        ...Object.entries(facilityShiftDefaults ?? {})
          .filter(([value]) => WORKING_SHIFT_VALUES.has(value))
          .map(([value, config]) => ({
            value,
            label: config.label || value,
          })),
        ...NON_WORKING_SHIFT_TYPES,
      ]
    : [...WORKING_SHIFT_TYPES, ...NON_WORKING_SHIFT_TYPES];
  const rosterSettings = rosterSettingsData?.results[0];
  const rota = pendingRota ?? rosterSettings?.repeating_shift_pattern ?? [];
  const shiftLabels = new Map(availableShiftTypes.map((type) => [type.value, type.label]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['department-shift-configs', departmentId] });
    queryClient.invalidateQueries({ queryKey: ['department-shift-configs'] });
    queryClient.invalidateQueries({ queryKey: ['department-roster-settings', departmentId] });
    queryClient.invalidateQueries({ queryKey: ['department-roster-settings'] });
    queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
  };
  const createMutation = useMutation({
    mutationFn: (data: DepartmentShiftConfigCreateData) => departmentShiftConfigsApi.create(data),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success('Department shift override added');
    },
    onError: () => toast.error('Failed to add department shift override'),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DepartmentShiftConfigCreateData> }) =>
      departmentShiftConfigsApi.update(id, data),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success('Department shift override updated');
    },
    onError: () => toast.error('Failed to update department shift override'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => departmentShiftConfigsApi.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Department shift override removed');
    },
    onError: () => toast.error('Failed to remove department shift override'),
  });

  const openCreate = () => {
    const available = availableShiftTypes.find(
      (type) => !configuredTypes.has(type.value as DepartmentShiftConfigCreateData['shift_type'])
    );
    if (!available) {
      toast.info('All working shift types already have an override');
      return;
    }
    setEditing(null);
    setForm({ ...createForm(departmentId), shift_type: available.value as DepartmentShiftConfigCreateData['shift_type'] });
    setOpen(true);
  };
  const openEdit = (config: DepartmentShiftConfig) => {
    setEditing(config);
    setForm({
      department: departmentId,
      shift_type: config.shift_type,
      start_time: config.start_time.slice(0, 5),
      end_time: config.end_time.slice(0, 5),
      is_active: config.is_active,
      label: config.label,
      color: config.color,
      min_staff: config.min_staff,
      max_staff: config.max_staff,
    });
    setOpen(true);
  };
  const save = () => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
      return;
    }
    createMutation.mutate(form);
  };
  const saveRotaMutation = useMutation({
    mutationFn: () =>
      rosterSettings
        ? departmentRosterSettingsApi.update(rosterSettings.id, { repeating_shift_pattern: rota })
        : departmentRosterSettingsApi.create({
            department: departmentId,
            repeating_shift_pattern: rota,
          }),
    onSuccess: () => {
      invalidate();
      setPendingRota(null);
      toast.success('Department rota saved');
    },
    onError: () => toast.error('Failed to save department rota'),
  });
  const deleteRotaMutation = useMutation({
    mutationFn: (id: number) => departmentRosterSettingsApi.delete(id),
    onSuccess: () => {
      invalidate();
      setPendingRota(null);
      toast.success('Department rota removed');
    },
    onError: () => toast.error('Failed to remove department rota'),
  });
  const addShiftToRota = (shiftType: string) => {
    setPendingRota([...rota, shiftType]);
  };

  return (
    <>
      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
          aria-hidden="true"
        />
        <CardHeader className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Repeating Department Rota</CardTitle>
            <HelpPopover content="Set the department's shared staff cycle template. Auto-fill applies this sequence per staff (staggered by staff order), including non-working entries like OFF/REST." />
          </div>
          <div className="flex items-center gap-2">
            {rosterSettings && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteRotaMutation.mutate(rosterSettings.id)}
                disabled={deleteRotaMutation.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Remove Rota
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => saveRotaMutation.mutate()}
              disabled={isRosterSettingsLoading || saveRotaMutation.isPending}
            >
              {rosterSettings ? 'Update Rota' : 'Create Rota'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="relative space-y-4">
          <p className="text-sm text-muted-foreground">
            Add shift types in their intended order. A shift can appear more than once, for example Day,
            Day, Day, Off, Night.
          </p>
          {rota.length ? (
            <div className="flex flex-wrap gap-2" aria-label="Department rota sequence">
              {rota.map((shiftType, index) => (
                <Badge key={`${shiftType}-${index}`} variant="secondary" className="gap-1 py-1 pl-2 pr-1">
                  <span className="text-muted-foreground">{index + 1}.</span>
                  {shiftLabels.get(shiftType) ?? shiftType}
                  <button
                    type="button"
                    className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                    onClick={() => setPendingRota(rota.filter((_, chipIndex) => chipIndex !== index))}
                    aria-label={`Remove ${shiftLabels.get(shiftType) ?? shiftType} from position ${index + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No repeating rota is configured for {departmentName}.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Add shift to sequence</Label>
            <div className="flex flex-wrap gap-2">
                  {availableShiftTypes.map((type) => (
                <Button key={type.value} type="button" size="sm" variant="outline" onClick={() => addShiftToRota(type.value)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {type.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Department Shift Overrides</CardTitle>
            <HelpPopover content="Configure which active facility shifts this department runs, their times, and its minimum or maximum coverage. Facility shift settings are used where no override exists." />
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Add Override
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : configs.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {departmentName} inherits all active facility shift settings.
            </p>
          ) : (
            <div className="space-y-2">
              {configs.map((config) => (
                <div key={config.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${config.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{config.display_label}</span>
                      {!config.is_active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {config.start_time.slice(0, 5)} - {config.end_time.slice(0, 5)} · min {config.min_staff}
                       {config.max_staff !== null ? ` / max ${config.max_staff}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(config)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive/60 hover:text-destructive" onClick={() => deleteMutation.mutate(config.id)} disabled={deleteMutation.isPending}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Department Shift Override' : 'Add Department Shift Override'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
             <div className="space-y-1.5"><Label>Shift Type</Label><Select value={form.shift_type} onValueChange={(value) => setForm((current) => ({ ...current, shift_type: value as DepartmentShiftConfigCreateData['shift_type'] }))} disabled={Boolean(editing)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{availableShiftTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Label</Label><Input className="h-9" value={form.label || ''} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Optional custom label" /></div>
            <div className="space-y-1.5"><Label>Start Time</Label><Input className="h-9" type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>End Time</Label><Input className="h-9" type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Minimum Coverage</Label><Input className="h-9" type="number" min={0} value={form.min_staff ?? 1} onChange={(event) => setForm((current) => ({ ...current, min_staff: Number(event.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>Maximum Coverage</Label><Input className="h-9" type="number" min={form.min_staff ?? 0} value={form.max_staff ?? ''} onChange={(event) => setForm((current) => ({ ...current, max_staff: event.target.value ? Number(event.target.value) : null }))} placeholder="Unlimited" /></div>
            <div className="flex items-center gap-2 sm:col-span-2"><Switch checked={form.is_active ?? true} onCheckedChange={(value) => setForm((current) => ({ ...current, is_active: value }))} /><Label>{form.is_active ? 'Active override' : 'Inactive override'}</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={!form.start_time || !form.end_time || createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Add'} Override</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
