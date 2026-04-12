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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { resourcesApi, shiftsApi } from '@/lib/api/scheduling';
import type {
  ShiftType,
  ShiftListItem,
  ShiftCreateData,
  ResourceListItem,
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
  const staffList = resourcesData?.results ?? [];

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

  // Get departments from existing data
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const shift of shiftsData?.results ?? []) {
      if (shift.department) set.add(shift.department);
    }
    return Array.from(set).sort();
  }, [shiftsData]);

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
    setDraft((prev) => {
      const next = new Map(prev);
      let filled = 0;

      // Count coverage per day (to prioritise under-staffed days)
      const dayCoverage: number[] = weekDates.map((date) => {
        let count = 0;
        for (const staff of staffList) {
          const key = cellKey(staff.id, date);
          const hasSaved = existingShifts.has(key);
          const hasDraft = next.has(key) && next.get(key) !== null;
          if (hasSaved || hasDraft) count++;
        }
        return count;
      });

      for (const staff of staffList) {
        // Count how many shifts this staff already has (saved + drafted)
        let staffShiftCount = 0;
        const emptyDayIndices: number[] = [];

        for (let i = 0; i < weekDates.length; i++) {
          const key = cellKey(staff.id, weekDates[i]!);
          const hasSaved = existingShifts.has(key);
          const draftVal = next.get(key);
          const hasDraft = next.has(key) && draftVal !== null;
          const markedForRemoval = next.has(key) && draftVal === null;

          if (markedForRemoval) {
            emptyDayIndices.push(i);
          } else if (hasSaved || hasDraft) {
            staffShiftCount++;
          } else {
            emptyDayIndices.push(i);
          }
        }

        const slotsToFill = Math.max(0, maxDaysPerStaff - staffShiftCount);
        if (slotsToFill === 0 || emptyDayIndices.length === 0) continue;

        // Sort empty days by ascending coverage so under-staffed days fill first
        const sorted = [...emptyDayIndices].sort(
          (a, b) => (dayCoverage[a] ?? 0) - (dayCoverage[b] ?? 0)
        );

        const toFill = sorted.slice(0, slotsToFill);
        for (const dayIdx of toFill) {
          const key = cellKey(staff.id, weekDates[dayIdx]!);
          next.set(key, paintType);
          // Update coverage count for subsequent staff
          dayCoverage[dayIdx] = (dayCoverage[dayIdx] ?? 0) + 1;
          filled++;
        }
      }

      if (filled === 0) {
        toast.info('All staff already have enough shifts — nothing to fill');
        return prev;
      }

      toast.success(`Auto-filled ${filled} shift(s)`, {
        description: `${paintType} shifts, max ${maxDaysPerStaff} days/staff`,
      });
      return next;
    });
  }, [paintType, staffList, weekDates, existingShifts, maxDaysPerStaff]);

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
                    <p>Fill empty cells with the selected shift type (max {maxDaysPerStaff} days/staff)</p>
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
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded border-2 border-dashed border-primary/50 bg-primary/5" />
            Unsaved
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-muted border border-border" />
            Saved
          </span>
          {SHIFT_TYPES.map((st) => (
            <span key={st.value} className="flex items-center gap-1">
              {st.icon} {st.label}
            </span>
          ))}
        </div>

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

                          return (
                            <td
                              key={date}
                              className={`px-1 py-1 text-center cursor-pointer transition-colors ${
                                isToday ? 'bg-primary/5' : ''
                              } hover:bg-muted/50`}
                              onClick={() => handleCellClick(staff.id, date)}
                            >
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
