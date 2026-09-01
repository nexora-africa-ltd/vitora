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
  Timer,
  Palette,
  Pencil,
  ArrowUp,
  ArrowDown,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpPopover } from '@/components/shared/help-popover';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  schedulingSettingsApi,
  staffConstraintsApi,
  resourcesApi,
  shiftTypeConfigsApi,
} from '@/lib/api/scheduling';
import type {
  SchedulingSettings,
  StaffConstraint,
  StaffConstraintCreateData,
  ConstraintType,
  ShiftTypeConfig,
  ShiftTypeConfigCreateData,
  ShiftType,
  AutofillWeights,
  AutofillGroupMinimumRule,
  AutofillGroupMaximumRule,
} from '@/lib/types/scheduling';

// =============================================================================
// Constants
// =============================================================================

const CONSTRAINT_OPTIONS: {
  value: ConstraintType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'NO_NIGHTS',
    label: 'Cannot work nights',
    description: 'Staff will not be assigned night shifts',
    icon: <Moon className="h-4 w-4" />,
  },
  {
    value: 'NO_WEEKENDS',
    label: 'Cannot work weekends',
    description: 'Staff will not be assigned Saturday/Sunday shifts',
    icon: <Clock className="h-4 w-4" />,
  },
  {
    value: 'MAX_HOURS',
    label: 'Custom max hours/week',
    description: 'Override facility max hours for this staff member',
    icon: <Clock className="h-4 w-4" />,
  },
  {
    value: 'MAX_CONSECUTIVE',
    label: 'Custom max consecutive days',
    description: 'Override facility consecutive-day limit',
    icon: <Clock className="h-4 w-4" />,
  },
  {
    value: 'PREFERRED_SHIFTS',
    label: 'Preferred shift types only',
    description: 'Only assign specific shift types',
    icon: <UserCog className="h-4 w-4" />,
  },
  {
    value: 'NO_OVERTIME',
    label: 'No overtime',
    description: 'Staff will not be assigned overtime shifts',
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  {
    value: 'LIGHT_DUTY',
    label: 'Light duty — days only',
    description: 'Only day/morning shifts (medical restriction)',
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  {
    value: 'NO_SHARED_SHIFT_WITH',
    label: 'Cannot share shift with',
    description:
      'Prevent this staff member from being scheduled on the same shift as selected staff.',
    icon: <ShieldAlert className="h-4 w-4" />,
  },
];

/** Working shift types eligible for auto-fill. Off/leave types are excluded. */
const WORKING_SHIFT_TYPES: { value: string; label: string }[] = [
  { value: 'DAY', label: 'Day' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'ON_CALL', label: 'On-Call' },
  { value: 'OVERTIME', label: 'Overtime' },
];

/** All shift types for the time configuration panel. */
const ALL_SHIFT_TYPES: { value: ShiftType; label: string }[] = [
  { value: 'DAY', label: 'Day Shift' },
  { value: 'NIGHT', label: 'Night Shift' },
  { value: 'MORNING', label: 'Morning Shift' },
  { value: 'AFTERNOON', label: 'Afternoon Shift' },
  { value: 'ON_CALL', label: 'On-Call' },
  { value: 'OVERTIME', label: 'Overtime' },
  { value: 'DAY_OFF', label: 'Day Off' },
  { value: 'NIGHT_OFF', label: 'Night Off' },
  { value: 'OFF', label: 'Off (Full Day)' },
  { value: 'AFTERNOON_OFF', label: 'Afternoon Off' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'SICK_LEAVE', label: 'Sick Leave' },
  { value: 'REST', label: 'Rest Day' },
];

const AUTOFILL_WEIGHT_FIELDS: Array<{
  key: keyof AutofillWeights;
  label: string;
  description: string;
  unit: string;
}> = [
  {
    key: 'weekly_load',
    label: 'Weekly Load Penalty',
    description: 'Penalty for staff already carrying more assignments this week.',
    unit: 'points per assigned shift',
  },
  {
    key: 'history_hours',
    label: 'Historical Hours Penalty',
    description: 'Penalty for staff with higher total historical worked hours.',
    unit: 'points per 8 historical hours',
  },
  {
    key: 'night_penalty',
    label: 'Night Burden Penalty',
    description: 'Penalty for staff with higher night-shift burden.',
    unit: 'points per current-week night shift',
  },
  {
    key: 'weekend_penalty',
    label: 'Weekend Burden Penalty',
    description: 'Penalty for staff with higher weekend burden.',
    unit: 'points per historical weekend shift',
  },
  {
    key: 'continuity_bonus',
    label: 'Continuity Bonus',
    description: 'Bonus when adjacent days keep a consistent shift type.',
    unit: 'points subtracted on same-type continuity',
  },
  {
    key: 'preferred_match_bonus',
    label: 'Preferred Shift Bonus',
    description: 'Bonus when assignment matches preferred shifts.',
    unit: 'points subtracted on preferred match',
  },
  {
    key: 'preferred_mismatch_penalty',
    label: 'Preferred Shift Penalty',
    description: 'Penalty when assignment does not match preferred shifts.',
    unit: 'points added on preferred mismatch',
  },
];

const DEFAULT_AUTOFILL_WEIGHTS: Record<keyof AutofillWeights, number> = {
  weekly_load: 30,
  history_hours: 4,
  night_penalty: 16,
  weekend_penalty: 3,
  continuity_bonus: 3,
  preferred_match_bonus: 8,
  preferred_mismatch_penalty: 6,
};

const AUTOFILL_MODE_OPTIONS = [
  {
    value: 'BALANCED_UTILIZATION',
    label: 'Balanced Utilization',
    description: 'Fill coverage, then add assignments to move staff toward target working days.',
  },
  {
    value: 'MIN_COVERAGE',
    label: 'Minimum Coverage',
    description: 'Fill only required coverage targets and stop.',
  },
] as const;

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
  const [newGroupRule, setNewGroupRule] = useState<AutofillGroupMinimumRule>({
    scope: 'DEPARTMENT',
    value: '',
    min_staff: 1,
    shift_types: ['DAY'],
  });
  const [newGroupMaxRule, setNewGroupMaxRule] = useState<AutofillGroupMaximumRule>({
    scope: 'DEPARTMENT',
    value: '',
    max_staff: 1,
    shift_types: ['NIGHT'],
  });

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
      queryClient.invalidateQueries({ queryKey: ['scheduling-settings-current'] });
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const hasSettingsChanges = Object.keys(settingsForm).length > 0;
  const currentAutofillWeights: Record<keyof AutofillWeights, number> = {
    ...DEFAULT_AUTOFILL_WEIGHTS,
    ...(settings?.autofill_weights || {}),
    ...((settingsForm.autofill_weights as AutofillWeights | undefined) || {}),
  };

  const updateAutofillWeight = (key: keyof AutofillWeights, rawValue: number) => {
    const value = Number.isFinite(rawValue) ? rawValue : DEFAULT_AUTOFILL_WEIGHTS[key] || 0;
    updateSetting('autofill_weights', {
      ...currentAutofillWeights,
      [key]: value,
    });
  };

  const currentActiveShiftTypes =
    (currentSettings.active_shift_types as string[] | undefined) ?? [];
  const currentDefaultShiftPattern =
    (currentSettings.default_shift_pattern as string[] | undefined) ?? [];
  const currentAutofillMode = currentSettings.autofill_mode ?? 'BALANCED_UTILIZATION';
  const currentAutofillTargetDays = currentSettings.autofill_target_days_per_staff ?? 4;
  const currentGroupMinimums =
    (currentSettings.autofill_group_minimums as AutofillGroupMinimumRule[] | undefined) ?? [];
  const currentGroupMaximums =
    (currentSettings.autofill_group_maximums as AutofillGroupMaximumRule[] | undefined) ?? [];

  const moveDefaultPatternItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentDefaultShiftPattern.length) return;
    const next = [...currentDefaultShiftPattern];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(nextIndex, 0, item);
    updateSetting('default_shift_pattern', next);
  };

  const addDefaultPatternType = (shiftType: string) => {
    if (currentDefaultShiftPattern.includes(shiftType)) return;
    updateSetting('default_shift_pattern', [...currentDefaultShiftPattern, shiftType]);
  };

  const removeDefaultPatternType = (shiftType: string) => {
    updateSetting(
      'default_shift_pattern',
      currentDefaultShiftPattern.filter((t) => t !== shiftType)
    );
  };

  const addGroupMinimumRule = () => {
    const value = newGroupRule.value.trim();
    if (!value) {
      toast.error('Enter a department or role value');
      return;
    }
    if (newGroupRule.shift_types.length === 0) {
      toast.error('Select at least one shift type for the rule');
      return;
    }
    const nextRule: AutofillGroupMinimumRule = {
      ...newGroupRule,
      value,
      min_staff: Math.max(1, Math.round(newGroupRule.min_staff || 1)),
    };
    updateSetting('autofill_group_minimums', [...currentGroupMinimums, nextRule]);
    setNewGroupRule((prev) => ({ ...prev, value: '' }));
  };

  const removeGroupMinimumRule = (index: number) => {
    updateSetting(
      'autofill_group_minimums',
      currentGroupMinimums.filter((_, i) => i !== index)
    );
  };

  const addGroupMaximumRule = () => {
    const value = newGroupMaxRule.value.trim();
    if (!value) {
      toast.error('Enter a department or role value');
      return;
    }
    if (newGroupMaxRule.shift_types.length === 0) {
      toast.error('Select at least one shift type for the rule');
      return;
    }
    const nextRule: AutofillGroupMaximumRule = {
      ...newGroupMaxRule,
      value,
      max_staff: Math.max(1, Math.round(newGroupMaxRule.max_staff || 1)),
    };
    updateSetting('autofill_group_maximums', [...currentGroupMaximums, nextRule]);
    setNewGroupMaxRule((prev) => ({ ...prev, value: '' }));
  };

  const removeGroupMaximumRule = (index: number) => {
    updateSetting(
      'autofill_group_maximums',
      currentGroupMaximums.filter((_, i) => i !== index)
    );
  };

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
  const availableDepartmentOptions = Array.from(
    new Set(staffList.map((staff) => (staff.department_name ?? '').trim()).filter((name) => !!name))
  ).sort((a, b) => a.localeCompare(b));
  const availableRoleOptions = Array.from(
    new Set(
      staffList
        .map((staff) => {
          const metadata = staff.metadata as Record<string, unknown> | undefined;
          return String(
            (metadata?.role as string | undefined) ??
              (metadata?.staff_role as string | undefined) ??
              (metadata?.job_title as string | undefined) ??
              ''
          ).trim();
        })
        .filter((name) => !!name)
    )
  ).sort((a, b) => a.localeCompare(b));
  const currentScopeOptions =
    newGroupRule.scope === 'DEPARTMENT' ? availableDepartmentOptions : availableRoleOptions;
  const currentMaxScopeOptions =
    newGroupMaxRule.scope === 'DEPARTMENT' ? availableDepartmentOptions : availableRoleOptions;
  // Add constraint dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newConstraint, setNewConstraint] = useState<StaffConstraintCreateData>({
    staff_resource: 0,
    constraint_type: 'NO_NIGHTS',
    reason: '',
  });
  const shareWithOptions = staffList.filter((staff) => staff.id !== newConstraint.staff_resource);

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
  // Shift Type Configurations
  // ---------------------------------------------------------------------------

  const { data: shiftTypeConfigsData, isLoading: configsLoading } = useQuery({
    queryKey: ['shift-type-configs'],
    queryFn: () => shiftTypeConfigsApi.list(),
  });
  const shiftTypeConfigs = shiftTypeConfigsData?.results ?? [];

  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ShiftTypeConfig | null>(null);
  const [configForm, setConfigForm] = useState<ShiftTypeConfigCreateData>({
    shift_type: 'DAY',
    label: '',
    start_time: '08:00',
    end_time: '16:00',
    color: '',
    is_active: true,
  });

  const openAddConfig = () => {
    const defaultShiftType = availableTypes[0]?.value ?? 'DAY';
    if (availableTypes.length === 0) {
      toast.info('All active shift types already have time configurations');
      return;
    }
    setEditingConfig(null);
    setConfigForm({
      shift_type: defaultShiftType,
      label: '',
      start_time: '08:00',
      end_time: '16:00',
      color: '',
      is_active: true,
    });
    setShowConfigDialog(true);
  };

  const openEditConfig = (cfg: ShiftTypeConfig) => {
    setEditingConfig(cfg);
    setConfigForm({
      shift_type: cfg.shift_type,
      label: cfg.label,
      start_time: cfg.start_time.slice(0, 5), // HH:MM
      end_time: cfg.end_time.slice(0, 5),
      color: cfg.color,
      is_active: cfg.is_active,
    });
    setShowConfigDialog(true);
  };

  const configuredTypes = shiftTypeConfigs.map((c) => c.shift_type);
  const activeTypes = currentActiveShiftTypes as ShiftType[];
  const activeTypeSet = new Set<ShiftType>(activeTypes);
  const availableTypes = ALL_SHIFT_TYPES.filter((t) => {
    const isConfigured = configuredTypes.includes(t.value);
    const isEditingCurrent = editingConfig?.shift_type === t.value;
    const isActiveOrUnrestricted = activeTypeSet.size === 0 || activeTypeSet.has(t.value);
    return (!isConfigured || isEditingCurrent) && (isActiveOrUnrestricted || isEditingCurrent);
  });

  const createConfigMutation = useMutation({
    mutationFn: (data: ShiftTypeConfigCreateData) => shiftTypeConfigsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-type-configs'] });
      setShowConfigDialog(false);
      toast.success('Shift time saved');
    },
    onError: () => toast.error('Failed to save shift time configuration'),
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ShiftTypeConfigCreateData> }) =>
      shiftTypeConfigsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-type-configs'] });
      setShowConfigDialog(false);
      toast.success('Shift time updated');
    },
    onError: () => toast.error('Failed to update shift time configuration'),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: number) => shiftTypeConfigsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-type-configs'] });
      toast.success('Shift time removed');
    },
    onError: () => toast.error('Failed to remove shift time configuration'),
  });

  const handleSaveConfig = () => {
    if (editingConfig) {
      updateConfigMutation.mutate({ id: editingConfig.id, data: configForm });
    } else {
      createConfigMutation.mutate(configForm);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = settingsLoading || constraintsLoading || configsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster Settings"
        helpContent="Configure scheduling rules for the duty roster. These settings apply to all staff unless overridden by individual constraints."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/scheduling/roster">
                <ArrowLeft className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Back to Roster</span>
              </Link>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="max-hours" className="text-sm">
                    Max hours per week
                  </Label>
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
                  <Label htmlFor="max-consecutive" className="text-sm">
                    Max consecutive days
                  </Label>
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
                  <Label htmlFor="min-rest" className="text-sm">
                    Min rest hours between shifts
                  </Label>
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
                  <Label htmlFor="max-nights" className="text-sm">
                    Max night shifts per week
                  </Label>
                  <Input
                    id="max-nights"
                    type="number"
                    min={0}
                    max={7}
                    value={currentSettings.max_night_shifts_per_week ?? 4}
                    onChange={(e) =>
                      updateSetting('max_night_shifts_per_week', Number(e.target.value))
                    }
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-day-hours" className="text-sm">
                    Max day shift hours
                  </Label>
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
                  <Label htmlFor="max-night-hours" className="text-sm">
                    Max night shift hours
                  </Label>
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
                  <Label htmlFor="overtime-threshold" className="text-sm">
                    Overtime threshold (hours)
                  </Label>
                  <Input
                    id="overtime-threshold"
                    type="number"
                    min={0}
                    max={168}
                    step={0.5}
                    value={currentSettings.overtime_threshold_hours ?? 40}
                    onChange={(e) =>
                      updateSetting('overtime_threshold_hours', Number(e.target.value))
                    }
                    className="h-9"
                  />
                </div>

                <div className="flex items-end pb-1">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex w-fit cursor-default items-center gap-2">
                          <Switch
                            checked={currentSettings.enforce_constraints ?? true}
                            onCheckedChange={(v) => updateSetting('enforce_constraints', v)}
                          />
                          <span className="text-sm font-medium">
                            {currentSettings.enforce_constraints
                              ? 'Constraints enforced'
                              : 'Constraints disabled'}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Switch to {currentSettings.enforce_constraints ? 'disable' : 'enable'}{' '}
                          constraint warnings
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Punctuality Enforcement */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Punctuality Enforcement</CardTitle>
                <HelpPopover content="When enabled, staff cannot clock in if they are more than the specified number of minutes late. Users with manage_schedules permission (supervisors/admins) can still override this restriction." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex w-fit cursor-default items-center gap-2">
                        <Switch
                          checked={currentSettings.enforce_punctuality ?? false}
                          onCheckedChange={(v) => updateSetting('enforce_punctuality', v)}
                        />
                        <span className="text-sm font-medium">
                          {currentSettings.enforce_punctuality
                            ? 'Punctuality enforced'
                            : 'Punctuality not enforced'}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Switch to {currentSettings.enforce_punctuality ? 'disable' : 'enable'} late
                        clock-in blocking
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {currentSettings.enforce_punctuality && (
                  <div className="space-y-1.5">
                    <Label>Late cutoff (minutes)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      step={5}
                      value={currentSettings.late_cutoff_minutes ?? 30}
                      onChange={(e) => updateSetting('late_cutoff_minutes', Number(e.target.value))}
                      className="h-9 w-[150px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Staff will be blocked from clocking in after{' '}
                      {currentSettings.late_cutoff_minutes ?? 30} minutes past their shift start.
                      Supervisors and admins can override this.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Shift Types for Auto-Fill */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Active Shift Types</CardTitle>
                <HelpPopover content="Auto-fill mode priority: (1) Active Shift Types, (2) Default Shift Pattern, (3) disabled if both are empty. Active Shift Types are used for full coverage mode, while Default Shift Pattern is a fallback ordered preference list." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Select the shift types your facility operates. When set, auto-fill ensures every
                  day has staff assigned to each active type.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {WORKING_SHIFT_TYPES.map((st) => {
                    const isChecked = currentActiveShiftTypes.includes(st.value);
                    return (
                      <label
                        key={st.value}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors ${
                          isChecked
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const current = [...currentActiveShiftTypes];
                            if (checked) {
                              current.push(st.value);
                            } else {
                              const idx = current.indexOf(st.value);
                              if (idx >= 0) current.splice(idx, 1);
                            }
                            updateSetting('active_shift_types', current);
                          }}
                        />
                        <span className="text-sm font-medium">{st.label}</span>
                      </label>
                    );
                  })}
                </div>
                {currentActiveShiftTypes.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {currentActiveShiftTypes.length} type(s) active
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Auto-fill will cover: {currentActiveShiftTypes.join(', ')}
                    </span>
                  </div>
                )}

                <div className="space-y-3 border-t pt-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Default Shift Pattern (Fallback)</Label>
                    <HelpPopover content="Used only when Active Shift Types is empty. The order is kept as your fallback preference and applied to weekly auto-fill when no active types are configured." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configure this fallback so auto-fill remains available even if no active shift
                    types are selected.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {WORKING_SHIFT_TYPES.filter(
                      (st) => !currentDefaultShiftPattern.includes(st.value)
                    ).map((st) => (
                      <Button
                        key={`add-${st.value}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => addDefaultPatternType(st.value)}
                      >
                        + {st.label}
                      </Button>
                    ))}
                  </div>

                  {currentDefaultShiftPattern.length === 0 ? (
                    <p className="text-xs text-amber-600">
                      No fallback pattern configured. Auto-fill will be disabled when active shift
                      types are empty.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {currentDefaultShiftPattern.map((type, index) => {
                        const label =
                          WORKING_SHIFT_TYPES.find((st) => st.value === type)?.label ?? type;
                        return (
                          <div
                            key={`${type}-${index}`}
                            className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
                          >
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="secondary" className="text-[10px]">
                                {index + 1}
                              </Badge>
                              <span className="font-medium">{label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => moveDefaultPatternItem(index, -1)}
                                disabled={index === 0}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => moveDefaultPatternItem(index, 1)}
                                disabled={index === currentDefaultShiftPattern.length - 1}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive/70 hover:text-destructive"
                                onClick={() => removeDefaultPatternType(type)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Global Autofill Rules</CardTitle>
                <HelpPopover content="These rules control coverage and utilization. Group minimum rules set required staffing from specific departments/roles per shift type, while group maximum rules cap over-concentration on a shift. Balanced Utilization mode adds extra assignments toward target days per staff; Minimum Coverage mode stops after required coverage is met." />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">Autofill Mode</Label>
                  <Select
                    value={currentAutofillMode}
                    onValueChange={(v) =>
                      updateSetting('autofill_mode', v as SchedulingSettings['autofill_mode'])
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTOFILL_MODE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {
                      AUTOFILL_MODE_OPTIONS.find((opt) => opt.value === currentAutofillMode)
                        ?.description
                    }
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Target Working Days / Staff (weekly)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={7}
                    step={1}
                    value={currentAutofillTargetDays}
                    onChange={(e) =>
                      updateSetting('autofill_target_days_per_staff', Number(e.target.value))
                    }
                    className="h-9"
                    disabled={currentAutofillMode !== 'BALANCED_UTILIZATION'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in Balanced Utilization mode to reduce excessive OFF/REST outcomes.
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Group Minimum Rules</Label>
                  <HelpPopover content="Guarantee minimum staffing from a specific department or role per day and shift type. These rules are applied as required autofill slots before general balancing." />
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <Select
                    value={newGroupRule.scope}
                    onValueChange={(v) =>
                      setNewGroupRule((prev) => ({
                        ...prev,
                        scope: v as 'DEPARTMENT' | 'ROLE',
                        value: '',
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEPARTMENT">Department</SelectItem>
                      <SelectItem value="ROLE">Role</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={newGroupRule.value || '_none'}
                    onValueChange={(v) =>
                      setNewGroupRule((prev) => ({ ...prev, value: v === '_none' ? '' : v }))
                    }
                    disabled={currentScopeOptions.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          newGroupRule.scope === 'DEPARTMENT' ? 'Select department' : 'Select role'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Select...</SelectItem>
                      {currentScopeOptions.map((option) => (
                        <SelectItem key={`${newGroupRule.scope}-${option}`} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={newGroupRule.min_staff}
                    onChange={(e) =>
                      setNewGroupRule((prev) => ({ ...prev, min_staff: Number(e.target.value) }))
                    }
                    className="h-9"
                  />
                  <Button type="button" className="h-9" onClick={addGroupMinimumRule}>
                    Add Rule
                  </Button>
                </div>
                {currentScopeOptions.length === 0 && (
                  <p className="text-xs text-amber-600">
                    No {newGroupRule.scope === 'DEPARTMENT' ? 'departments' : 'roles'} found on
                    staff resources yet.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {WORKING_SHIFT_TYPES.map((st) => {
                    const selected = newGroupRule.shift_types.includes(st.value);
                    return (
                      <Button
                        key={`new-rule-shift-${st.value}`}
                        type="button"
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => {
                          const next = selected
                            ? newGroupRule.shift_types.filter((t) => t !== st.value)
                            : [...newGroupRule.shift_types, st.value];
                          setNewGroupRule((prev) => ({ ...prev, shift_types: next }));
                        }}
                      >
                        {st.label}
                      </Button>
                    );
                  })}
                </div>

                {currentGroupMinimums.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No department/role minimum rules configured.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {currentGroupMinimums.map((rule, index) => (
                      <div
                        key={`group-rule-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2"
                      >
                        <div className="text-xs">
                          <span className="font-medium">
                            {rule.scope === 'DEPARTMENT' ? 'Dept' : 'Role'}: {rule.value}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            {' • '}min {rule.min_staff} {' • '} {rule.shift_types.join(', ')}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive"
                          onClick={() => removeGroupMinimumRule(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Group Maximum Rules</Label>
                  <HelpPopover content="Limit over-concentration by capping how many staff from a specific department or role can be placed on the same shift and day." />
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <Select
                    value={newGroupMaxRule.scope}
                    onValueChange={(v) =>
                      setNewGroupMaxRule((prev) => ({
                        ...prev,
                        scope: v as 'DEPARTMENT' | 'ROLE',
                        value: '',
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEPARTMENT">Department</SelectItem>
                      <SelectItem value="ROLE">Role</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={newGroupMaxRule.value || '_none'}
                    onValueChange={(v) =>
                      setNewGroupMaxRule((prev) => ({ ...prev, value: v === '_none' ? '' : v }))
                    }
                    disabled={currentMaxScopeOptions.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          newGroupMaxRule.scope === 'DEPARTMENT'
                            ? 'Select department'
                            : 'Select role'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Select...</SelectItem>
                      {currentMaxScopeOptions.map((option) => (
                        <SelectItem key={`${newGroupMaxRule.scope}-${option}`} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={newGroupMaxRule.max_staff}
                    onChange={(e) =>
                      setNewGroupMaxRule((prev) => ({ ...prev, max_staff: Number(e.target.value) }))
                    }
                    className="h-9"
                  />
                  <Button type="button" className="h-9" onClick={addGroupMaximumRule}>
                    Add Cap
                  </Button>
                </div>
                {currentMaxScopeOptions.length === 0 && (
                  <p className="text-xs text-amber-600">
                    No {newGroupMaxRule.scope === 'DEPARTMENT' ? 'departments' : 'roles'} found on
                    staff resources yet.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {WORKING_SHIFT_TYPES.map((st) => {
                    const selected = newGroupMaxRule.shift_types.includes(st.value);
                    return (
                      <Button
                        key={`new-cap-shift-${st.value}`}
                        type="button"
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => {
                          const next = selected
                            ? newGroupMaxRule.shift_types.filter((t) => t !== st.value)
                            : [...newGroupMaxRule.shift_types, st.value];
                          setNewGroupMaxRule((prev) => ({ ...prev, shift_types: next }));
                        }}
                      >
                        {st.label}
                      </Button>
                    );
                  })}
                </div>

                {currentGroupMaximums.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No department/role maximum rules configured.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {currentGroupMaximums.map((rule, index) => (
                      <div
                        key={`group-cap-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2"
                      >
                        <div className="text-xs">
                          <span className="font-medium">
                            {rule.scope === 'DEPARTMENT' ? 'Dept' : 'Role'}: {rule.value}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            {' • '}max {rule.max_staff} {' • '} {rule.shift_types.join(', ')}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive"
                          onClick={() => removeGroupMaximumRule(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Autofill Weights</CardTitle>
                <HelpPopover content="These weights tune the weekly roster auto-fill scorer. Penalty means points are added to a candidate score (higher score = less likely assignment). Bonus means points are subtracted (lower score = more likely assignment). Example: if Nurse A has more current shifts, a higher weekly-load penalty pushes Nurse A down; if a shift matches Nurse B's preference, the preferred-match bonus boosts Nurse B up." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {AUTOFILL_WEIGHT_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-sm">{field.label}</Label>
                    <Input
                      type="number"
                      step={0.5}
                      value={currentAutofillWeights[field.key] ?? 0}
                      onChange={(e) => updateAutofillWeight(field.key, Number(e.target.value))}
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">Unit: {field.unit}</p>
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Shift Type Time Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Shift Times</CardTitle>
                  <HelpPopover content="Configure default start and end times for each shift type at this facility. When creating shifts on the roster, times will auto-populate based on these settings." />
                  <Badge variant="secondary" className="text-xs">
                    {shiftTypeConfigs.length}
                  </Badge>
                </div>
                <Button size="sm" onClick={openAddConfig}>
                  <Plus className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Add Shift Time</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {shiftTypeConfigs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Clock className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm font-medium">No shift times configured</p>
                  <p className="mt-1 text-xs">
                    Add shift type times so the roster auto-populates start/end times.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shiftTypeConfigs.map((cfg) => (
                    <div
                      key={cfg.id}
                      className={`relative flex items-center justify-between gap-2 rounded-lg border p-3 transition-colors ${
                        cfg.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {cfg.color && (
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: cfg.color }}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {cfg.display_label}
                            </span>
                            {!cfg.is_active && (
                              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                Off
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {cfg.start_time.slice(0, 5)} – {cfg.end_time.slice(0, 5)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEditConfig(cfg)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive/60 hover:text-destructive"
                          onClick={() => deleteConfigMutation.mutate(cfg.id)}
                          disabled={deleteConfigMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  <Badge variant="secondary" className="text-xs">
                    {constraints.length}
                  </Badge>
                </div>
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Add Constraint</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {constraints.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm font-medium">No staff constraints configured</p>
                  <p className="mt-1 text-xs">
                    Add constraints to enforce individual scheduling rules.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {constraints.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                        c.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{c.staff_resource_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {c.constraint_type_display}
                            </Badge>
                          </div>
                          {c.reason && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {c.reason}
                            </p>
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

          <div className="sticky bottom-3 z-20">
            <Card className="border-primary/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <p className="text-xs text-muted-foreground">
                  {hasSettingsChanges
                    ? 'You have unsaved settings changes.'
                    : 'All settings are saved.'}
                </p>
                <Button
                  size="sm"
                  onClick={() => settingsMutation.mutate()}
                  disabled={!hasSettingsChanges || settingsMutation.isPending}
                >
                  {settingsMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-4 w-4" />
                  )}
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </div>
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
                onValueChange={(v) =>
                  setNewConstraint((p) => ({ ...p, staff_resource: Number(v) }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select staff..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Constraint Type</Label>
              <Select
                value={newConstraint.constraint_type}
                onValueChange={(v) =>
                  setNewConstraint((p) => ({
                    ...p,
                    constraint_type: v as ConstraintType,
                    value: {},
                  }))
                }
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
                {
                  CONSTRAINT_OPTIONS.find((o) => o.value === newConstraint.constraint_type)
                    ?.description
                }
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
                    setNewConstraint((p) => ({
                      ...p,
                      value: { max_hours: Number(e.target.value) },
                    }))
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
                    setNewConstraint((p) => ({
                      ...p,
                      value: { max_consecutive: Number(e.target.value) },
                    }))
                  }
                  className="h-9"
                />
              </div>
            )}

            {newConstraint.constraint_type === 'NO_SHARED_SHIFT_WITH' && (
              <div className="space-y-1.5">
                <Label className="text-sm">Cannot share with</Label>
                <Select
                  value={String(
                    (newConstraint.value as Record<string, number>)?.staff_resource_id ?? ''
                  )}
                  onValueChange={(v) =>
                    setNewConstraint((p) => ({ ...p, value: { staff_resource_id: Number(v) } }))
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select staff..." />
                  </SelectTrigger>
                  <SelectContent>
                    {shareWithOptions.map((s) => (
                      <SelectItem key={`share-with-${s.id}`} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              disabled={
                !newConstraint.staff_resource ||
                createMutation.isPending ||
                (newConstraint.constraint_type === 'NO_SHARED_SHIFT_WITH' &&
                  !Number((newConstraint.value as Record<string, number>)?.staff_resource_id || 0))
              }
            >
              {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Add Constraint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Shift Time Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingConfig ? 'Edit Shift Time' : 'Add Shift Time'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Shift Type</Label>
              <Select
                value={configForm.shift_type}
                onValueChange={(v) => setConfigForm((p) => ({ ...p, shift_type: v as ShiftType }))}
                disabled={!!editingConfig}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Custom Label (optional)</Label>
              <Input
                placeholder="e.g. Early Morning, Night Duty"
                value={configForm.label || ''}
                onChange={(e) => setConfigForm((p) => ({ ...p, label: e.target.value }))}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">Leave empty to use the default name.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Start Time</Label>
                <Input
                  type="time"
                  value={configForm.start_time}
                  onChange={(e) => setConfigForm((p) => ({ ...p, start_time: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">End Time</Label>
                <Input
                  type="time"
                  value={configForm.end_time}
                  onChange={(e) => setConfigForm((p) => ({ ...p, end_time: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Palette className="h-3.5 w-3.5" />
                Color (optional)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={configForm.color || '#3b82f6'}
                  onChange={(e) => setConfigForm((p) => ({ ...p, color: e.target.value }))}
                  className="h-9 w-12 cursor-pointer p-1"
                />
                <Input
                  placeholder="#3b82f6"
                  value={configForm.color || ''}
                  onChange={(e) => setConfigForm((p) => ({ ...p, color: e.target.value }))}
                  className="h-9 flex-1"
                />
                {configForm.color && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-xs"
                    onClick={() => setConfigForm((p) => ({ ...p, color: '' }))}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex w-fit cursor-default items-center gap-2">
                    <Switch
                      checked={configForm.is_active ?? true}
                      onCheckedChange={(v) => setConfigForm((p) => ({ ...p, is_active: v }))}
                    />
                    <span className="text-sm font-medium">
                      {configForm.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Switch to {configForm.is_active ? 'deactivate' : 'activate'} this shift type
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={
                !configForm.start_time ||
                !configForm.end_time ||
                createConfigMutation.isPending ||
                updateConfigMutation.isPending
              }
            >
              {(createConfigMutation.isPending || updateConfigMutation.isPending) && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {editingConfig ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
