'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Phone,
  Timer,
  AlertCircle,
  CheckCircle2,
  Printer,
  Wand2,
  SunMedium,
  MoonStar,
  CalendarOff,
  Palmtree,
  Thermometer,
  Coffee,
  Settings,
  Trash2,
  MoreVertical,
  MessageSquare,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from 'sonner';
import {
  appointmentsApi,
  resourcesApi,
  shiftsApi,
  staffConstraintsApi,
  schedulingSettingsApi,
  shiftTypeConfigsApi,
} from '@/lib/api/scheduling';
import { departmentsApi } from '@/lib/api/rbac';
import { QRCodeDisplay } from '@/components/scheduling/qr-clock-in';
import type {
  ShiftType,
  ShiftListItem,
  ShiftCreateData,
  ResourceListItem,
  CrossFacilityConflict,
  AutofillRun,
  AutofillWeights,
  AutofillGroupMinimumRule,
  AutofillGroupMaximumRule,
  AutofillPlan,
} from '@/lib/types/scheduling';
import { printRoster, SHIFT_PRINT_COLORS, type RosterStaffRow } from '@/lib/documents/print-roster';
import { CommentThread } from '@/components/comments/comment-thread';

// =============================================================================
// Constants
// =============================================================================

const SHIFT_TYPES: {
  value: ShiftType;
  label: string;
  short: string;
  icon: React.ReactNode;
  color: string;
  start: string;
  end: string;
  isOff?: boolean;
}[] = [
  // Working shifts
  {
    value: 'DAY',
    label: 'Day',
    short: 'D',
    icon: <Sun className="h-3 w-3" />,
    color:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    start: '07:00',
    end: '19:00',
  },
  {
    value: 'NIGHT',
    label: 'Night',
    short: 'N',
    icon: <Moon className="h-3 w-3" />,
    color:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
    start: '19:00',
    end: '07:00',
  },
  {
    value: 'MORNING',
    label: 'Morning',
    short: 'M',
    icon: <Sunrise className="h-3 w-3" />,
    color:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-700',
    start: '06:00',
    end: '14:00',
  },
  {
    value: 'AFTERNOON',
    label: 'Afternoon',
    short: 'A',
    icon: <Sunset className="h-3 w-3" />,
    color:
      'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    start: '14:00',
    end: '22:00',
  },
  {
    value: 'ON_CALL',
    label: 'On-Call',
    short: 'C',
    icon: <Phone className="h-3 w-3" />,
    color:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    start: '00:00',
    end: '23:59',
  },
  {
    value: 'OVERTIME',
    label: 'Overtime',
    short: 'OT',
    icon: <Timer className="h-3 w-3" />,
    color:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300 dark:border-purple-700',
    start: '08:00',
    end: '16:00',
  },
  // Off / Leave types
  {
    value: 'DAY_OFF',
    label: 'Day Off',
    short: 'DO',
    icon: <SunMedium className="h-3 w-3" />,
    color:
      'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border-slate-300 dark:border-slate-600',
    start: '07:00',
    end: '19:00',
    isOff: true,
  },
  {
    value: 'NIGHT_OFF',
    label: 'Night Off',
    short: 'NO',
    icon: <MoonStar className="h-3 w-3" />,
    color:
      'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border-slate-300 dark:border-slate-600',
    start: '19:00',
    end: '07:00',
    isOff: true,
  },
  {
    value: 'OFF',
    label: 'Off',
    short: 'O',
    icon: <CalendarOff className="h-3 w-3" />,
    color:
      'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border-gray-300 dark:border-gray-600',
    start: '00:00',
    end: '23:59',
    isOff: true,
  },
  {
    value: 'AFTERNOON_OFF',
    label: 'Afternoon Off',
    short: 'AO',
    icon: <Sunset className="h-3 w-3" />,
    color:
      'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border-slate-300 dark:border-slate-600',
    start: '14:00',
    end: '22:00',
    isOff: true,
  },
  {
    value: 'LEAVE',
    label: 'Leave',
    short: 'L',
    icon: <Palmtree className="h-3 w-3" />,
    color:
      'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700',
    start: '00:00',
    end: '23:59',
    isOff: true,
  },
  {
    value: 'SICK_LEAVE',
    label: 'Sick Leave',
    short: 'SL',
    icon: <Thermometer className="h-3 w-3" />,
    color:
      'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700',
    start: '00:00',
    end: '23:59',
    isOff: true,
  },
  {
    value: 'REST',
    label: 'Rest Day',
    short: 'R',
    icon: <Coffee className="h-3 w-3" />,
    color:
      'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700',
    start: '00:00',
    end: '23:59',
    isOff: true,
  },
];

const SHIFT_MAP = Object.fromEntries(SHIFT_TYPES.map((s) => [s.value, s]));
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const REJECT_REASON_LABELS: Record<AutoFillRejectReason, string> = {
  max_days_reached: 'Max days reached',
  already_assigned: 'Already assigned this day',
  blocked_shift_type: 'Blocked shift type',
  weekend_restricted: 'Weekend restriction',
  night_limit_reached: 'Night limit reached',
  rest_violation: 'Minimum rest violation',
  max_consecutive_days: 'Max consecutive days exceeded',
  not_preferred_shift: 'Not preferred shift',
  group_maximum_reached: 'Group maximum reached',
  no_shared_shift_with: 'Cannot share shift with staff pair',
};

const GAP_CAUSE_LABELS: Record<
  string,
  { title: string; description: string; actionLabel: string; actionHref: string }
> = {
  no_department_staff: {
    title: 'Department has no available staff',
    description: 'No active staff resources are assigned to this department.',
    actionLabel: 'Manage departments',
    actionHref: '/admin/departments',
  },
  already_assigned: {
    title: 'Staff already assigned that day',
    description: 'The department staff already have another shift on the affected date.',
    actionLabel: 'Review roster',
    actionHref: '/scheduling/roster',
  },
  max_weekly_hours: {
    title: 'Weekly hour limit reached',
    description: 'Eligible staff would exceed the facility weekly-hours limit.',
    actionLabel: 'Review roster rules',
    actionHref: '/scheduling/roster/settings',
  },
  max_night_shifts: {
    title: 'Night-shift limit reached',
    description: 'Eligible staff have reached the configured weekly night-shift limit.',
    actionLabel: 'Review night limits',
    actionHref: '/scheduling/roster/settings',
  },
  max_consecutive_days: {
    title: 'Consecutive-day limit reached',
    description: 'Assigning another shift would exceed the consecutive working-day limit.',
    actionLabel: 'Review rest rules',
    actionHref: '/scheduling/roster/settings',
  },
  unknown: {
    title: 'No eligible staff available',
    description: 'No staff member passed the configured scheduling rules.',
    actionLabel: 'Review staff constraints',
    actionHref: '/scheduling/roster/settings',
  },
};

const DEFAULT_AUTOFILL_WEIGHTS = {
  weekly_load: 30,
  history_hours: 4,
  night_penalty: 16,
  weekend_penalty: 3,
  continuity_bonus: 3,
  preferred_match_bonus: 8,
  preferred_mismatch_penalty: 6,
};

// =============================================================================
// Helpers
// =============================================================================

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart(d: Date): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay()); // Sunday
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return toLocalDateString(d);
  });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}`;
}

function formatWeekRange(dates: string[]): string {
  if (dates.length < 7) return '';
  const start = new Date(dates[0] + 'T00:00:00');
  const end = new Date(dates[6] + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

// Key for the draft grid: `${resourceId}-${date}`
type CellKey = string;
function cellKey(resourceId: number, date: string): CellKey {
  return `${resourceId}-${date}`;
}

type AutoFillRejectReason =
  | 'max_days_reached'
  | 'already_assigned'
  | 'blocked_shift_type'
  | 'weekend_restricted'
  | 'night_limit_reached'
  | 'rest_violation'
  | 'max_consecutive_days'
  | 'not_preferred_shift'
  | 'group_maximum_reached'
  | 'no_shared_shift_with';

interface AutoFillDecision {
  staffId: number;
  staffName: string;
  date: string;
  shiftType: ShiftType;
  score: number;
  rationale: string[];
}

interface NormalizedGroupRule {
  scope: 'DEPARTMENT' | 'ROLE';
  value: string;
  min_staff: number;
  shift_types: ShiftType[];
}

interface NormalizedGroupMaxRule {
  scope: 'DEPARTMENT' | 'ROLE';
  value: string;
  max_staff: number;
  shift_types: ShiftType[];
}

interface AutoFillReport {
  filled: number;
  balanceMoves: number;
  targetCoverageSlots: number;
  finalCoverageSlots: number;
  fairnessSpread: number;
  strategy: string;
  weights: AutofillWeights;
  topRejectReasons: Array<{ reason: AutoFillRejectReason; count: number }>;
  decisions: AutoFillDecision[];
}

// =============================================================================
// Component
// =============================================================================

export default function WeeklyRosterPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();
  const canManageSchedules = canPerformAction('scheduling.manage_schedules');

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const weekLabel = useMemo(() => formatWeekRange(weekDates), [weekDates]);
  const today = useMemo(() => toLocalDateString(new Date()), []);

  const [departmentFilter, setDepartmentFilter] = useState<number | null>(null);

  // Mobile day-by-day navigation (< md breakpoint)
  const [mobileDayIndex, setMobileDayIndex] = useState(() => new Date().getDay()); // 0=Sun
  const [legendOpen, setLegendOpen] = useState(false);
  const [uncoveredPanelOpen, setUncoveredPanelOpen] = useState(false);
  const [decisionLogOpen, setDecisionLogOpen] = useState(false);
  const [compareRunA, setCompareRunA] = useState<string>('');
  const [compareRunB, setCompareRunB] = useState<string>('');

  // Shift comments dialog
  const [commentShift, setCommentShift] = useState<ShiftListItem | null>(null);
  // Draft assignments (unsaved changes)
  // Map<CellKey, ShiftType | null>  — null means "remove existing"
  const [draft, setDraft] = useState<Map<CellKey, ShiftType | null>>(new Map());
  const [plannedShiftDetails, setPlannedShiftDetails] = useState<
    Map<CellKey, { department: number; start_time: string; end_time: string }>
  >(new Map());
  const hasDraftChanges = draft.size > 0;

  // Fetch staff resources (PERSON type)
  const { data: resourcesData, isLoading: resourcesLoading } = useQuery({
    queryKey: ['scheduling-resources-person'],
    queryFn: () => resourcesApi.list({ resource_type: 'PERSON', page_size: 200, ordering: 'name' }),
  });
  const allStaff = useMemo(() => resourcesData?.results ?? [], [resourcesData?.results]);
  const { data: departmentsData } = useQuery({
    queryKey: ['departments', 'active', 'roster'],
    queryFn: () => departmentsApi.list({ is_active: true, page_size: 500 }),
  });
  const departments = useMemo(
    () => departmentsData?.results.filter((department) => department.is_active) ?? [],
    [departmentsData?.results]
  );
  const selectedDepartmentCode = useMemo(() => {
    if (departmentFilter === null) {
      return null;
    }
    return departments.find((department) => department.id === departmentFilter)?.code ?? null;
  }, [departmentFilter, departments]);
  const staffList = useMemo(
    () =>
      departmentFilter !== null
        ? allStaff.filter((resource) => resource.department === departmentFilter)
        : allStaff,
    [allStaff, departmentFilter]
  );

  // Fetch existing shifts for the week
  const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
    queryKey: ['roster-shifts', weekDates[0], weekDates[6]],
    queryFn: () =>
      shiftsApi.list({
        from_date: weekDates[0],
        to_date: weekDates[6],
        page_size: 500,
        ordering: 'shift_date,start_time',
      }),
    enabled: weekDates.length === 7,
  });

  // Check for cross-facility scheduling conflicts
  const { data: conflicts } = useQuery({
    queryKey: ['roster-conflicts', weekDates[0], weekDates[6]],
    queryFn: () =>
      shiftsApi.crossFacilityConflicts({ from_date: weekDates[0]!, to_date: weekDates[6]! }),
    enabled: weekDates.length === 7,
  });

  // Build a conflict lookup: `resourceId-date` → conflict details
  const conflictMap = useMemo(() => {
    const map = new Map<string, CrossFacilityConflict>();
    for (const c of conflicts ?? []) {
      map.set(cellKey(c.staff_resource_id, c.shift_date), c);
    }
    return map;
  }, [conflicts]);

  // Fetch staff constraints and scheduling settings for auto-fill
  const { data: constraintsData } = useQuery({
    queryKey: ['scheduling-constraints-active'],
    queryFn: () => staffConstraintsApi.list({ is_active: true, page_size: 500 }),
  });
  const { data: schedulingSettings } = useQuery({
    queryKey: ['scheduling-settings-current'],
    queryFn: () => schedulingSettingsApi.getCurrent(),
  });
  const { data: autofillRuns = [] } = useQuery({
    queryKey: ['roster-autofill-runs'],
    queryFn: () => schedulingSettingsApi.listAutofillRuns(),
  });
  const saveAutofillRunMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      schedulingSettingsApi.createAutofillRun(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roster-autofill-runs'] });
    },
  });

  // Fetch facility-configured shift type times (for creating shifts with correct times)
  const { data: shiftTypeDefaults } = useQuery({
    queryKey: ['shift-type-config-defaults'],
    queryFn: () => shiftTypeConfigsApi.defaults(),
  });

  // Build per-resource blocked shift types from constraints
  const blockedTypes = useMemo(() => {
    const map = new Map<number, Set<ShiftType>>();
    for (const c of constraintsData?.results ?? []) {
      if (!map.has(c.staff_resource)) map.set(c.staff_resource, new Set());
      const blocked = map.get(c.staff_resource)!;
      switch (c.constraint_type) {
        case 'NO_NIGHTS':
          blocked.add('NIGHT');
          blocked.add('NIGHT_OFF');
          break;
        case 'LIGHT_DUTY':
          // Only DAY allowed
          for (const st of SHIFT_TYPES) {
            if (st.value !== 'DAY' && !st.isOff) blocked.add(st.value);
          }
          break;
        case 'NO_OVERTIME':
          blocked.add('OVERTIME');
          break;
        case 'NO_WEEKENDS':
          // Tracked in separate set below
          break;
      }
    }
    return map;
  }, [constraintsData]);

  // Staff IDs with NO_WEEKENDS constraint
  const noWeekendStaff = useMemo(() => {
    const set = new Set<number>();
    for (const c of constraintsData?.results ?? []) {
      if (c.constraint_type === 'NO_WEEKENDS') set.add(c.staff_resource);
    }
    return set;
  }, [constraintsData]);

  const preferredShiftTypes = useMemo(() => {
    const map = new Map<number, Set<ShiftType>>();
    for (const c of constraintsData?.results ?? []) {
      if (c.constraint_type !== 'PREFERRED_SHIFTS') continue;
      const raw = c.value as Record<string, unknown> | undefined;
      const values = Array.isArray(raw?.shift_types)
        ? raw?.shift_types
        : Array.isArray(raw?.types)
          ? raw?.types
          : [];
      const allowed = new Set<ShiftType>();
      for (const value of values) {
        if (typeof value === 'string' && value in SHIFT_MAP) {
          allowed.add(value as ShiftType);
        }
      }
      if (allowed.size > 0) {
        map.set(c.staff_resource, allowed);
      }
    }
    return map;
  }, [constraintsData]);

  const noSharedShiftPairs = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const c of constraintsData?.results ?? []) {
      if (c.constraint_type !== 'NO_SHARED_SHIFT_WITH') continue;
      const raw = c.value as Record<string, unknown> | undefined;
      const other = Number(raw?.staff_resource_id ?? raw?.other_staff_resource_id ?? 0);
      if (!other || Number.isNaN(other)) continue;
      if (!map.has(c.staff_resource)) map.set(c.staff_resource, new Set<number>());
      map.get(c.staff_resource)!.add(other);
    }
    return map;
  }, [constraintsData]);

  // Filter shift types: if facility has ShiftTypeConfigs, only show those marked active.
  // Off/leave types are always available (they don't need facility config).
  const availableShiftTypes = useMemo(() => {
    if (!shiftTypeDefaults || Object.keys(shiftTypeDefaults).length === 0) {
      return SHIFT_TYPES; // No configs yet — show all
    }
    return SHIFT_TYPES.filter((st) => st.isOff || st.value in shiftTypeDefaults);
  }, [shiftTypeDefaults]);

  const cycleShiftTypes = useMemo(
    () => availableShiftTypes.map((shiftType) => shiftType.value),
    [availableShiftTypes]
  );

  const getNextShiftType = useCallback(
    (currentType: ShiftType | null): ShiftType | null => {
      if (cycleShiftTypes.length === 0) {
        return null;
      }
      if (currentType === null) {
        return cycleShiftTypes[0] ?? null;
      }
      const currentIndex = cycleShiftTypes.indexOf(currentType);
      if (currentIndex === -1) {
        return cycleShiftTypes[0] ?? null;
      }
      if (currentIndex === cycleShiftTypes.length - 1) {
        return null;
      }
      return cycleShiftTypes[currentIndex + 1] ?? null;
    },
    [cycleShiftTypes]
  );

  // Build a map of shift_type → custom hex color for cell rendering
  const customShiftColors = useMemo(() => {
    const map = new Map<string, string>();
    if (shiftTypeDefaults) {
      for (const [type, cfg] of Object.entries(shiftTypeDefaults)) {
        if (cfg.color) map.set(type, cfg.color);
      }
    }
    return map;
  }, [shiftTypeDefaults]);

  // Build a lookup: cellKey → ShiftListItem
  const existingShifts = useMemo(() => {
    const map = new Map<CellKey, ShiftListItem>();
    for (const shift of shiftsData?.results ?? []) {
      if (shift.status !== 'CANCELLED') {
        const key = cellKey(shift.staff_resource, shift.shift_date);
        map.set(key, shift);
      }
    }
    return map;
  }, [shiftsData]);

  // ==========================================================================
  // Cell interaction
  // ==========================================================================

  const handleCellClick = useCallback(
    (resourceId: number, date: string) => {
      if (!canManageSchedules) return;
      // Prevent editing past dates
      if (date < today) return;
      const key = cellKey(resourceId, date);
      setPlannedShiftDetails((previous) => {
        if (!previous.has(key)) return previous;
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
      setDraft((prev) => {
        const next = new Map(prev);
        const existing = existingShifts.get(key);
        const draftValue = prev.get(key);
        const currentType = prev.has(key) ? (draftValue ?? null) : (existing?.shift_type ?? null);

        const nextType = getNextShiftType(currentType);
        if (nextType === null) {
          if (existing) {
            next.set(key, null);
          } else {
            next.delete(key);
          }
          return next;
        }

        if (existing && nextType === existing.shift_type) {
          next.delete(key);
          return next;
        }

        next.set(key, nextType);
        return next;
      });
    },
    [existingShifts, canManageSchedules, getNextShiftType, today]
  );

  // Determine what's displayed in a cell
  const getCellState = useCallback(
    (
      resourceId: number,
      date: string
    ): { type: ShiftType | null; isDraft: boolean; isRemoval: boolean } => {
      const key = cellKey(resourceId, date);
      const draftValue = draft.get(key);
      const existing = existingShifts.get(key);

      if (draft.has(key)) {
        if (draftValue === null || draftValue === undefined) {
          return { type: null, isDraft: true, isRemoval: true };
        }
        return { type: draftValue, isDraft: true, isRemoval: false };
      }

      if (existing) {
        return { type: existing.shift_type, isDraft: false, isRemoval: false };
      }

      return { type: null, isDraft: false, isRemoval: false };
    },
    [draft, existingShifts]
  );

  // ==========================================================================
  // Save
  // ==========================================================================

  const saveMutation = useMutation({
    mutationFn: async () => {
      const newShifts: ShiftCreateData[] = [];
      const deleteIds: number[] = [];

      for (const [key, shiftType] of draft.entries()) {
        if (shiftType === null) {
          // Removal: find the existing saved shift and queue its deletion
          const existing = existingShifts.get(key);
          if (existing) {
            deleteIds.push(existing.id);
          }
          continue;
        }
        // Type change: delete the old shift before creating a new one
        const existing = existingShifts.get(key);
        if (existing && existing.shift_type !== shiftType) {
          deleteIds.push(existing.id);
        }

        const [resourceId, date] = [Number(key.split('-')[0]), key.substring(key.indexOf('-') + 1)];
        // Skip past dates
        if (date < today) continue;
        const config = SHIFT_MAP[shiftType];
        if (!config) continue;

        // Use facility-configured times if available, otherwise fall back to hardcoded SHIFT_MAP
        const plannedDetail = plannedShiftDetails.get(key);
        const facilityConfig = shiftTypeDefaults?.[shiftType];
        const startTime = plannedDetail?.start_time ?? facilityConfig?.start_time ?? config.start;
        const endTime = plannedDetail?.end_time ?? facilityConfig?.end_time ?? config.end;

        newShifts.push({
          staff_resource: resourceId,
          shift_date: date,
          start_time: startTime,
          end_time: endTime,
          shift_type: shiftType,
          department:
            plannedDetail?.department ??
            departmentFilter ??
            allStaff.find((staff) => staff.id === resourceId)?.department ??
            undefined,
        });
      }

      // Delete removed shifts — batch to avoid overwhelming the server
      let deleted = 0;
      let deleteFailed = 0;
      const BATCH_SIZE = 6;
      for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
        const batch = deleteIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((id) => shiftsApi.delete(id)));
        deleted += results.filter((r) => r.status === 'fulfilled').length;
        deleteFailed += results.filter((r) => r.status === 'rejected').length;
      }

      // Then create new shifts
      let createResult = { created: 0, skipped: 0, errors: 0 };
      if (newShifts.length > 0) {
        createResult = await shiftsApi.bulkCreate({ shifts: newShifts });
      }

      return { ...createResult, deleted, deleteFailed };
    },
    onSuccess: (result) => {
      setDraft(new Map());
      setPlannedShiftDetails(new Map());
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-upcoming'] });

      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} created`);
      if (result.deleted > 0) parts.push(`${result.deleted} removed`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);

      if (parts.length > 0) {
        toast.success(`Roster saved: ${parts.join(', ')}`);
      } else {
        toast.info('No changes to save');
      }

      if (result.errors > 0) {
        toast.error(`${result.errors} shift(s) had errors`);
      }
      if (result.deleteFailed > 0) {
        toast.error(
          `${result.deleteFailed} shift(s) could not be removed (may be active/completed)`
        );
      }
    },
    onError: () => toast.error('Failed to save roster'),
  });

  const clearRosterMutation = useMutation({
    mutationFn: () => shiftsApi.bulkDelete(weekDates[0]!, weekDates[6]!, true),
    onSuccess: (result) => {
      setDraft(new Map());
      setPlannedShiftDetails(new Map());
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      if (result.deleted > 0) {
        toast.success(`Cleared ${result.deleted} shift(s) from this week`);
      } else {
        toast.info('No shifts to clear');
      }
    },
    onError: () => toast.error('Failed to clear roster'),
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================

  function goToPrevWeek() {
    setDraft(new Map());
    setPlannedShiftDetails(new Map());
    setAutoFillReport(null);
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function goToNextWeek() {
    setDraft(new Map());
    setPlannedShiftDetails(new Map());
    setAutoFillReport(null);
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToThisWeek() {
    setDraft(new Map());
    setPlannedShiftDetails(new Map());
    setAutoFillReport(null);
    setWeekStart(getWeekStart(new Date()));
  }

  function discardDraft() {
    setDraft(new Map());
    setPlannedShiftDetails(new Map());
  }

  // ==========================================================================
  // Auto-Fill
  // ==========================================================================

  const [autoFillReport, setAutoFillReport] = useState<AutoFillReport | null>(null);
  const [autofillGaps, setAutofillGaps] = useState<AutofillPlan['report']['uncovered']>([]);
  const [autofillPlanSummary, setAutofillPlanSummary] = useState<AutofillPlan['report'] | null>(null);
  const [openGapCause, setOpenGapCause] = useState<string | null>(null);

  const groupedAutofillGaps = useMemo(() => {
    const groups = new Map<
      string,
      { cause: string; totalShortage: number; gaps: AutofillPlan['report']['uncovered'] }
    >();
    for (const gap of autofillGaps) {
      const primaryCause = Object.entries(gap.reason_counts ?? {}).sort(
        ([, countA], [, countB]) => countB - countA
      )[0]?.[0] ?? 'unknown';
      const current = groups.get(primaryCause) ?? {
        cause: primaryCause,
        totalShortage: 0,
        gaps: [],
      };
      current.totalShortage += gap.uncovered_staff;
      current.gaps.push(gap);
      groups.set(primaryCause, current);
    }
    return [...groups.values()].sort((a, b) => b.totalShortage - a.totalShortage);
  }, [autofillGaps]);

  const futureAutofillSummary = useMemo(() => {
    if (!autofillPlanSummary) {
      return null;
    }
    const futureCoverage = autofillPlanSummary.coverage.filter((item) => item.shift_date >= today);
    const coverageRequired = futureCoverage.reduce((total, item) => total + item.required_staff, 0);
    const coverageFilled = futureCoverage.reduce(
      (total, item) => total + Math.min(item.required_staff, item.existing_staff + item.planned_staff),
      0
    );
    const uncoveredFuture = autofillPlanSummary.uncovered
      .filter((item) => item.shift_date >= today)
      .reduce((total, item) => total + item.uncovered_staff, 0);
    return {
      coverageRequired,
      coverageFilled,
      coverageUnfilled: Math.max(coverageRequired - coverageFilled, uncoveredFuture),
    };
  }, [autofillPlanSummary, today]);

  const historyEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 1);
    return toLocalDateString(d);
  }, [weekStart]);
  const historyStart = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 42);
    return toLocalDateString(d);
  }, [weekStart]);

  const { data: historicalShiftsData } = useQuery({
    queryKey: ['roster-history-shifts', historyStart, historyEnd],
    queryFn: () =>
      shiftsApi.list({
        from_date: historyStart,
        to_date: historyEnd,
        page_size: 1500,
        ordering: 'shift_date,start_time',
      }),
    enabled: !!historyStart && !!historyEnd,
  });

  const { data: historicalAppointmentsData } = useQuery({
    queryKey: ['roster-history-appointments', historyStart, historyEnd],
    queryFn: () =>
      appointmentsApi.list({
        from_date: historyStart,
        to_date: historyEnd,
        page_size: 1000,
        ordering: 'scheduled_start',
      }),
    enabled: !!historyStart && !!historyEnd,
  });

  const historicalBurdenByStaff = useMemo(() => {
    const map = new Map<number, { hours: number; nightCount: number; weekendCount: number }>();
    for (const shift of historicalShiftsData?.results ?? []) {
      const current = map.get(shift.staff_resource) ?? { hours: 0, nightCount: 0, weekendCount: 0 };
      current.hours += shift.duration_hours ?? 0;
      if (shift.shift_type === 'NIGHT') current.nightCount += 1;
      const weekday = new Date(`${shift.shift_date}T00:00:00`).getDay();
      if (weekday === 0 || weekday === 6) current.weekendCount += 1;
      map.set(shift.staff_resource, current);
    }
    return map;
  }, [historicalShiftsData]);

  const predictiveDemandByWeekday = useMemo(() => {
    const buckets = new Map<number, number[]>();
    const perDate = new Map<string, number>();
    const activeStatuses = new Set([
      'CREATED',
      'CONFIRMED',
      'CHECKED_IN',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
    for (const appt of historicalAppointmentsData?.results ?? []) {
      if (!activeStatuses.has(appt.status)) continue;
      const day = appt.scheduled_start.slice(0, 10);
      perDate.set(day, (perDate.get(day) ?? 0) + 1);
    }
    for (const [day, count] of perDate.entries()) {
      const weekday = new Date(`${day}T00:00:00`).getDay();
      const arr = buckets.get(weekday) ?? [];
      arr.push(count);
      buckets.set(weekday, arr);
    }
    const avg = new Map<number, number>();
    for (const [weekday, counts] of buckets.entries()) {
      const total = counts.reduce((sum, value) => sum + value, 0);
      avg.set(weekday, counts.length ? total / counts.length : 0);
    }
    return avg;
  }, [historicalAppointmentsData]);

  const handleClientAutoFill = useCallback(() => {
    const availableWorking = new Set(
      availableShiftTypes.filter((st) => !st.isOff).map((st) => st.value)
    );
    const configuredActive =
      (schedulingSettings?.active_shift_types as ShiftType[] | undefined) ?? [];
    const configuredDefault =
      (schedulingSettings?.default_shift_pattern as ShiftType[] | undefined) ?? [];
    const activeTypes: ShiftType[] = configuredActive.length
      ? configuredActive.filter((t) => availableWorking.has(t))
      : configuredDefault.length
        ? configuredDefault.filter((t) => availableWorking.has(t))
        : [];
    const useMultiType = activeTypes.length > 1;
    const autofillMode = schedulingSettings?.autofill_mode ?? 'BALANCED_UTILIZATION';
    const targetDaysPerStaff = Math.max(
      1,
      Math.min(7, schedulingSettings?.autofill_target_days_per_staff ?? 4)
    );
    const groupMinRules = (
      (schedulingSettings?.autofill_group_minimums as AutofillGroupMinimumRule[] | undefined) ?? []
    )
      .map((rule): NormalizedGroupRule | null => {
        const scope = rule.scope === 'ROLE' ? 'ROLE' : 'DEPARTMENT';
        const value = String(rule.value ?? '').trim();
        const minStaff = Math.max(1, Math.round(Number(rule.min_staff ?? 1)));
        const shiftTypes = (rule.shift_types ?? [])
          .map((type) => String(type) as ShiftType)
          .filter((type) => activeTypes.includes(type));
        if (!value || shiftTypes.length === 0) return null;
        return { scope, value, min_staff: minStaff, shift_types: shiftTypes };
      })
      .filter((rule): rule is NormalizedGroupRule => !!rule);
    const groupMaxRules = (
      (schedulingSettings?.autofill_group_maximums as AutofillGroupMaximumRule[] | undefined) ?? []
    )
      .map((rule): NormalizedGroupMaxRule | null => {
        const scope = rule.scope === 'ROLE' ? 'ROLE' : 'DEPARTMENT';
        const value = String(rule.value ?? '').trim();
        const maxStaff = Math.max(1, Math.round(Number(rule.max_staff ?? 1)));
        const shiftTypes = (rule.shift_types ?? [])
          .map((type) => String(type) as ShiftType)
          .filter((type) => activeTypes.includes(type));
        if (!value || shiftTypes.length === 0) return null;
        return { scope, value, max_staff: maxStaff, shift_types: shiftTypes };
      })
      .filter((rule): rule is NormalizedGroupMaxRule => !!rule);
    const groupMinimumByShift = new Map<ShiftType, number>();
    for (const rule of groupMinRules) {
      for (const shiftType of rule.shift_types) {
        groupMinimumByShift.set(
          shiftType,
          (groupMinimumByShift.get(shiftType) ?? 0) + rule.min_staff
        );
      }
    }
    if (activeTypes.length === 0) {
      toast.error('Auto-fill is unavailable', {
        description:
          'Configure Active Shift Types or Default Shift Pattern in roster settings first.',
      });
      return;
    }
    const maxNights = schedulingSettings?.max_night_shifts_per_week ?? 4;
    const minRestHours = schedulingSettings?.min_rest_hours ?? 11;
    const maxConsecutiveDays = schedulingSettings?.max_consecutive_days ?? 6;
    const autoFillMaxDays = schedulingSettings?.autofill_target_days_per_staff ?? 5;
    const weights = {
      ...DEFAULT_AUTOFILL_WEIGHTS,
      ...((schedulingSettings?.autofill_weights as Record<string, number> | undefined) || {}),
    };

    const shiftEndHour: Record<string, number> = {
      DAY: 19,
      NIGHT: 7,
      MORNING: 14,
      AFTERNOON: 22,
      ON_CALL: 24,
      OVERTIME: 16,
      DAY_OFF: 19,
      NIGHT_OFF: 7,
      OFF: 0,
      AFTERNOON_OFF: 22,
      LEAVE: 0,
      SICK_LEAVE: 0,
      REST: 0,
    };
    const shiftStartHour: Record<string, number> = {
      DAY: 7,
      NIGHT: 19,
      MORNING: 6,
      AFTERNOON: 14,
      ON_CALL: 0,
      OVERTIME: 8,
      DAY_OFF: 7,
      NIGHT_OFF: 19,
      OFF: 0,
      AFTERNOON_OFF: 14,
      LEAVE: 0,
      SICK_LEAVE: 0,
      REST: 0,
    };

    const violatesRest = (prevType: ShiftType | null | undefined, nextType: ShiftType): boolean => {
      if (!prevType) return false;
      const prevEnd = shiftEndHour[prevType] ?? 0;
      const nextStart = shiftStartHour[nextType] ?? 0;
      if (prevType === 'NIGHT') {
        return nextStart - 7 < minRestHours;
      }
      return 24 - prevEnd + nextStart < minRestHours;
    };

    let reportDraft: AutoFillReport | null = null;

    setDraft((prev) => {
      const next = new Map(prev);
      let filled = 0;
      const decisions: AutoFillDecision[] = [];
      const rejectCounts = new Map<AutoFillRejectReason, number>();

      const dayCoverage: Map<string, number>[] = weekDates.map((date) => {
        const map = new Map<string, number>();
        for (const staff of staffList) {
          const key = cellKey(staff.id, date);
          const saved = existingShifts.get(key);
          const draftVal = next.get(key);
          const hasDraft = next.has(key) && draftVal !== null;
          const markedForRemoval = next.has(key) && draftVal === null;
          if (markedForRemoval) continue;
          const type = hasDraft ? draftVal : saved?.shift_type;
          if (type) map.set(type, (map.get(type) ?? 0) + 1);
        }
        return map;
      });

      const coverageTargets: Map<string, number>[] = weekDates.map((date) => {
        const targets = new Map<string, number>();
        for (const type of activeTypes) {
          targets.set(type, 0);
        }
        const dow = new Date(`${date}T00:00:00`).getDay();
        const demand = predictiveDemandByWeekday.get(dow) ?? 0;
        const extras = demand >= 20 ? 2 : demand >= 10 ? 1 : 0;
        for (let i = 0; i < extras; i++) {
          const type = activeTypes[i % activeTypes.length];
          if (type) targets.set(type, (targets.get(type) ?? 0) + 1);
        }
        return targets;
      });

      const staffDayType = new Map<number, (ShiftType | null)[]>();
      for (const staff of staffList) {
        const types: (ShiftType | null)[] = [];
        for (let i = 0; i < weekDates.length; i++) {
          const date = weekDates[i]!;
          const key = cellKey(staff.id, date);
          const saved = existingShifts.get(key);
          const draftVal = next.get(key);
          const hasDraft = next.has(key) && draftVal !== null;
          const markedForRemoval = next.has(key) && draftVal === null;
          if (markedForRemoval) types.push(null);
          else if (hasDraft) types.push(draftVal as ShiftType);
          else if (saved) types.push(saved.shift_type as ShiftType);
          else types.push(null);
        }
        staffDayType.set(staff.id, types);
      }

      const getAssignedType = (staffId: number, dayIdx: number): ShiftType | null =>
        staffDayType.get(staffId)?.[dayIdx] ?? null;

      const setAssignedType = (staffId: number, dayIdx: number, type: ShiftType | null) => {
        const arr = staffDayType.get(staffId);
        if (arr) arr[dayIdx] = type;
      };

      const wouldViolateRest = (staffId: number, dayIdx: number, shiftType: ShiftType): boolean => {
        const prevType = dayIdx > 0 ? getAssignedType(staffId, dayIdx - 1) : null;
        const nextType =
          dayIdx < weekDates.length - 1 ? getAssignedType(staffId, dayIdx + 1) : null;
        if (prevType && violatesRest(prevType, shiftType)) return true;
        if (nextType && violatesRest(shiftType, nextType)) return true;
        return false;
      };

      const getStaffState = (staff: ResourceListItem) => {
        let shiftCount = 0;
        let nightCount = 0;
        const emptyDays: number[] = [];
        for (let i = 0; i < weekDates.length; i++) {
          const t = getAssignedType(staff.id, i);
          if (t) {
            shiftCount++;
            if (t === 'NIGHT') nightCount++;
          } else if (weekDates[i]! >= today) {
            emptyDays.push(i);
          }
        }
        return { shiftCount, nightCount, emptyDays };
      };

      const staffShiftCount = new Map<number, number>();
      const staffNightCount = new Map<number, number>();
      const staffAssignedDays = new Map<number, Set<number>>();

      for (const staff of staffList) {
        const state = getStaffState(staff);
        staffShiftCount.set(staff.id, state.shiftCount);
        staffNightCount.set(staff.id, state.nightCount);
        const assigned = new Set<number>();
        for (let i = 0; i < weekDates.length; i++) {
          if (!state.emptyDays.includes(i)) assigned.add(i);
        }
        staffAssignedDays.set(staff.id, assigned);
      }

      const exceedsConsecutive = (
        staffId: number,
        dayIdx: number,
        shiftType: ShiftType
      ): boolean => {
        if (SHIFT_MAP[shiftType]?.isOff ?? false) return false;
        const arr = [...(staffDayType.get(staffId) ?? [])];
        arr[dayIdx] = shiftType;
        let run = 0;
        for (const t of arr) {
          const working = !!t && !(SHIFT_MAP[t]?.isOff ?? false);
          if (working) {
            run += 1;
            if (run > maxConsecutiveDays) return true;
          } else {
            run = 0;
          }
        }
        return false;
      };

      const hasNoSharedShiftConflict = (
        staffId: number,
        dayIdx: number,
        shiftType: ShiftType
      ): boolean => {
        for (const other of staffList) {
          if (other.id === staffId) continue;
          if (getAssignedType(other.id, dayIdx) !== shiftType) continue;
          const blocksOther = noSharedShiftPairs.get(staffId)?.has(other.id) ?? false;
          const blockedByOther = noSharedShiftPairs.get(other.id)?.has(staffId) ?? false;
          if (blocksOther || blockedByOther) return true;
        }
        return false;
      };

      const checkHardConstraints = (
        staff: ResourceListItem,
        dayIdx: number,
        shiftType: ShiftType
      ): AutoFillRejectReason | null => {
        const id = staff.id;
        if ((staffShiftCount.get(id) ?? 0) >= autoFillMaxDays) return 'max_days_reached';
        if (staffAssignedDays.get(id)?.has(dayIdx)) return 'already_assigned';
        if (blockedTypes.get(id)?.has(shiftType)) return 'blocked_shift_type';

        const date = weekDates[dayIdx]!;
        const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
        if (noWeekendStaff.has(id) && (dayOfWeek === 0 || dayOfWeek === 6))
          return 'weekend_restricted';
        if (shiftType === 'NIGHT' && (staffNightCount.get(id) ?? 0) >= maxNights)
          return 'night_limit_reached';
        if (wouldViolateRest(id, dayIdx, shiftType)) return 'rest_violation';
        if (exceedsConsecutive(id, dayIdx, shiftType)) return 'max_consecutive_days';
        if (hasNoSharedShiftConflict(id, dayIdx, shiftType)) return 'no_shared_shift_with';
        return null;
      };

      const scoreCandidate = (
        staff: ResourceListItem,
        dayIdx: number,
        shiftType: ShiftType
      ): { score: number; rationale: string[] } => {
        const id = staff.id;
        const burden = historicalBurdenByStaff.get(id) ?? {
          hours: 0,
          nightCount: 0,
          weekendCount: 0,
        };
        const preferred = preferredShiftTypes.get(id);
        const dayOfWeek = new Date(`${weekDates[dayIdx]}T00:00:00`).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const currentLoad = staffShiftCount.get(id) ?? 0;
        const currentNights = staffNightCount.get(id) ?? 0;

        let score = currentLoad * weights.weekly_load;
        score += (burden.hours / 8) * weights.history_hours;
        if (shiftType === 'NIGHT')
          score += currentNights * weights.night_penalty + burden.nightCount * 3;
        if (isWeekend) score += burden.weekendCount * weights.weekend_penalty;

        const prev = dayIdx > 0 ? getAssignedType(id, dayIdx - 1) : null;
        if (prev === shiftType) score -= weights.continuity_bonus;

        const rationale: string[] = [`load:${currentLoad}`, `history:${Math.round(burden.hours)}h`];
        if (preferred && preferred.size > 0) {
          if (preferred.has(shiftType)) {
            score -= weights.preferred_match_bonus;
            rationale.push('preferred:+');
          } else {
            score += weights.preferred_mismatch_penalty;
            rationale.push('preferred:-');
          }
        }

        score += Math.random();
        return { score, rationale };
      };

      const getGroupValue = (staff: ResourceListItem, scope: 'DEPARTMENT' | 'ROLE'): string => {
        if (scope === 'DEPARTMENT') return (staff.department_name ?? '').trim();
        const role =
          (staff.metadata?.role as string | undefined) ??
          (staff.metadata?.staff_role as string | undefined) ??
          (staff.metadata?.job_title as string | undefined) ??
          '';
        return String(role).trim();
      };

      const groupCoverage = new Map<string, number>();
      const allGroupRules: Array<{
        scope: 'DEPARTMENT' | 'ROLE';
        value: string;
        shift_types: ShiftType[];
      }> = [...groupMinRules, ...groupMaxRules];
      for (let dayIdx = 0; dayIdx < weekDates.length; dayIdx++) {
        for (const type of activeTypes) {
          for (const rule of allGroupRules) {
            if (!rule.shift_types.includes(type)) continue;
            const count = staffList.reduce((sum, staff) => {
              const assignedType = getAssignedType(staff.id, dayIdx);
              if (assignedType !== type) return sum;
              const groupValue = getGroupValue(staff, rule.scope);
              return sum + (groupValue.toLowerCase() === rule.value.toLowerCase() ? 1 : 0);
            }, 0);
            groupCoverage.set(`${dayIdx}|${type}|${rule.scope}|${rule.value.toLowerCase()}`, count);
          }
        }
      }

      const wouldExceedGroupMaximum = (
        staff: ResourceListItem,
        dayIdx: number,
        shiftType: ShiftType
      ): boolean => {
        for (const rule of groupMaxRules) {
          if (!rule.shift_types.includes(shiftType)) continue;
          const groupValue = getGroupValue(staff, rule.scope);
          if (groupValue.toLowerCase() !== rule.value.toLowerCase()) continue;
          const key = `${dayIdx}|${shiftType}|${rule.scope}|${rule.value.toLowerCase()}`;
          const current = groupCoverage.get(key) ?? 0;
          if (current >= rule.max_staff) return true;
        }
        return false;
      };

      const assign = (
        staff: ResourceListItem,
        dayIdx: number,
        shiftType: ShiftType,
        score: number,
        rationale: string[],
        requiredRule?: NormalizedGroupRule
      ) => {
        const key = cellKey(staff.id, weekDates[dayIdx]!);
        next.set(key, shiftType);
        setAssignedType(staff.id, dayIdx, shiftType);
        staffAssignedDays.get(staff.id)!.add(dayIdx);
        staffShiftCount.set(staff.id, (staffShiftCount.get(staff.id) ?? 0) + 1);
        if (shiftType === 'NIGHT') {
          staffNightCount.set(staff.id, (staffNightCount.get(staff.id) ?? 0) + 1);
        }
        dayCoverage[dayIdx]!.set(shiftType, (dayCoverage[dayIdx]!.get(shiftType) ?? 0) + 1);
        for (const rule of allGroupRules) {
          if (!rule.shift_types.includes(shiftType)) continue;
          const groupValue = getGroupValue(staff, rule.scope);
          if (groupValue.toLowerCase() === rule.value.toLowerCase()) {
            const key = `${dayIdx}|${shiftType}|${rule.scope}|${rule.value.toLowerCase()}`;
            groupCoverage.set(key, (groupCoverage.get(key) ?? 0) + 1);
          }
        }
        decisions.push({
          staffId: staff.id,
          staffName: staff.name,
          date: weekDates[dayIdx]!,
          shiftType,
          score,
          rationale,
        });
        filled += 1;
      };

      type Slot = { dayIdx: number; shiftType: ShiftType; requiredRule?: NormalizedGroupRule };
      const slots: Slot[] = [];
      for (let dayIdx = 0; dayIdx < weekDates.length; dayIdx++) {
        if (weekDates[dayIdx]! < today) continue;
        const dayTypes = useMultiType ? activeTypes : [activeTypes[0]!];
        for (const shiftType of dayTypes) {
          const current = dayCoverage[dayIdx]!.get(shiftType) ?? 0;
          const target = useMultiType ? (coverageTargets[dayIdx]!.get(shiftType) ?? 1) : 1;
          for (let i = current; i < target; i++) {
            slots.push({ dayIdx, shiftType });
          }
        }
      }

      for (let dayIdx = 0; dayIdx < weekDates.length; dayIdx++) {
        if (weekDates[dayIdx]! < today) continue;
        for (const shiftType of activeTypes) {
          for (const rule of groupMinRules) {
            if (!rule.shift_types.includes(shiftType)) continue;
            const key = `${dayIdx}|${shiftType}|${rule.scope}|${rule.value.toLowerCase()}`;
            const current = groupCoverage.get(key) ?? 0;
            for (let i = current; i < rule.min_staff; i++) {
              slots.push({ dayIdx, shiftType, requiredRule: rule });
            }
          }
        }
      }

      if (autofillMode === 'BALANCED_UTILIZATION') {
        const utilizationGap = staffList.reduce((sum, staff) => {
          const currentAssigned = staffShiftCount.get(staff.id) ?? 0;
          return sum + Math.max(0, targetDaysPerStaff - currentAssigned);
        }, 0);
        const futureDayIndices = weekDates
          .map((date, dayIdx) => ({ date, dayIdx }))
          .filter((item) => item.date >= today)
          .map((item) => item.dayIdx);

        const extraAssigned = new Map<string, number>();
        for (let i = 0; i < utilizationGap; i++) {
          let bestKey: string | null = null;
          let bestDay = -1;
          let bestShift: ShiftType | null = null;
          let bestScore = -1;
          for (const dayIdx of futureDayIndices) {
            const dow = new Date(`${weekDates[dayIdx]}T00:00:00`).getDay();
            const dayWeight = (predictiveDemandByWeekday.get(dow) ?? 0) + 1;
            for (const shiftType of activeTypes) {
              const shiftWeight = Math.max(1, groupMinimumByShift.get(shiftType) ?? 1);
              const key = `${dayIdx}|${shiftType}`;
              const spreadDivisor = 1 + (extraAssigned.get(key) ?? 0);
              const score = (dayWeight * shiftWeight) / spreadDivisor;
              if (score > bestScore) {
                bestScore = score;
                bestDay = dayIdx;
                bestShift = shiftType;
                bestKey = key;
              }
            }
          }
          if (bestDay < 0 || !bestShift || !bestKey) break;
          slots.push({ dayIdx: bestDay, shiftType: bestShift });
          extraAssigned.set(bestKey, (extraAssigned.get(bestKey) ?? 0) + 1);
        }
      }

      slots.sort((a, b) => {
        const aCov = Array.from(dayCoverage[a.dayIdx]!.values()).reduce(
          (sum, value) => sum + value,
          0
        );
        const bCov = Array.from(dayCoverage[b.dayIdx]!.values()).reduce(
          (sum, value) => sum + value,
          0
        );
        if (aCov !== bCov) return aCov - bCov;
        if (a.shiftType === 'NIGHT' && b.shiftType !== 'NIGHT') return -1;
        if (b.shiftType === 'NIGHT' && a.shiftType !== 'NIGHT') return 1;
        return a.dayIdx - b.dayIdx;
      });

      for (const slot of slots) {
        let best: { staff: ResourceListItem; score: number; rationale: string[] } | null = null;
        for (const staff of staffList) {
          if (slot.requiredRule) {
            const groupValue = getGroupValue(staff, slot.requiredRule.scope);
            if (groupValue.toLowerCase() !== slot.requiredRule.value.toLowerCase()) {
              continue;
            }
          }
          const rejectReason = checkHardConstraints(staff, slot.dayIdx, slot.shiftType);
          if (rejectReason) {
            rejectCounts.set(rejectReason, (rejectCounts.get(rejectReason) ?? 0) + 1);
            continue;
          }
          if (wouldExceedGroupMaximum(staff, slot.dayIdx, slot.shiftType)) {
            rejectCounts.set(
              'group_maximum_reached',
              (rejectCounts.get('group_maximum_reached') ?? 0) + 1
            );
            continue;
          }
          const scored = scoreCandidate(staff, slot.dayIdx, slot.shiftType);
          if (!best || scored.score < best.score) {
            best = { staff, score: scored.score, rationale: scored.rationale };
          }
        }
        if (best) {
          assign(
            best.staff,
            slot.dayIdx,
            slot.shiftType,
            best.score,
            [...best.rationale, slot.requiredRule ? 'group-minimum' : 'coverage'],
            slot.requiredRule
          );
        } else if (slot.requiredRule) {
          for (const staff of staffList) {
            const rejectReason = checkHardConstraints(staff, slot.dayIdx, slot.shiftType);
            if (rejectReason) continue;
            if (wouldExceedGroupMaximum(staff, slot.dayIdx, slot.shiftType)) continue;
            const scored = scoreCandidate(staff, slot.dayIdx, slot.shiftType);
            best = {
              staff,
              score: scored.score + 1000,
              rationale: [...scored.rationale, 'group-fallback'],
            };
            break;
          }
          if (best) {
            assign(best.staff, slot.dayIdx, slot.shiftType, best.score, best.rationale);
          }
        }
      }

      // Fill remaining empty future cells with OFF/REST to complete roster view
      for (const staff of staffList) {
        const assignedDays = staffAssignedDays.get(staff.id)!;
        for (let dayIdx = 0; dayIdx < weekDates.length; dayIdx++) {
          const date = weekDates[dayIdx]!;
          if (date < today || assignedDays.has(dayIdx)) continue;
          const key = cellKey(staff.id, date);
          const saved = existingShifts.get(key);
          if (saved && !(next.has(key) && next.get(key) === null)) continue;

          const prevType = dayIdx > 0 ? getAssignedType(staff.id, dayIdx - 1) : null;
          const offType: ShiftType = prevType === 'NIGHT' ? 'REST' : 'OFF';
          next.set(key, offType);
          setAssignedType(staff.id, dayIdx, offType);
          assignedDays.add(dayIdx);
          filled += 1;
        }
      }

      const loads = staffList.map((staff) => staffShiftCount.get(staff.id) ?? 0);
      const avg = loads.length ? loads.reduce((sum, value) => sum + value, 0) / loads.length : 0;
      const spread = loads.length
        ? Math.sqrt(loads.reduce((sum, value) => sum + (value - avg) ** 2, 0) / loads.length)
        : 0;

      const targetCoverageSlots = coverageTargets.reduce((sum, map) => {
        let subtotal = 0;
        for (const value of map.values()) subtotal += value;
        return sum + subtotal;
      }, 0);
      const finalCoverageSlots = dayCoverage.reduce((sum, map) => {
        let subtotal = 0;
        for (const type of activeTypes) subtotal += map.get(type) ?? 0;
        return sum + subtotal;
      }, 0);

      reportDraft = {
        filled,
        balanceMoves: 0,
        targetCoverageSlots,
        finalCoverageSlots,
        fairnessSpread: Number(spread.toFixed(2)),
        strategy: useMultiType
          ? autofillMode === 'BALANCED_UTILIZATION'
            ? 'coverage-utilization-fairness'
            : 'coverage-and-fairness'
          : 'single-pattern',
        weights,
        topRejectReasons: Array.from(rejectCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([reason, count]) => ({ reason, count })),
        decisions: decisions.slice(0, 25),
      };

      if (filled === 0) {
        toast.info('All staff already have enough shifts — nothing to fill');
        return prev;
      }

      const typeLabel = useMultiType
        ? `across ${activeTypes.length} shift types`
        : `using ${activeTypes.map((t) => SHIFT_MAP[t]?.label ?? t).join(', ')}`;
      toast.success(`Auto-filled ${filled} shift(s)`, {
        description: `${typeLabel}`,
      });
      return next;
    });

    const runReport = reportDraft as AutoFillReport | null;
    setAutoFillReport(runReport);
    if (runReport) {
      saveAutofillRunMutation.mutate({
        week_start: weekDates[0],
        week_end: weekDates[6],
        strategy: runReport.strategy,
        report: runReport,
      });
    }
  }, [
    staffList,
    weekDates,
    existingShifts,
    blockedTypes,
    noWeekendStaff,
    preferredShiftTypes,
    noSharedShiftPairs,
    schedulingSettings,
    today,
    availableShiftTypes,
    historicalBurdenByStaff,
    predictiveDemandByWeekday,
    saveAutofillRunMutation,
  ]);

  const handleAutoFill = useCallback(async () => {
    if (weekDates.length !== 7) return;
    try {
      // The planner intentionally receives no UI department filter. It must plan facility-wide.
      const plan: AutofillPlan = await shiftsApi.autofillPlan({
        start_date: weekDates[0]!,
        end_date: weekDates[6]!,
      });

      setDraft((previous) => {
        const next = new Map(previous);
        for (const shift of plan.draft_shifts) {
          if (shift.shift_date >= today) {
            next.set(cellKey(shift.staff_resource, shift.shift_date), shift.shift_type);
          }
        }
        return next;
      });
      setPlannedShiftDetails((previous) => {
        const next = new Map(previous);
        for (const shift of plan.draft_shifts) {
          next.set(cellKey(shift.staff_resource, shift.shift_date), {
            department: shift.department,
            start_time: shift.start_time,
            end_time: shift.end_time,
          });
        }
        return next;
      });

      const coverage = plan.report.coverage;
      const planned = plan.draft_shifts.length;
      const required = coverage.reduce((total, item) => total + item.required_staff, 0);
      const finalCoverage = coverage.reduce(
        (total, item) => total + item.existing_staff + item.planned_staff,
        0
      );
      const translatedReport: AutoFillReport = {
        filled: planned,
        balanceMoves: 0,
        targetCoverageSlots: required,
        finalCoverageSlots: finalCoverage,
        fairnessSpread: 0,
        strategy: 'server-department-coverage-plan',
        weights: {},
        topRejectReasons: [],
        decisions: [],
      };
      setAutoFillReport(translatedReport);
      setAutofillGaps(plan.report.uncovered);
      setUncoveredPanelOpen(false);
      setAutofillPlanSummary(plan.report);
      queryClient.invalidateQueries({ queryKey: ['roster-autofill-runs'] });

      if (planned > 0) {
        toast.success(`Planned ${planned} draft shift(s)`, {
          description: `${plan.report.uncovered.length} coverage gap(s) remain. Review and save when ready.`,
        });
      } else {
        toast.info('The server planner found no new shifts to add.');
      }
    } catch {
      toast.error('Failed to generate the server auto-fill plan');
    }
  }, [weekDates, today, queryClient]);

  // ==========================================================================
  // Print
  // ==========================================================================

  const handlePrint = useCallback(() => {
    const rows: RosterStaffRow[] = staffList.map((staff) => ({
      name: staff.name,
      cells: weekDates.map((date) => {
        const cell = getCellState(staff.id, date);
        if (!cell.type) return null;
        const info = SHIFT_MAP[cell.type];
        if (!info) return null;
        return {
          short: info.short,
          label: info.label,
          printColor: SHIFT_PRINT_COLORS[cell.type] || '#fff',
        };
      }),
    }));

    printRoster({ rows, weekDates, weekLabel });
  }, [staffList, weekDates, weekLabel, getCellState]);

  // ==========================================================================
  // Render
  // ==========================================================================

  const isLoading = resourcesLoading || shiftsLoading;
  const selectedRunA = autofillRuns.find((run) => run.id === compareRunA) ?? null;
  const selectedRunB = autofillRuns.find((run) => run.id === compareRunB) ?? null;
  const normalizeRunReport = useCallback((run: AutofillRun | null) => {
    const report = (run?.report ?? {}) as Record<string, unknown>;
    const coverageRequired = Number(
      report.coverage_required ?? report.targetCoverageSlots ?? report.coverageRequired ?? 0
    );
    const coverageFilled = Number(
      report.coverage_filled ?? report.finalCoverageSlots ?? report.coverageFilled ?? 0
    );
    const coverageUnfilled = Number(
      report.coverage_unfilled ?? Math.max(coverageRequired - coverageFilled, 0)
    );
    const fairnessSpread = Number(report.fairness_spread ?? report.fairnessSpread ?? 0);
    const staffScheduled = Number(report.staff_scheduled ?? report.filled ?? 0);
    const staffUnassigned = Number(report.staff_unassigned ?? 0);
    return {
      coverageRequired,
      coverageFilled,
      coverageUnfilled,
      fairnessSpread,
      staffScheduled,
      staffUnassigned,
    };
  }, []);
  const selectedRunASummary = normalizeRunReport(selectedRunA);
  const selectedRunBSummary = normalizeRunReport(selectedRunB);
  const configuredActiveTypes =
    (schedulingSettings?.active_shift_types as string[] | undefined) ?? [];
  const configuredDefaultPattern =
    (schedulingSettings?.default_shift_pattern as string[] | undefined) ?? [];
  const configuredAutofillMode = schedulingSettings?.autofill_mode ?? 'BALANCED_UTILIZATION';
  const configuredTargetDays = schedulingSettings?.autofill_target_days_per_staff ?? 4;
  const isAutofillConfigured =
    configuredActiveTypes.length > 0 || configuredDefaultPattern.length > 0;
  const autofillDisabledReason = !isAutofillConfigured
    ? 'Auto-fill disabled: no Active Shift Types or Default Shift Pattern configured in roster settings.'
    : staffList.length === 0
      ? 'Auto-fill disabled: no staff resources available.'
      : null;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className={`space-y-4 ${hasDraftChanges ? 'pb-20' : ''}`}>
        <PageHeader
          title="Weekly Roster"
          helpContent="Plan shifts for the week ahead. Click a cell to cycle through shift types, then click until clear if needed. Save when done. Tap the note icon on any saved shift to add comments."
          actions={
            <div className="flex items-center gap-1 sm:gap-2">
              {/* === Desktop: full button row (hidden on mobile) === */}
              <div className="hidden items-center gap-2 md:flex">
                {canManageSchedules && (
                  <>
                    <QRCodeDisplay />
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleAutoFill}
                              disabled={!!autofillDisabledReason}
                            >
                              <Wand2 className="mr-1 h-4 w-4" />
                              Auto-Fill
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {autofillDisabledReason
                              ? autofillDisabledReason
                              : configuredActiveTypes.length > 0
                                ? `Fill active shift types (${configuredActiveTypes.join(', ')}), mode ${configuredAutofillMode === 'BALANCED_UTILIZATION' ? `Balanced Utilization (${configuredTargetDays} target days)` : 'Minimum Coverage'}`
                                : `Fallback using default shift pattern (${configuredDefaultPattern.join(', ')}), mode ${configuredAutofillMode === 'BALANCED_UTILIZATION' ? `Balanced Utilization (${configuredTargetDays} target days)` : 'Minimum Coverage'}`}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrint}
                  disabled={staffList.length === 0}
                >
                  <Printer className="mr-1 h-4 w-4" />
                  Print
                </Button>
                {canManageSchedules && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/scheduling/roster/settings">
                            <Settings className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Roster Settings & Staff Constraints</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {canManageSchedules && (
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="outline" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            disabled={existingShifts.size === 0 || clearRosterMutation.isPending}
                            className="text-destructive focus:text-destructive"
                          >
                            {clearRosterMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Clear Week
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear this week&apos;s roster?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete all <strong>scheduled</strong> shifts for {weekLabel}.
                          Active, completed, and cancelled shifts will not be affected. This action
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => clearRosterMutation.mutate()}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          Clear Roster
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              {/* === Mobile: settings + overflow menu (shown below md) === */}
              <div className="flex items-center gap-1.5 md:hidden">
                {canManageSchedules && (
                  <Button size="icon" variant="outline" className="h-8 w-8" asChild>
                    <Link href="/scheduling/roster/settings">
                      <Settings className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canManageSchedules && (
                      <DropdownMenuItem
                        onClick={handleAutoFill}
                        disabled={!!autofillDisabledReason}
                      >
                        <Wand2 className="mr-2 h-4 w-4" />
                        Auto-Fill
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handlePrint} disabled={staffList.length === 0}>
                      <Printer className="mr-2 h-4 w-4" />
                      Print
                    </DropdownMenuItem>
                    {canManageSchedules && (
                      <>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              disabled={existingShifts.size === 0 || clearRosterMutation.isPending}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Clear Week
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Clear this week&apos;s roster?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete all <strong>scheduled</strong> shifts for {weekLabel}.
                                Active, completed, and cancelled shifts will not be affected. This action
                                cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => clearRosterMutation.mutate()}
                                className="bg-destructive text-white hover:bg-destructive/90"
                              >
                                Clear Roster
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          }
        />

        {/* Week Nav + Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Week Navigation */}
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={goToPrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              className="min-w-[200px] rounded-md px-3 py-1 text-center text-sm font-medium transition-colors hover:bg-muted"
              onClick={goToThisWeek}
            >
              {weekLabel}
            </button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Department + staffing controls (desktop) */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <Select
              value={departmentFilter === null ? '_none' : String(departmentFilter)}
              onValueChange={(value) =>
                setDepartmentFilter(value === '_none' ? null : Number(value))
              }
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Department">
                  {selectedDepartmentCode ?? 'All Depts'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">All Depts</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

          </div>

          {/* Filters (mobile only) — stacked vertically */}
          <div className="flex items-center gap-2 md:hidden">
            <Select
              value={departmentFilter === null ? '_none' : String(departmentFilter)}
              onValueChange={(value) =>
                setDepartmentFilter(value === '_none' ? null : Number(value))
              }
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue placeholder="Department">
                  {selectedDepartmentCode ?? 'All Depts'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">All Depts</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Legend — collapsible on mobile, inline on desktop */}
        <div className="hidden flex-wrap items-center gap-3 text-xs text-muted-foreground md:flex">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex cursor-default items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded border-2 border-dashed border-primary/50 bg-primary/5" />
                  Unsaved
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Draft changes not yet saved to the server</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex cursor-default items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded border border-border bg-muted" />
                  Saved
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Shift already saved on the server</p>
              </TooltipContent>
            </Tooltip>
            {SHIFT_TYPES.map((st) => (
              <Tooltip key={st.value}>
                <TooltipTrigger asChild>
                  <span className="flex cursor-default items-center gap-1">
                    {st.icon} {st.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">
                    {st.label}
                    {st.isOff ? '' : ' Shift'}
                  </p>
                  {!st.isOff && (
                    <p className="text-muted-foreground">
                      {st.start} – {st.end}
                    </p>
                  )}
                  {st.isOff && <p className="text-muted-foreground">Non-working</p>}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
        <div className="md:hidden">
          <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${legendOpen ? 'rotate-180' : ''}`}
                />
                Shift legend
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-wrap items-center gap-2.5 pb-2 pt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded border-2 border-dashed border-primary/50 bg-primary/5" />
                  Unsaved
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded border border-border bg-muted" />
                  Saved
                </span>
                {SHIFT_TYPES.map((st) => (
                  <span key={st.value} className="flex items-center gap-1">
                    {st.icon} {st.label}
                  </span>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Cross-facility conflicts banner */}
        {conflicts && conflicts.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 p-3 dark:border-orange-700 dark:bg-orange-950/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <div className="text-sm">
              <p className="font-medium text-orange-800 dark:text-orange-300">
                {conflicts.length} cross-facility conflict{conflicts.length !== 1 ? 's' : ''}{' '}
                detected
              </p>
              <p className="mt-0.5 text-xs text-orange-700 dark:text-orange-400">
                {Array.from(new Set(conflicts.map((c) => c.staff_resource_name))).join(', ')}
                {' — '}also scheduled at other facilities on overlapping dates. Check orange
                indicators on the grid.
              </p>
            </div>
          </div>
        )}

        {autofillPlanSummary && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Auto-fill plan summary</p>
                <Badge variant="outline" className="text-xs">Review before saving</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">
                  {futureAutofillSummary?.coverageFilled ?? 0}/
                  {futureAutofillSummary?.coverageRequired ?? 0} future coverage filled
                </Badge>
                <Badge variant="secondary">
                  {futureAutofillSummary?.coverageUnfilled ?? 0} future staff-shifts unfilled
                </Badge>
                <Badge variant="secondary">
                  fairness spread {autofillPlanSummary.fairness_spread.toFixed(2)}
                </Badge>
                <Badge variant="secondary">{autofillPlanSummary.staff_scheduled} staff scheduled</Badge>
                <Badge variant="secondary">{autofillPlanSummary.staff_unassigned} staff unassigned</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {autofillGaps.length > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-0">
              <Collapsible open={uncoveredPanelOpen} onOpenChange={setUncoveredPanelOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-muted/30">
                    <p className="text-sm font-medium">Uncovered Staffing Requirements</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {autofillGaps.length} slots ·{' '}
                        {autofillGaps.reduce((total, gap) => total + gap.uncovered_staff, 0)} staff missing
                      </Badge>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${uncoveredPanelOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 border-t px-3 py-3">
                    {groupedAutofillGaps.map((group) => {
                      const cause = GAP_CAUSE_LABELS[group.cause] ?? {
                        title: 'No eligible staff available',
                        description: 'No staff member passed the configured scheduling rules.',
                        actionLabel: 'Review staff constraints',
                        actionHref: '/scheduling/roster/settings',
                      };
                      const departmentIds = new Set(group.gaps.map((gap) => gap.department_id));
                      return (
                        <Collapsible
                          key={group.cause}
                          open={openGapCause === group.cause}
                          onOpenChange={(open) => setOpenGapCause(open ? group.cause : null)}
                        >
                          <div className="rounded-md border border-warning/30 bg-background/70">
                            <div className="flex items-start gap-3 p-3">
                              <CollapsibleTrigger asChild>
                                <button className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left hover:bg-muted/30">
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium">{cause.title}</span>
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      {group.totalShortage} staff-shift{group.totalShortage === 1 ? '' : 's'} missing across {departmentIds.size} department{departmentIds.size === 1 ? '' : 's'} · {group.gaps.length} date/shift slot{group.gaps.length === 1 ? '' : 's'}
                                    </span>
                                    <span className="mt-1 block text-xs text-muted-foreground">{cause.description}</span>
                                  </span>
                                  <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${openGapCause === group.cause ? 'rotate-180' : ''}`} />
                                </button>
                              </CollapsibleTrigger>
                              <Button size="sm" variant="outline" className="shrink-0" asChild>
                                <Link href={cause.actionHref}>{cause.actionLabel}</Link>
                              </Button>
                            </div>
                            <CollapsibleContent>
                              <div className="space-y-1 border-t px-3 py-2">
                                {group.gaps.map((gap) => {
                                  const departmentName = departments.find((department) => department.id === gap.department_id)?.name ?? `Department #${gap.department_id}`;
                                  const shiftLabel = SHIFT_MAP[gap.shift_type]?.label ?? gap.shift_type;
                                  return (
                                    <div key={`${gap.shift_date}-${gap.department_id}-${gap.shift_type}`} className="flex items-center justify-between gap-3 py-1 text-xs">
                                      <span>{departmentName} · {gap.shift_date} · {shiftLabel}</span>
                                      <Badge variant="outline" className="shrink-0">{gap.uncovered_staff} missing</Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )}


        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Autofill Run History</p>
              <Badge variant="secondary" className="text-xs">
                {autofillRuns.length}
              </Badge>
            </div>
            {autofillRuns.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No historical auto-fill runs recorded yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Compare Run A</Label>
                  <Select
                    value={compareRunA || '_none'}
                    onValueChange={(v) => setCompareRunA(v === '_none' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select run A" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {autofillRuns.map((run: AutofillRun) => (
                        <SelectItem key={`a-${run.id}`} value={run.id}>
                          {run.week_start || 'week'} · {new Date(run.created_at).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Compare Run B</Label>
                  <Select
                    value={compareRunB || '_none'}
                    onValueChange={(v) => setCompareRunB(v === '_none' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select run B" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {autofillRuns.map((run: AutofillRun) => (
                        <SelectItem key={`b-${run.id}`} value={run.id}>
                          {run.week_start || 'week'} · {new Date(run.created_at).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {selectedRunA && selectedRunB && (
              <div className="space-y-1.5 rounded-md border p-3 text-xs">
                <p className="text-sm font-medium">Compare Summary</p>
                <p>
                  A scheduled: {selectedRunASummary.staffScheduled}
                </p>
                <p>
                  B scheduled: {selectedRunBSummary.staffScheduled}
                </p>
                <p>
                  Coverage A: {selectedRunASummary.coverageFilled}/{selectedRunASummary.coverageRequired}{' '}
                  ({selectedRunASummary.coverageUnfilled} unfilled)
                </p>
                <p>
                  Coverage B: {selectedRunBSummary.coverageFilled}/{selectedRunBSummary.coverageRequired}{' '}
                  ({selectedRunBSummary.coverageUnfilled} unfilled)
                </p>
                <p>
                  Fairness spread A/B:{' '}
                  {selectedRunASummary.fairnessSpread.toFixed(2)} /
                  {selectedRunBSummary.fairnessSpread.toFixed(2)}
                </p>
                <p>
                  Unassigned staff A/B: {selectedRunASummary.staffUnassigned} /
                  {selectedRunBSummary.staffUnassigned}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Roster Grid — Desktop (md+) */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading roster...
              </div>
            ) : staffList.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm font-medium">No staff resources found</p>
                <p className="mt-1 text-xs">Sync staff profiles on the Resources page first.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="sticky left-0 z-10 w-[180px] min-w-[140px] bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Staff
                      </th>
                      {weekDates.map((date, i) => {
                        const isToday = date === today;
                        const isPast = date < today;
                        return (
                          <th
                            key={date}
                            className={`min-w-[80px] px-1 py-2 text-center text-xs font-medium ${
                              isToday ? 'bg-primary/5' : ''
                            } ${isPast ? 'opacity-50' : ''}`}
                          >
                            <div
                              className={`${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
                            >
                              {DAY_LABELS[i]}
                            </div>
                            <div
                              className={`text-[11px] ${isToday ? 'text-primary' : 'text-muted-foreground/70'}`}
                            >
                              {formatDateShort(date)}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((staff) => (
                      <tr key={staff.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {staff.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)}
                            </div>
                            <span className="truncate text-xs font-medium">{staff.name}</span>
                          </div>
                        </td>
                        {weekDates.map((date) => {
                          const cell = getCellState(staff.id, date);
                          const isToday = date === today;
                          const isPast = date < today;
                          const shiftInfo = cell.type ? SHIFT_MAP[cell.type] : null;
                          const conflict = conflictMap.get(cellKey(staff.id, date));
                          const savedShift = existingShifts.get(cellKey(staff.id, date));
                          const hasSavedShift = !!savedShift && !cell.isDraft && !cell.isRemoval;

                          return (
                            <td
                              key={date}
                              className={`px-1 py-1 text-center ${canManageSchedules && !isPast ? 'cursor-pointer' : ''} transition-colors ${
                                isToday ? 'bg-primary/5' : ''
                              } ${isPast ? 'opacity-50' : ''} ${conflict ? 'bg-orange-50 dark:bg-orange-950/20' : ''} hover:bg-muted/50`}
                              title={
                                isPast && canManageSchedules
                                  ? 'Past dates are locked. Auto-fill and manual edits only apply to today and future dates.'
                                  : undefined
                              }
                              onClick={() => handleCellClick(staff.id, date)}
                              onContextMenu={
                                hasSavedShift
                                  ? (e) => {
                                      e.preventDefault();
                                      setCommentShift(savedShift);
                                    }
                                  : undefined
                              }
                            >
                              <div className="relative inline-block">
                                {cell.type && shiftInfo ? (
                                  <div
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                                      customShiftColors.has(cell.type)
                                        ? 'text-foreground'
                                        : shiftInfo.color
                                    } ${cell.isDraft ? 'border-2 border-dashed border-primary/50' : ''}`}
                                    style={
                                      customShiftColors.has(cell.type)
                                        ? {
                                            backgroundColor: `${customShiftColors.get(cell.type)}20`,
                                            borderColor: `${customShiftColors.get(cell.type)}80`,
                                          }
                                        : undefined
                                    }
                                  >
                                    {shiftInfo.icon}
                                    <span>{shiftInfo.short}</span>
                                  </div>
                                ) : cell.isRemoval ? (
                                  <div className="inline-flex items-center rounded border border-dashed border-destructive/30 px-1.5 py-0.5 text-[11px] text-destructive/60">
                                    —
                                  </div>
                                ) : (
                                  <div className="h-6 w-full rounded transition-colors hover:bg-muted/60" />
                                )}
                                {savedShift && (savedShift.comments_count ?? 0) > 0 && (
                                  <span
                                    className="absolute -bottom-0.5 -left-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[7px] font-bold text-white"
                                    title={`${savedShift.comments_count} note(s)`}
                                  >
                                    {savedShift.comments_count}
                                  </span>
                                )}
                                {isPast && (
                                  <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-muted p-0.5 text-muted-foreground">
                                    <Lock className="h-2.5 w-2.5" />
                                  </span>
                                )}
                                {conflict && (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="absolute -right-1 -top-1 flex h-3 w-3">
                                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                                          <span className="relative inline-flex h-3 w-3 items-center justify-center rounded-full bg-orange-500 text-[7px] font-bold text-white">
                                            !
                                          </span>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-[220px]">
                                        <p className="text-xs font-medium">
                                          Cross-facility conflict
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          Also scheduled at {conflict.other_facility.name} (
                                          {conflict.other_shift.shift_type}{' '}
                                          {conflict.other_shift.start_time}–
                                          {conflict.other_shift.end_time})
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Roster — Mobile day-by-day card layout (< md) */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading roster...
            </div>
          ) : staffList.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm font-medium">No staff resources found</p>
              <p className="mt-1 text-xs">Sync staff profiles on the Resources page first.</p>
            </div>
          ) : (
            <>
              {/* Mobile day navigation */}
              <div className="mb-3 flex items-center justify-between">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setMobileDayIndex((prev) => (prev > 0 ? prev - 1 : 6))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center">
                  <div
                    className={`text-sm font-semibold ${weekDates[mobileDayIndex] === today ? 'text-primary' : ''}`}
                  >
                    {DAY_LABELS_FULL[mobileDayIndex]}
                  </div>
                  <div
                    className={`text-xs ${weekDates[mobileDayIndex] === today ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {(() => {
                      const d = new Date(weekDates[mobileDayIndex]! + 'T00:00:00');
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    })()}
                    {weekDates[mobileDayIndex] === today && (
                      <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Today
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setMobileDayIndex((prev) => (prev < 6 ? prev + 1 : 0))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Day dots navigation */}
              <div className="mb-3 flex items-center justify-center gap-2">
                {weekDates.map((date, i) => (
                  <button
                    key={date}
                    onClick={() => setMobileDayIndex(i)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition-colors ${
                      i === mobileDayIndex
                        ? 'bg-primary text-primary-foreground'
                        : date === today
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="text-[10px] font-medium">{DAY_LABELS[i]}</span>
                    <span className="text-[10px]">{formatDateShort(date)}</span>
                  </button>
                ))}
              </div>

              {/* Staff cards for selected day */}
              <div className="space-y-1.5">
                {staffList.map((staff) => {
                  const date = weekDates[mobileDayIndex]!;
                  const isPast = date < today;
                  const cell = getCellState(staff.id, date);
                  const shiftInfo = cell.type ? SHIFT_MAP[cell.type] : null;
                  const conflict = conflictMap.get(cellKey(staff.id, date));
                  const savedShift = existingShifts.get(cellKey(staff.id, date));
                  const hasSavedShift = !!savedShift && !cell.isDraft && !cell.isRemoval;

                  return (
                    <div
                      key={staff.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        canManageSchedules && !isPast ? 'cursor-pointer active:bg-muted/80' : ''
                      } ${isPast ? 'opacity-50' : ''} ${conflict ? 'border-orange-300 bg-orange-50/50 dark:border-orange-700 dark:bg-orange-950/10' : 'bg-card'}`}
                      title={
                        isPast && canManageSchedules
                          ? 'Past dates are locked. Auto-fill and manual edits only apply to today and future dates.'
                          : undefined
                      }
                      onClick={() => handleCellClick(staff.id, date)}
                    >
                      {/* Avatar */}
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {staff.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>

                      {/* Name */}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{staff.name}</span>
                        {conflict && (
                          <span className="text-[10px] text-orange-600 dark:text-orange-400">
                            Conflict: {conflict.other_facility.name}
                          </span>
                        )}
                      </div>

                      {/* Shift badge + actions */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isPast && (
                          <span
                            className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            title="Past date is locked"
                          >
                            <Lock className="mr-1 h-2.5 w-2.5" />
                            Locked
                          </span>
                        )}
                        {cell.type && shiftInfo ? (
                          <div
                            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium ${
                              customShiftColors.has(cell.type) ? 'text-foreground' : shiftInfo.color
                            } ${cell.isDraft ? 'border-2 border-dashed border-primary/50' : ''}`}
                            style={
                              customShiftColors.has(cell.type)
                                ? {
                                    backgroundColor: `${customShiftColors.get(cell.type)}20`,
                                    borderColor: `${customShiftColors.get(cell.type)}80`,
                                  }
                                : undefined
                            }
                          >
                            {shiftInfo.icon}
                            <span>{shiftInfo.label}</span>
                          </div>
                        ) : cell.isRemoval ? (
                          <div className="inline-flex items-center rounded border border-dashed border-destructive/30 px-2.5 py-1 text-xs text-destructive/60">
                            Removed
                          </div>
                        ) : (
                          <div className="px-2.5 py-1 text-xs text-muted-foreground/50">—</div>
                        )}

                        {/* Note icon — explicit button for mobile */}
                        {hasSavedShift && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCommentShift(savedShift);
                            }}
                            className="relative flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted"
                          >
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            {(savedShift.comments_count ?? 0) > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
                                {savedShift.comments_count}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </>
          )}
        </div>

        {/* Summary bar */}
        {canManageSchedules && (hasDraftChanges || existingShifts.size > 0) && (
          <div className="sticky bottom-14 z-20 md:bottom-4">
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <span className="font-medium">
                    {hasDraftChanges
                      ? `${draft.size} unsaved change${draft.size !== 1 ? 's' : ''}`
                      : 'Saved shifts exist for this week'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {existingShifts.size > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={clearRosterMutation.isPending}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Reset Week
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset this week&apos;s saved roster?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete all scheduled shifts for {weekLabel}. Active, completed,
                            and cancelled shifts will not be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => clearRosterMutation.mutate()}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            Reset Week
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {hasDraftChanges && (
                    <>
                      <Button size="sm" variant="outline" onClick={discardDraft}>
                        Discard
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                        )}
                        Save
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Shift Comments Dialog */}
      <Dialog
        open={!!commentShift}
        onOpenChange={(open) => {
          if (!open) setCommentShift(null);
        }}
      >
        <DialogContent className="flex max-h-[80vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              Shift Notes — {commentShift?.staff_resource_name} ({commentShift?.shift_type},{' '}
              {commentShift?.shift_date})
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {commentShift && <CommentThread entityType="shift" entityId={commentShift.id} />}
          </div>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
