'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Eraser,
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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { toast } from 'sonner';
import { resourcesApi, shiftsApi, staffConstraintsApi, schedulingSettingsApi } from '@/lib/api/scheduling';
import type {
  ShiftType,
  ShiftListItem,
  ShiftCreateData,
  ResourceListItem,
  CrossFacilityConflict,
} from '@/lib/types/scheduling';
import {
  printRoster,
  SHIFT_PRINT_COLORS,
  type RosterStaffRow,
} from '@/lib/documents/print-roster';

// =============================================================================
// Constants
// =============================================================================

const SHIFT_TYPES: { value: ShiftType; label: string; short: string; icon: React.ReactNode; color: string; start: string; end: string; isOff?: boolean }[] = [
  // Working shifts
  { value: 'DAY',       label: 'Day',       short: 'D', icon: <Sun className="h-3 w-3" />,     color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700',     start: '07:00', end: '19:00' },
  { value: 'NIGHT',     label: 'Night',     short: 'N', icon: <Moon className="h-3 w-3" />,    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700', start: '19:00', end: '07:00' },
  { value: 'MORNING',   label: 'Morning',   short: 'M', icon: <Sunrise className="h-3 w-3" />, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-700', start: '06:00', end: '14:00' },
  { value: 'AFTERNOON', label: 'Afternoon', short: 'A', icon: <Sunset className="h-3 w-3" />,  color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-700',           start: '14:00', end: '22:00' },
  { value: 'ON_CALL',   label: 'On-Call',   short: 'C', icon: <Phone className="h-3 w-3" />,   color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700', start: '00:00', end: '23:59' },
  { value: 'OVERTIME',  label: 'Overtime',  short: 'OT', icon: <Timer className="h-3 w-3" />,   color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300 dark:border-purple-700', start: '08:00', end: '16:00' },
  // Off / Leave types
  { value: 'DAY_OFF',       label: 'Day Off',       short: 'DO', icon: <SunMedium className="h-3 w-3" />,    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border-slate-300 dark:border-slate-600',   start: '07:00', end: '19:00', isOff: true },
  { value: 'NIGHT_OFF',     label: 'Night Off',     short: 'NO', icon: <MoonStar className="h-3 w-3" />,     color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border-slate-300 dark:border-slate-600',   start: '19:00', end: '07:00', isOff: true },
  { value: 'OFF',           label: 'Off',           short: 'O',  icon: <CalendarOff className="h-3 w-3" />,   color: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border-gray-300 dark:border-gray-600',         start: '00:00', end: '23:59', isOff: true },
  { value: 'AFTERNOON_OFF', label: 'Afternoon Off', short: 'AO', icon: <Sunset className="h-3 w-3" />,       color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border-slate-300 dark:border-slate-600',   start: '14:00', end: '22:00', isOff: true },
  { value: 'LEAVE',         label: 'Leave',         short: 'L',  icon: <Palmtree className="h-3 w-3" />,      color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700', start: '00:00', end: '23:59', isOff: true },
  { value: 'SICK_LEAVE',    label: 'Sick Leave',    short: 'SL', icon: <Thermometer className="h-3 w-3" />,   color: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700',                 start: '00:00', end: '23:59', isOff: true },
  { value: 'REST',          label: 'Rest Day',      short: 'R',  icon: <Coffee className="h-3 w-3" />,        color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700',     start: '00:00', end: '23:59', isOff: true },
];

const SHIFT_MAP = Object.fromEntries(SHIFT_TYPES.map((s) => [s.value, s]));
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// =============================================================================
// Helpers
// =============================================================================

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
    return d.toISOString().split('T')[0] ?? '';
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

// =============================================================================
// Component
// =============================================================================

export default function WeeklyRosterPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const weekLabel = useMemo(() => formatWeekRange(weekDates), [weekDates]);

  // Active paint brush
  const [paintType, setPaintType] = useState<ShiftType>('DAY');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Draft assignments (unsaved changes)
  // Map<CellKey, ShiftType | null>  — null means "remove existing"
  const [draft, setDraft] = useState<Map<CellKey, ShiftType | null>>(new Map());
  const hasDraftChanges = draft.size > 0;

  // Fetch staff resources (PERSON type)
  const { data: resourcesData, isLoading: resourcesLoading } = useQuery({
    queryKey: ['scheduling-resources-person'],
    queryFn: () => resourcesApi.list({ resource_type: 'PERSON', page_size: 200, ordering: 'name' }),
  });
  const allStaff = resourcesData?.results ?? [];
  const staffList = useMemo(
    () => departmentFilter ? allStaff.filter((r) => r.department_name === departmentFilter) : allStaff,
    [allStaff, departmentFilter],
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
    queryFn: () => shiftsApi.crossFacilityConflicts({ from_date: weekDates[0]!, to_date: weekDates[6]! }),
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

  // Get departments from staff resources
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of allStaff) {
      if (r.department_name) set.add(r.department_name);
    }
    return Array.from(set).sort();
  }, [allStaff]);

  // ==========================================================================
  // Cell interaction
  // ==========================================================================

  const handleCellClick = useCallback(
    (resourceId: number, date: string) => {
      const key = cellKey(resourceId, date);
      setDraft((prev) => {
        const next = new Map(prev);
        const existing = existingShifts.get(key);
        const draftValue = prev.get(key);
        const currentType = prev.has(key) ? draftValue : existing?.shift_type ?? null;

        // Toggle off: if cell already has a shift (saved or drafted), remove it
        if (currentType !== null) {
          if (existing && !prev.has(key)) {
            // Saved shift — mark for deletion
            next.set(key, null);
          } else if (prev.has(key) && draftValue !== null) {
            // Draft addition — just remove the draft entry
            next.delete(key);
            // If there was a saved shift underneath, it reappears
          } else {
            // Already marked for deletion — undo the removal
            next.delete(key);
          }
          return next;
        }

        // Paint: assign the selected shift type to an empty cell
        next.set(key, paintType);
        return next;
      });
    },
    [paintType, existingShifts],
  );

  // Determine what's displayed in a cell
  const getCellState = useCallback(
    (resourceId: number, date: string): { type: ShiftType | null; isDraft: boolean; isRemoval: boolean } => {
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
    [draft, existingShifts],
  );

  // ==========================================================================
  // Save
  // ==========================================================================

  const saveMutation = useMutation({
    mutationFn: async () => {
      const newShifts: ShiftCreateData[] = [];

      for (const [key, shiftType] of draft.entries()) {
        if (shiftType === null) continue; // Removals handled separately in future
        const [resourceId, date] = [Number(key.split('-')[0]), key.substring(key.indexOf('-') + 1)];
        const config = SHIFT_MAP[shiftType];
        if (!config) continue;

        newShifts.push({
          staff_resource: resourceId,
          shift_date: date,
          start_time: config.start,
          end_time: config.end,
          shift_type: shiftType,
          department: departmentFilter || undefined,
        });
      }

      if (newShifts.length === 0) {
        return { created: 0, skipped: 0, errors: 0 };
      }

      return shiftsApi.bulkCreate({ shifts: newShifts });
    },
    onSuccess: (result) => {
      setDraft(new Map());
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });

      if (result.created > 0) {
        toast.success(`Saved ${result.created} shift(s)`, {
          description: result.skipped > 0 ? `${result.skipped} duplicate(s) skipped` : undefined,
        });
      } else if (result.skipped > 0) {
        toast.info(`${result.skipped} shift(s) already exist — nothing to save`);
      } else {
        toast.info('No changes to save');
      }

      if (result.errors > 0) {
        toast.error(`${result.errors} shift(s) had errors`);
      }
    },
    onError: () => toast.error('Failed to save roster'),
  });

  const clearRosterMutation = useMutation({
    mutationFn: () => shiftsApi.bulkDelete(weekDates[0]!, weekDates[6]!),
    onSuccess: (result) => {
      setDraft(new Map());
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      if (result.deleted > 0) {
        toast.success(`Cleared ${result.deleted} shift(s) from this week`);
      } else {
        toast.info('No scheduled shifts to clear');
      }
    },
    onError: () => toast.error('Failed to clear roster'),
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================

  function goToPrevWeek() {
    setDraft(new Map());
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function goToNextWeek() {
    setDraft(new Map());
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToThisWeek() {
    setDraft(new Map());
    setWeekStart(getWeekStart(new Date()));
  }

  // ==========================================================================
  // Auto-Fill
  // ==========================================================================

  const [maxDaysPerStaff, setMaxDaysPerStaff] = useState(5);

  const handleAutoFill = useCallback(() => {
    // Determine which shift types the facility wants to cover each day.
    // If active_shift_types is configured, distribute staff across ALL of them.
    // Otherwise fall back to the old pattern/paint behaviour.
    const activeTypes: ShiftType[] =
      schedulingSettings?.active_shift_types?.length
        ? (schedulingSettings.active_shift_types as ShiftType[])
        : schedulingSettings?.default_shift_pattern?.length
          ? (schedulingSettings.default_shift_pattern as ShiftType[])
          : [paintType];

    const useMultiType = (schedulingSettings?.active_shift_types?.length ?? 0) > 0;

    const maxNights = schedulingSettings?.max_night_shifts_per_week ?? 4;
    const minRestHours = schedulingSettings?.min_rest_hours ?? 11;

    // ---- Shift transition helpers ----
    // Shift end hours (approximate, for continuity checks)
    const SHIFT_END_HOUR: Record<string, number> = {
      DAY: 19, NIGHT: 7, MORNING: 14, AFTERNOON: 22,
      ON_CALL: 24, OVERTIME: 16,
      DAY_OFF: 19, NIGHT_OFF: 7, OFF: 0, AFTERNOON_OFF: 22,
      LEAVE: 0, SICK_LEAVE: 0, REST: 0,
    };
    const SHIFT_START_HOUR: Record<string, number> = {
      DAY: 7, NIGHT: 19, MORNING: 6, AFTERNOON: 14,
      ON_CALL: 0, OVERTIME: 8,
      DAY_OFF: 7, NIGHT_OFF: 19, OFF: 0, AFTERNOON_OFF: 14,
      LEAVE: 0, SICK_LEAVE: 0, REST: 0,
    };

    /** Check if assigning nextType on the day after prevType violates rest. */
    const violatesRest = (prevType: ShiftType | null | undefined, nextType: ShiftType): boolean => {
      if (!prevType) return false;
      const prevEnd = SHIFT_END_HOUR[prevType] ?? 0;
      const nextStart = SHIFT_START_HOUR[nextType] ?? 0;
      // If prev shift ends after midnight (NIGHT ends at 7am next day),
      // rest = nextStart - prevEnd on the SAME next day
      // NIGHT(19:00-07:00): ends at 07:00 next day → rest until next shift start
      if (prevType === 'NIGHT') {
        // Night ends at ~07:00 the next morning. Next shift on that SAME day:
        // rest hours = nextStart - 7
        const rest = nextStart - 7;
        return rest < minRestHours;
      }
      // For non-night previous shifts ending on day N, next shift is day N+1:
      // rest = (24 - prevEnd) + nextStart
      const rest = (24 - prevEnd) + nextStart;
      return rest < minRestHours;
    };

    setDraft((prev) => {
      const next = new Map(prev);
      let filled = 0;

      // ---- Coverage tracking per (day, shiftType) ----
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

      const dayTotalCoverage = (dayIdx: number) => {
        let sum = 0;
        for (const count of dayCoverage[dayIdx]!.values()) sum += count;
        return sum;
      };

      // ---- Per-staff shift-type tracker (for continuity checks) ----
      // staffDayType[staffId][dayIdx] = ShiftType assigned
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
          if (markedForRemoval) {
            types.push(null);
          } else if (hasDraft) {
            types.push(draftVal as ShiftType);
          } else if (saved) {
            types.push(saved.shift_type as ShiftType);
          } else {
            types.push(null);
          }
        }
        staffDayType.set(staff.id, types);
      }

      /** Get what a staff member is assigned on a given day (including new assignments). */
      const getAssignedType = (staffId: number, dayIdx: number): ShiftType | null => {
        return staffDayType.get(staffId)?.[dayIdx] ?? null;
      };

      /** Record an assignment in the tracker. */
      const recordAssignment = (staffId: number, dayIdx: number, type: ShiftType) => {
        const arr = staffDayType.get(staffId);
        if (arr) arr[dayIdx] = type;
      };

      /** Check if assigning shiftType on dayIdx violates rest relative to adjacent days. */
      const wouldViolateRest = (staffId: number, dayIdx: number, shiftType: ShiftType): boolean => {
        // Check previous day → this assignment
        if (dayIdx > 0) {
          const prevType = getAssignedType(staffId, dayIdx - 1);
          if (prevType && violatesRest(prevType, shiftType)) return true;
        }
        // Check this assignment → next day
        if (dayIdx < weekDates.length - 1) {
          const nextType = getAssignedType(staffId, dayIdx + 1);
          if (nextType && violatesRest(shiftType, nextType)) return true;
        }
        return false;
      };

      // ---- Per-staff helpers ----
      const getStaffState = (staff: ResourceListItem) => {
        let shiftCount = 0;
        let nightCount = 0;
        const emptyDays: number[] = [];

        for (let i = 0; i < weekDates.length; i++) {
          const t = getAssignedType(staff.id, i);
          if (t) {
            shiftCount++;
            if (t === 'NIGHT') nightCount++;
          } else {
            emptyDays.push(i);
          }
        }
        return { shiftCount, nightCount, emptyDays };
      };

      if (useMultiType) {
        // ================================================================
        // Multi-type mode: ensure every day has coverage for EACH active
        // shift type. Iterate (day × shiftType), pick the best staff.
        // ================================================================

        type WorkSlot = { dayIdx: number; shiftType: ShiftType };
        const slots: WorkSlot[] = [];

        for (let dayIdx = 0; dayIdx < weekDates.length; dayIdx++) {
          for (const st of activeTypes) {
            const current = dayCoverage[dayIdx]!.get(st) ?? 0;
            if (current === 0) {
              slots.push({ dayIdx, shiftType: st });
            }
          }
        }

        // Sort: prioritise under-staffed days, then harder-to-fill types (NIGHT)
        slots.sort((a, b) => {
          const covDiff = dayTotalCoverage(a.dayIdx) - dayTotalCoverage(b.dayIdx);
          if (covDiff !== 0) return covDiff;
          if (a.shiftType === 'NIGHT' && b.shiftType !== 'NIGHT') return -1;
          if (b.shiftType === 'NIGHT' && a.shiftType !== 'NIGHT') return 1;
          return a.dayIdx - b.dayIdx;
        });

        const staffShiftCount = new Map<number, number>();
        const staffNightCount = new Map<number, number>();
        const staffAssignedDays = new Map<number, Set<number>>();

        for (const staff of staffList) {
          const s = getStaffState(staff);
          staffShiftCount.set(staff.id, s.shiftCount);
          staffNightCount.set(staff.id, s.nightCount);
          const assigned = new Set<number>();
          for (let i = 0; i < weekDates.length; i++) {
            if (!s.emptyDays.includes(i)) assigned.add(i);
          }
          staffAssignedDays.set(staff.id, assigned);
        }

        for (const slot of slots) {
          const { dayIdx, shiftType } = slot;
          const date = weekDates[dayIdx]!;
          const dayOfWeek = new Date(date + 'T00:00:00').getDay();

          let bestStaff: ResourceListItem | null = null;
          let bestScore = Infinity;

          for (const staff of staffList) {
            const id = staff.id;
            const sc = staffShiftCount.get(id) ?? 0;
            if (sc >= maxDaysPerStaff) continue;

            const assignedDays = staffAssignedDays.get(id)!;
            if (assignedDays.has(dayIdx)) continue;

            const blocked = blockedTypes.get(id);
            if (blocked?.has(shiftType)) continue;

            if (noWeekendStaff.has(id) && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
            if (shiftType === 'NIGHT' && (staffNightCount.get(id) ?? 0) >= maxNights) continue;

            // Rest/continuity check
            if (wouldViolateRest(id, dayIdx, shiftType)) continue;

            const score = sc;
            if (score < bestScore) {
              bestScore = score;
              bestStaff = staff;
            }
          }

          if (!bestStaff) continue;

          const key = cellKey(bestStaff.id, date);
          next.set(key, shiftType);
          recordAssignment(bestStaff.id, dayIdx, shiftType);

          staffShiftCount.set(bestStaff.id, (staffShiftCount.get(bestStaff.id) ?? 0) + 1);
          if (shiftType === 'NIGHT') {
            staffNightCount.set(bestStaff.id, (staffNightCount.get(bestStaff.id) ?? 0) + 1);
          }
          staffAssignedDays.get(bestStaff.id)!.add(dayIdx);
          dayCoverage[dayIdx]!.set(shiftType, (dayCoverage[dayIdx]!.get(shiftType) ?? 0) + 1);
          filled++;
        }

        // Second pass: fill remaining staff capacity with active types
        for (const staff of staffList) {
          const id = staff.id;
          const sc = staffShiftCount.get(id) ?? 0;
          const slotsLeft = maxDaysPerStaff - sc;
          if (slotsLeft <= 0) continue;

          const assignedDays = staffAssignedDays.get(id)!;
          const blocked = blockedTypes.get(id);
          const isNoWeekend = noWeekendStaff.has(id);

          const emptyDays: number[] = [];
          for (let i = 0; i < weekDates.length; i++) {
            if (!assignedDays.has(i)) emptyDays.push(i);
          }
          emptyDays.sort((a, b) => dayTotalCoverage(a) - dayTotalCoverage(b));

          let slotsFilled = 0;
          for (const dayIdx of emptyDays) {
            if (slotsFilled >= slotsLeft) break;

            const date = weekDates[dayIdx]!;
            const dayOfWeek = new Date(date + 'T00:00:00').getDay();
            if (isNoWeekend && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

            // Pick the active type with lowest coverage that doesn't violate rest
            let bestType: ShiftType | null = null;
            let bestCov = Infinity;
            for (const st of activeTypes) {
              if (blocked?.has(st)) continue;
              if (st === 'NIGHT' && (staffNightCount.get(id) ?? 0) >= maxNights) continue;
              if (wouldViolateRest(id, dayIdx, st)) continue;
              const cov = dayCoverage[dayIdx]!.get(st) ?? 0;
              if (cov < bestCov) {
                bestCov = cov;
                bestType = st;
              }
            }
            if (!bestType) continue;

            const key = cellKey(id, date);
            next.set(key, bestType);
            recordAssignment(id, dayIdx, bestType);
            staffShiftCount.set(id, (staffShiftCount.get(id) ?? 0) + 1);
            if (bestType === 'NIGHT') {
              staffNightCount.set(id, (staffNightCount.get(id) ?? 0) + 1);
            }
            assignedDays.add(dayIdx);
            dayCoverage[dayIdx]!.set(bestType, (dayCoverage[dayIdx]!.get(bestType) ?? 0) + 1);
            slotsFilled++;
            filled++;
          }
        }

        // Third pass: assign OFF/REST to remaining empty days
        // Use REST for days following a night shift, OFF otherwise
        for (const staff of staffList) {
          const id = staff.id;
          const assignedDays = staffAssignedDays.get(id)!;
          for (let i = 0; i < weekDates.length; i++) {
            if (assignedDays.has(i)) continue;
            const date = weekDates[i]!;
            const key = cellKey(id, date);
            // If already has something saved, skip
            const saved = existingShifts.get(key);
            if (saved && !(next.has(key) && next.get(key) === null)) continue;

            const prevType = i > 0 ? getAssignedType(id, i - 1) : null;
            const offType: ShiftType = prevType === 'NIGHT' ? 'REST' as ShiftType : 'OFF' as ShiftType;
            next.set(key, offType);
            recordAssignment(id, i, offType);
            assignedDays.add(i);
            filled++;
          }
        }
      } else {
        // ================================================================
        // Legacy mode: single pattern / paint type (backward-compatible)
        // ================================================================
        const pattern = activeTypes;

        for (const staff of staffList) {
          const staffBlocked = blockedTypes.get(staff.id);
          const isNoWeekend = noWeekendStaff.has(staff.id);
          const { shiftCount: staffShiftCount, nightCount: staffNightCount, emptyDays: emptyDayIndices } = getStaffState(staff);
          let nightCount = staffNightCount;

          const slotsToFill = Math.max(0, maxDaysPerStaff - staffShiftCount);
          if (slotsToFill === 0 || emptyDayIndices.length === 0) continue;

          const sorted = [...emptyDayIndices].sort(
            (a, b) => dayTotalCoverage(a) - dayTotalCoverage(b)
          );

          let slotsFilled = 0;
          for (const dayIdx of sorted) {
            if (slotsFilled >= slotsToFill) break;

            const date = weekDates[dayIdx]!;
            const dayOfWeek = new Date(date + 'T00:00:00').getDay();
            if (isNoWeekend && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

            const patternIdx = slotsFilled % pattern.length;
            let shiftType = pattern[patternIdx]!;

            if (staffBlocked?.has(shiftType)) {
              let found = false;
              for (let p = 1; p < pattern.length; p++) {
                const alt = pattern[(patternIdx + p) % pattern.length]!;
                if (!staffBlocked.has(alt)) {
                  if (alt === 'NIGHT' && nightCount >= maxNights) continue;
                  shiftType = alt;
                  found = true;
                  break;
                }
              }
              if (!found) continue;
            }

            if (shiftType === 'NIGHT' && nightCount >= maxNights) {
              const fallback = pattern.find(
                (t) => t !== 'NIGHT' && !staffBlocked?.has(t)
              );
              if (fallback) {
                shiftType = fallback;
              } else {
                continue;
              }
            }

            // Rest/continuity check
            if (wouldViolateRest(staff.id, dayIdx, shiftType)) continue;

            const key = cellKey(staff.id, date);
            next.set(key, shiftType);
            recordAssignment(staff.id, dayIdx, shiftType);
            dayCoverage[dayIdx]!.set(shiftType, (dayCoverage[dayIdx]!.get(shiftType) ?? 0) + 1);
            if (shiftType === 'NIGHT') nightCount++;
            slotsFilled++;
            filled++;
          }
        }
      }

      if (filled === 0) {
        toast.info('All staff already have enough shifts — nothing to fill');
        return prev;
      }

      const typeLabel = useMultiType
        ? `across ${activeTypes.length} shift types`
        : `using ${activeTypes.map((t) => SHIFT_MAP[t]?.label ?? t).join(', ')}`;
      toast.success(`Auto-filled ${filled} shift(s)`, {
        description: `Max ${maxDaysPerStaff} days/staff, ${typeLabel}`,
      });
      return next;
    });
  }, [paintType, staffList, weekDates, existingShifts, maxDaysPerStaff, blockedTypes, noWeekendStaff, schedulingSettings]);

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
  const today = new Date().toISOString().split('T')[0] ?? '';

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4">
        <PageHeader
          title="Weekly Roster"
          helpContent="Plan shifts for the week ahead. Click cells to assign shift types. Use the paint brush selector to choose a shift type, then click staff×day cells. Save when done."
          actions={
            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAutoFill}
                      disabled={staffList.length === 0}
                    >
                      <Wand2 className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Auto-Fill</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {(schedulingSettings?.active_shift_types?.length ?? 0) > 0
                        ? `Fill all active shift types (${schedulingSettings!.active_shift_types.join(', ')}), max ${maxDaysPerStaff} days/staff`
                        : `Fill empty cells with the selected shift type (max ${maxDaysPerStaff} days/staff)`
                      }
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePrint}
                disabled={staffList.length === 0}
              >
                <Printer className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Print</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={existingShifts.size === 0 || clearRosterMutation.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    {clearRosterMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    <span className="hidden sm:inline">Clear Week</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear this week&apos;s roster?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete all <strong>scheduled</strong> shifts for {weekLabel}.
                      Active, completed, and cancelled shifts will not be affected.
                      This action cannot be undone.
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
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/scheduling/roster/settings">
                        <Settings className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Roster Settings & Staff Constraints</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {hasDraftChanges && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft(new Map())}
                >
                  <Eraser className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Discard</span>
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!hasDraftChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                <span className="hidden sm:inline">
                  Save Roster{hasDraftChanges ? ` (${draft.size})` : ''}
                </span>
                <span className="sm:hidden">Save</span>
              </Button>
            </div>
          }
        />

        {/* Week Nav + Paint Brush */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Week Navigation */}
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={goToPrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              className="text-sm font-medium px-3 py-1 rounded-md hover:bg-muted transition-colors min-w-[200px] text-center"
              onClick={goToThisWeek}
            >
              {weekLabel}
            </button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Paint Brush Selector + Department */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">Paint:</span>
            <Select value={paintType} onValueChange={(v) => setPaintType(v as ShiftType)}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue>
                  {(() => {
                    const st = SHIFT_MAP[paintType];
                    return st ? (
                      <span className="flex items-center gap-1.5">
                        {st.icon}
                        <span>{st.label}</span>
                      </span>
                    ) : paintType;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Working</div>
                {SHIFT_TYPES.filter((st) => !st.isOff).map((st) => (
                  <SelectItem key={st.value} value={st.value}>
                    <span className="flex items-center gap-2">
                      {st.icon}
                      <span>{st.label}</span>
                      <span className="text-muted-foreground ml-auto">({st.start}–{st.end})</span>
                    </span>
                  </SelectItem>
                ))}
                <div className="px-2 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t">Off / Leave</div>
                {SHIFT_TYPES.filter((st) => st.isOff).map((st) => (
                  <SelectItem key={st.value} value={st.value}>
                    <span className="flex items-center gap-2">
                      {st.icon}
                      <span>{st.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={departmentFilter || '_none'} onValueChange={(v) => setDepartmentFilter(v === '_none' ? '' : v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">All Depts</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Select value={String(maxDaysPerStaff)} onValueChange={(v) => setMaxDaysPerStaff(Number(v))}>
                    <SelectTrigger className="w-[80px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 4, 5, 6, 7].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} days</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TooltipTrigger>
                <TooltipContent><p>Max days per staff for Auto-Fill</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-default">
                  <span className="inline-block w-3 h-3 rounded border-2 border-dashed border-primary/50 bg-primary/5" />
                  Unsaved
                </span>
              </TooltipTrigger>
              <TooltipContent><p>Draft changes not yet saved to the server</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-default">
                  <span className="inline-block w-3 h-3 rounded bg-muted border border-border" />
                  Saved
                </span>
              </TooltipTrigger>
              <TooltipContent><p>Shift already saved on the server</p></TooltipContent>
            </Tooltip>
            {SHIFT_TYPES.map((st) => (
              <Tooltip key={st.value}>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 cursor-default">
                    {st.icon} {st.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{st.label}{st.isOff ? '' : ` Shift`}</p>
                  {!st.isOff && <p className="text-muted-foreground">{st.start} – {st.end}</p>}
                  {st.isOff && <p className="text-muted-foreground">Non-working</p>}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>

        {/* Cross-facility conflicts banner */}
        {conflicts && conflicts.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-orange-800 dark:text-orange-300">
                {conflicts.length} cross-facility conflict{conflicts.length !== 1 ? 's' : ''} detected
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
                {Array.from(new Set(conflicts.map((c) => c.staff_resource_name))).join(', ')}
                {' — '}also scheduled at other facilities on overlapping dates. Check orange indicators on the grid.
              </p>
            </div>
          </div>
        )}

        {/* Roster Grid */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading roster...
              </div>
            ) : staffList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No staff resources found</p>
                <p className="text-xs mt-1">Sync staff profiles on the Resources page first.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b">
                      <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[180px] min-w-[140px]">
                        Staff
                      </th>
                      {weekDates.map((date, i) => {
                        const isToday = date === today;
                        return (
                          <th
                            key={date}
                            className={`px-1 py-2 text-center text-xs font-medium min-w-[80px] ${
                              isToday ? 'bg-primary/5' : ''
                            }`}
                          >
                            <div className={`${isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                              {DAY_LABELS[i]}
                            </div>
                            <div className={`text-[11px] ${isToday ? 'text-primary' : 'text-muted-foreground/70'}`}>
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
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                              {staff.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </div>
                            <span className="text-xs font-medium truncate">{staff.name}</span>
                          </div>
                        </td>
                        {weekDates.map((date, i) => {
                          const cell = getCellState(staff.id, date);
                          const isToday = date === today;
                          const shiftInfo = cell.type ? SHIFT_MAP[cell.type] : null;
                          const conflict = conflictMap.get(cellKey(staff.id, date));

                          return (
                            <td
                              key={date}
                              className={`px-1 py-1 text-center cursor-pointer transition-colors ${
                                isToday ? 'bg-primary/5' : ''
                              } ${conflict ? 'bg-orange-50 dark:bg-orange-950/20' : ''} hover:bg-muted/50`}
                              onClick={() => handleCellClick(staff.id, date)}
                            >
                              <div className="relative inline-block">
                                {cell.type && shiftInfo ? (
                                  <div
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${
                                      shiftInfo.color
                                    } ${cell.isDraft ? 'border-dashed border-2 border-primary/50' : ''}`}
                                  >
                                    {shiftInfo.icon}
                                    <span className="hidden sm:inline">{shiftInfo.short}</span>
                                  </div>
                                ) : cell.isRemoval ? (
                                  <div className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-destructive/60 border border-dashed border-destructive/30">
                                    —
                                  </div>
                                ) : (
                                  <div className="h-6 w-full rounded hover:bg-muted/60 transition-colors" />
                                )}
                                {conflict && (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                                          <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500 text-white text-[7px] font-bold items-center justify-center">!</span>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-[220px]">
                                        <p className="text-xs font-medium">Cross-facility conflict</p>
                                        <p className="text-xs text-muted-foreground">
                                          Also scheduled at {conflict.other_facility.name} ({conflict.other_shift.shift_type} {conflict.other_shift.start_time}–{conflict.other_shift.end_time})
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

        {/* Summary bar */}
        {hasDraftChanges && (
          <div className="sticky bottom-4 z-20">
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="py-3 px-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <span className="font-medium">
                    {draft.size} unsaved change{draft.size !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDraft(new Map())}>
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
