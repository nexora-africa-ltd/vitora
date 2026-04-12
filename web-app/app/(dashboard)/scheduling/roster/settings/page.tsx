'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  Settings,
  UserCog,
  Clock,
  Moon,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpPopover } from '@/components/shared/help-popover';
import { toast } from 'sonner';
import { schedulingSettingsApi, staffConstraintsApi, resourcesApi } from '@/lib/api/scheduling';
import type { SchedulingSettings, StaffConstraint, StaffConstraintCreateData, ConstraintType } from '@/lib/types/scheduling';

// =============================================================================
// Constants
// =============================================================================

const CONSTRAINT_OPTIONS: { value: ConstraintType; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'NO_NIGHTS', label: 'Cannot work nights', description: 'Staff will not be assigned night shifts', icon: <Moon className="h-4 w-4" /> },
  { value: 'NO_WEEKENDS', label: 'Cannot work weekends', description: 'Staff will not be assigned Saturday/Sunday shifts', icon: <Clock className="h-4 w-4" /> },
  { value: 'MAX_HOURS', label: 'Custom max hours/week', description: 'Override facility max hours for this staff member', icon: <Clock className="h-4 w-4" /> },
  { value: 'MAX_CONSECUTIVE', label: 'Custom max consecutive days', description: 'Override facility consecutive-day limit', icon: <Clock className="h-4 w-4" /> },
  { value: 'PREFERRED_SHIFTS', label: 'Preferred shift types only', description: 'Only assign specific shift types', icon: <UserCog className="h-4 w-4" /> },
  { value: 'NO_OVERTIME', label: 'No overtime', description: 'Staff will not be assigned overtime shifts', icon: <ShieldAlert className="h-4 w-4" /> },
  { value: 'LIGHT_DUTY', label: 'Light duty — days only', description: 'Only day/morning shifts (medical restriction)', icon: <ShieldAlert className="h-4 w-4" /> },
];

// =============================================================================
// Component
// =============================================================================

export default function RosterSettingsPage() {
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['scheduling-settings'],
    queryFn: () => schedulingSettingsApi.getCurrent(),
  });

  const [settingsForm, setSettingsForm] = useState<Partial<SchedulingSettings>>({});

  // Merge fetched data with local edits
  const currentSettings = { ...settings, ...settingsForm };

  const updateSetting = (key: keyof SchedulingSettings, value: unknown) => {
    setSettingsForm((prev) => ({ ...prev, [key]: value }));
  };

  const settingsMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) return;
      return schedulingSettingsApi.update(settings.id, settingsForm);
    },
    onSuccess: () => {
      setSettingsForm({});
      queryClient.invalidateQueries({ queryKey: ['scheduling-settings'] });
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const hasSettingsChanges = Object.keys(settingsForm).length > 0;

  // ---------------------------------------------------------------------------
  // Constraints
  // ---------------------------------------------------------------------------

  const { data: constraintsData, isLoading: constraintsLoading } = useQuery({
    queryKey: ['staff-constraints'],
    queryFn: () => staffConstraintsApi.list({ page_size: 200 }),
  });
  const constraints = constraintsData?.results ?? [];

  const { data: staffData } = useQuery({
    queryKey: ['scheduling-resources-person'],
    queryFn: () => resourcesApi.list({ resource_type: 'PERSON', page_size: 200, ordering: 'name' }),
  });
  const staffList = staffData?.results ?? [];

  // Add constraint dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newConstraint, setNewConstraint] = useState<StaffConstraintCreateData>({
    staff_resource: 0,
    constraint_type: 'NO_NIGHTS',
    reason: '',
  });

  const createMutation = useMutation({
    mutationFn: (data: StaffConstraintCreateData) => staffConstraintsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-constraints'] });
      setShowAddDialog(false);
      setNewConstraint({ staff_resource: 0, constraint_type: 'NO_NIGHTS', reason: '' });
      toast.success('Constraint added');
    },
    onError: () => toast.error('Failed to add constraint'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => staffConstraintsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-constraints'] });
      toast.success('Constraint removed');
    },
    onError: () => toast.error('Failed to remove constraint'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      staffConstraintsApi.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-constraints'] });
    },
    onError: () => toast.error('Failed to update constraint'),
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = settingsLoading || constraintsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster Settings"
        helpContent="Configure scheduling rules for the duty roster. These settings apply to all staff unless overridden by individual constraints."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/scheduling/roster">
                <ArrowLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Back to Roster</span>
              </Link>
            </Button>
            {hasSettingsChanges && (
              <Button
                size="sm"
                onClick={() => settingsMutation.mutate()}
                disabled={settingsMutation.isPending}
              >
                {settingsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Settings
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings...
        </div>
      ) : (
        <>
          {/* Global Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Global Scheduling Rules</CardTitle>
                <HelpPopover content="These rules apply to all staff by default. Individual staff can have overrides via constraints below." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="max-hours" className="text-sm">Max hours per week</Label>
                  <Input
                    id="max-hours"
                    type="number"
                    min={1}
                    max={168}
                    value={currentSettings.max_hours_per_week ?? 48}
                    onChange={(e) => updateSetting('max_hours_per_week', Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-consecutive" className="text-sm">Max consecutive days</Label>
                  <Input
                    id="max-consecutive"
                    type="number"
                    min={1}
                    max={14}
                    value={currentSettings.max_consecutive_days ?? 6}
                    onChange={(e) => updateSetting('max_consecutive_days', Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="min-rest" className="text-sm">Min rest hours between shifts</Label>
                  <Input
                    id="min-rest"
                    type="number"
                    min={0}
                    max={24}
                    value={currentSettings.min_rest_hours ?? 11}
                    onChange={(e) => updateSetting('min_rest_hours', Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-nights" className="text-sm">Max night shifts per week</Label>
                  <Input
                    id="max-nights"
                    type="number"
                    min={0}
                    max={7}
                    value={currentSettings.max_night_shifts_per_week ?? 4}
                    onChange={(e) => updateSetting('max_night_shifts_per_week', Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-day-hours" className="text-sm">Max day shift hours</Label>
                  <Input
                    id="max-day-hours"
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={currentSettings.max_day_hours ?? 12}
                    onChange={(e) => updateSetting('max_day_hours', Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-night-hours" className="text-sm">Max night shift hours</Label>
                  <Input
                    id="max-night-hours"
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={currentSettings.max_night_hours ?? 12}
                    onChange={(e) => updateSetting('max_night_hours', Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="overtime-threshold" className="text-sm">Overtime threshold (hours)</Label>
                  <Input
                    id="overtime-threshold"
                    type="number"
                    min={0}
                    max={168}
                    step={0.5}
                    value={currentSettings.overtime_threshold_hours ?? 40}
                    onChange={(e) => updateSetting('overtime_threshold_hours', Number(e.target.value))}
                    className="h-9"
                  />
                </div>

                <div className="flex items-end pb-1">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 w-fit cursor-default">
                          <Switch
                            checked={currentSettings.enforce_constraints ?? true}
                            onCheckedChange={(v) => updateSetting('enforce_constraints', v)}
                          />
                          <span className="text-sm font-medium">
                            {currentSettings.enforce_constraints ? 'Constraints enforced' : 'Constraints disabled'}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Switch to {currentSettings.enforce_constraints ? 'disable' : 'enable'} constraint warnings</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Staff Constraints */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCog className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Staff Constraints</CardTitle>
                  <HelpPopover content="Add per-staff rules that override global settings. For example, prevent a staff member from working night shifts or set a custom max hours limit." />
                  <Badge variant="secondary" className="text-xs">{constraints.length}</Badge>
                </div>
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Add Constraint</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {constraints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">No staff constraints configured</p>
                  <p className="text-xs mt-1">Add constraints to enforce individual scheduling rules.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {constraints.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                        c.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{c.staff_resource_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {c.constraint_type_display}
                            </Badge>
                          </div>
                          {c.reason && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{c.reason}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive/60 hover:text-destructive"
                        onClick={() => deleteMutation.mutate(c.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Add Constraint Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Staff Constraint</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Staff Member</Label>
              <Select
                value={newConstraint.staff_resource ? String(newConstraint.staff_resource) : ''}
                onValueChange={(v) => setNewConstraint((p) => ({ ...p, staff_resource: Number(v) }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select staff..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Constraint Type</Label>
              <Select
                value={newConstraint.constraint_type}
                onValueChange={(v) => setNewConstraint((p) => ({ ...p, constraint_type: v as ConstraintType }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSTRAINT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        {opt.icon}
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CONSTRAINT_OPTIONS.find((o) => o.value === newConstraint.constraint_type)?.description}
              </p>
            </div>

            {newConstraint.constraint_type === 'MAX_HOURS' && (
              <div className="space-y-1.5">
                <Label className="text-sm">Max hours per week</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={(newConstraint.value as Record<string, number>)?.max_hours ?? 36}
                  onChange={(e) =>
                    setNewConstraint((p) => ({ ...p, value: { max_hours: Number(e.target.value) } }))
                  }
                  className="h-9"
                />
              </div>
            )}

            {newConstraint.constraint_type === 'MAX_CONSECUTIVE' && (
              <div className="space-y-1.5">
                <Label className="text-sm">Max consecutive days</Label>
                <Input
                  type="number"
                  min={1}
                  max={14}
                  value={(newConstraint.value as Record<string, number>)?.max_consecutive ?? 4}
                  onChange={(e) =>
                    setNewConstraint((p) => ({ ...p, value: { max_consecutive: Number(e.target.value) } }))
                  }
                  className="h-9"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">Reason (optional)</Label>
              <Input
                placeholder="e.g. Medical restriction, personal request"
                value={newConstraint.reason || ''}
                onChange={(e) => setNewConstraint((p) => ({ ...p, reason: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newConstraint)}
              disabled={!newConstraint.staff_resource || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add Constraint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
