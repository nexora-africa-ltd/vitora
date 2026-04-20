'use client';

import { useQuery } from '@tanstack/react-query';
import {
  UserCheck,
  AlertTriangle,
  UserX,
  Clock,
  Coffee,
  MapPin,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { attendanceApi } from '@/lib/api/scheduling';
import { DashboardListSkeleton, DashboardEmptyState } from './widget-primitives';
import type { OnDutyStaffEntry } from '@/lib/types/scheduling';

// =============================================================================
// Hook
// =============================================================================

export function useOnDuty(enabled = true) {
  return useQuery({
    queryKey: ['on-duty'],
    queryFn: () => attendanceApi.onDuty(),
    enabled,
    refetchInterval: 30_000, // Auto-refresh every 30s for live view
    staleTime: 15_000,
  });
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parts[1] ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

// =============================================================================
// Staff Row
// =============================================================================

function StaffRow({ entry, variant }: { entry: OnDutyStaffEntry; variant: 'active' | 'late' | 'absent' | 'upcoming' }) {
  const variantStyles = {
    active: 'border-emerald-500/20 bg-emerald-500/5',
    late: 'border-amber-500/20 bg-amber-500/5',
    absent: 'border-red-500/20 bg-red-500/5',
    upcoming: 'border-blue-500/20 bg-blue-500/5',
  };

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-2.5 text-sm', variantStyles[variant])}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.staff_name}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatTime(entry.start_time)} – {formatTime(entry.end_time)}</span>
          {entry.department && <span>· {entry.department}</span>}
          {entry.on_break && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
              <Coffee className="h-3 w-3" />
              Break
            </Badge>
          )}
          {entry.room_name && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" /> {entry.room_name}
            </span>
          )}
        </div>
      </div>
      {variant === 'late' && entry.minutes_overdue != null && entry.minutes_overdue > 0 && (
        <Badge variant="outline" className="shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
          {entry.minutes_overdue}m late
        </Badge>
      )}
      {variant === 'upcoming' && entry.starts_in_minutes != null && (
        <Badge variant="outline" className="shrink-0 border-blue-500/40 text-blue-600 dark:text-blue-400">
          in {entry.starts_in_minutes}m
        </Badge>
      )}
      {variant === 'active' && entry.late_minutes > 0 && (
        <Badge variant="outline" className="shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
          {entry.late_minutes}m late
        </Badge>
      )}
    </div>
  );
}

// =============================================================================
// Section
// =============================================================================

function Section({
  icon: Icon,
  label,
  count,
  entries,
  variant,
  iconColor,
  defaultExpanded = true,
}: {
  icon: typeof UserCheck;
  label: string;
  count: number;
  entries: OnDutyStaffEntry[];
  variant: 'active' | 'late' | 'absent' | 'upcoming';
  iconColor: string;
  defaultExpanded?: boolean;
}) {
  if (count === 0) return null;

  return (
    <details open={defaultExpanded} className="group">
      <summary className="flex cursor-pointer items-center gap-2 py-1 text-sm font-medium select-none list-none [&::-webkit-details-marker]:hidden">
        <Icon className={cn('h-4 w-4', iconColor)} />
        <span>{label}</span>
        <Badge variant="secondary" className="ml-auto text-xs">{count}</Badge>
        <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
      </summary>
      <div className="mt-1.5 space-y-1.5 pl-6">
        {entries.slice(0, 10).map((entry) => (
          <StaffRow key={entry.shift_id} entry={entry} variant={variant} />
        ))}
        {entries.length > 10 && (
          <p className="text-xs text-muted-foreground">+ {entries.length - 10} more</p>
        )}
      </div>
    </details>
  );
}

// =============================================================================
// Widget
// =============================================================================

export function OnDutyWidget({ enabled = true }: { enabled?: boolean }) {
  const { data, isLoading, isError } = useOnDuty(enabled);

  if (isLoading) return <DashboardListSkeleton rows={4} />;

  if (isError || !data) {
    return <DashboardEmptyState icon={UserCheck} title="Unavailable" description="Could not load on-duty data." />;
  }

  const { summary } = data;

  if (summary.total === 0) {
    return <DashboardEmptyState icon={Clock} title="No shifts today" description="No working shifts are scheduled for today." />;
  }

  return (
    <div className="space-y-3">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <SummaryChip icon={UserCheck} count={summary.clocked_in} label="On Duty" color="text-emerald-600 dark:text-emerald-400" />
        {summary.late > 0 && (
          <SummaryChip icon={AlertTriangle} count={summary.late} label="Late" color="text-amber-600 dark:text-amber-400" />
        )}
        {summary.absent > 0 && (
          <SummaryChip icon={UserX} count={summary.absent} label="Absent" color="text-red-600 dark:text-red-400" />
        )}
        <SummaryChip icon={Clock} count={summary.upcoming} label="Upcoming" color="text-blue-600 dark:text-blue-400" />
      </div>

      {/* Sections — late first (needs attention), then active, upcoming, absent */}
      <div className="space-y-2">
        <Section
          icon={AlertTriangle}
          label="Late (not clocked in)"
          count={summary.late}
          entries={data.late}
          variant="late"
          iconColor="text-amber-500"
        />
        <Section
          icon={UserCheck}
          label="On Duty"
          count={summary.clocked_in}
          entries={data.clocked_in}
          variant="active"
          iconColor="text-emerald-500"
        />
        <Section
          icon={Clock}
          label="Upcoming"
          count={summary.upcoming}
          entries={data.upcoming}
          variant="upcoming"
          iconColor="text-blue-500"
          defaultExpanded={false}
        />
        <Section
          icon={UserX}
          label="Absent"
          count={summary.absent}
          entries={data.absent}
          variant="absent"
          iconColor="text-red-500"
          defaultExpanded={false}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Summary Chip
// =============================================================================

function SummaryChip({
  icon: Icon,
  count,
  label,
  color,
}: {
  icon: typeof UserCheck;
  count: number;
  label: string;
  color: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium shadow-sm">
      <Icon className={cn('h-3.5 w-3.5', color)} />
      <span className={color}>{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
