'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Box,
  Building2,
  Calendar,
  Clock,
  MapPin,
  Power,
  PowerOff,
  Star,
  User,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { resourcesApi, shiftsApi } from '@/lib/api/scheduling';
import type { ResourceType, ShiftListItem } from '@/lib/types/scheduling';
import { cn } from '@/lib/utils/cn';

const typeIcons: Record<ResourceType, React.ReactNode> = {
  PERSON: <User className="h-5 w-5" />,
  PLACE: <MapPin className="h-5 w-5" />,
  ASSET: <Box className="h-5 w-5" />,
};

const typeColors: Record<ResourceType, string> = {
  PERSON: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PLACE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ASSET: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const shiftStatusColors: Record<string, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ON_BREAK: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const resourceId = Number(params.id);

  // Resource detail
  const { data: resource, isLoading } = useQuery({
    queryKey: ['resource-detail', resourceId],
    queryFn: () => resourcesApi.get(resourceId),
    enabled: !!resourceId,
  });

  // Linked clinics (only for PLACE resources)
  const { data: linkedClinics = [] } = useQuery({
    queryKey: ['resource-linked-clinics', resourceId, resource?.resource_type],
    queryFn: () => resourcesApi.linkedClinics(resourceId),
    enabled: !!resourceId && resource?.resource_type === 'PLACE',
  });

  // Today's shifts — for PLACE: shifts clocked into this room OR any linked clinic
  const todayStr = today();
  const { data: todayShiftsData } = useQuery({
    queryKey: ['resource-shifts-today', resourceId, todayStr, resource?.resource_type],
    queryFn: () => {
      if (resource?.resource_type === 'PERSON') {
        return shiftsApi.list({
          staff_resource: resourceId,
          from_date: todayStr,
          to_date: todayStr,
          page_size: 50,
          ordering: 'start_time',
        });
      }
      // PLACE: show shifts for this room OR any clinic linked to it
      return shiftsApi.list({
        room_or_linked_clinic: resourceId,
        from_date: todayStr,
        to_date: todayStr,
        page_size: 50,
        ordering: 'start_time',
      });
    },
    enabled: !!resourceId && !!resource,
  });

  // Recent shifts (last 7 days) — for PERSON or PLACE
  const weekAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: recentShiftsData } = useQuery({
    queryKey: ['resource-shifts-recent', resourceId, weekAgo, todayStr, resource?.resource_type],
    queryFn: () => {
      const baseParams = {
        from_date: weekAgo,
        to_date: todayStr,
        page_size: 50,
        ordering: '-shift_date,-start_time',
      };
      if (resource?.resource_type === 'PERSON') {
        return shiftsApi.list({ ...baseParams, staff_resource: resourceId });
      }
      // PLACE: shifts for this room OR any linked clinic
      return shiftsApi.list({ ...baseParams, room_or_linked_clinic: resourceId });
    },
    enabled: !!resourceId && !!resource,
  });

  const todayShifts = todayShiftsData?.results ?? [];
  const recentShifts = recentShiftsData?.results ?? [];
  const activeShifts = todayShifts.filter((s) => s.status === 'ACTIVE' || s.status === 'ON_BREAK');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Box className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Resource not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={resource.name}
        helpContent={`${resource.resource_type} resource: ${resource.description || 'No description'}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <div className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1', typeColors[resource.resource_type])}>
            {typeIcons[resource.resource_type]}
            <span className="font-medium text-sm">{resource.resource_type}</span>
          </div>
          <code className="text-sm bg-muted px-2 py-0.5 rounded">{resource.code}</code>
          {resource.capacity > 1 && (
            <span className="text-sm text-muted-foreground">
              Capacity: {resource.capacity}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={resource.is_active ? 'default' : 'outline'}
            className={cn(
              'gap-1 w-fit',
              resource.is_active
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : '',
            )}
          >
            {resource.is_active ? (
              <><Power className="h-3 w-3" /> Active</>
            ) : (
              <><PowerOff className="h-3 w-3" /> Inactive</>
            )}
          </Badge>
          {resource.department_name && (
            <span className="text-sm text-muted-foreground">
              {resource.department_name}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Active Now */}
        {resource.resource_type === 'PLACE' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-green-500" />
                Active Now
                {activeShifts.length > 0 && (
                  <Badge variant="default" className="ml-auto bg-green-600">
                    {activeShifts.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No one currently in this room
                </p>
              ) : (
                <div className="space-y-2">
                  {activeShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{shift.staff_resource_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={shiftStatusColors[shift.status]}>
                          {shift.status === 'ON_BREAK' ? 'Break' : 'Active'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Linked Clinics */}
        {resource.resource_type === 'PLACE' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                Linked Clinics
                {linkedClinics.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-auto">
                    {linkedClinics.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {linkedClinics.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Not linked to any clinic
                </p>
              ) : (
                <div className="space-y-2">
                  {linkedClinics.map((lc) => (
                    <Link
                      key={lc.clinic_room_id}
                      href={`/clinics/${lc.clinic_id}`}
                      className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{lc.clinic_name}</span>
                        <code className="text-xs text-muted-foreground">{lc.clinic_code}</code>
                      </div>
                      {lc.is_default && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Star className="h-3 w-3" /> Default
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Today's Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Today&apos;s Schedule
            {todayShifts.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-auto">
                {todayShifts.length} shift{todayShifts.length !== 1 ? 's' : ''}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No shifts scheduled for today
            </p>
          ) : (
            <>
              {/* Visual timeline */}
              <div className="mb-4 hidden sm:block">
                <ShiftTimeline shifts={todayShifts} />
              </div>
              {/* Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayShifts.map((shift) => (
                      <TableRow key={shift.id}>
                        <TableCell className="font-medium">{shift.staff_resource_name}</TableCell>
                        <TableCell className="tabular-nums text-sm">
                          {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{shift.shift_type_display}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={shiftStatusColors[shift.status] ?? ''}>
                            {shift.status_display}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity (last 7 days) */}
      {recentShifts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Activity (7 days)
              <span className="text-sm font-normal text-muted-foreground ml-auto">
                {recentShifts.length} shift{recentShifts.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead className="hidden sm:table-cell">Time</TableHead>
                    <TableHead>Status</TableHead>
                    {resource.resource_type === 'PERSON' && (
                      <TableHead className="hidden md:table-cell">Room</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentShifts.map((shift) => (
                    <TableRow key={shift.id}>
                      <TableCell className="tabular-nums text-sm">{shift.shift_date}</TableCell>
                      <TableCell className="font-medium text-sm">{shift.staff_resource_name}</TableCell>
                      <TableCell className="hidden sm:table-cell tabular-nums text-sm">
                        {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                      </TableCell>
                      <TableCell>
                        <Badge className={shiftStatusColors[shift.status] ?? ''}>
                          {shift.status_display}
                        </Badge>
                      </TableCell>
                      {resource.resource_type === 'PERSON' && (
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {shift.room_name ?? '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Description & metadata */}
      {resource.description && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{resource.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// Shift Timeline Visualization
// =============================================================================

const HOUR_START = 0; // midnight
const HOUR_END = 24; // midnight
const TOTAL_HOURS = HOUR_END - HOUR_START;
const LABEL_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/** Shift types that are non-working (off/leave/rest) — excluded from timeline bars */
const OFF_SHIFT_TYPES = new Set([
  'OFF', 'DAY_OFF', 'NIGHT_OFF', 'AFTERNOON_OFF', 'LEAVE', 'SICK_LEAVE', 'REST',
]);

const timelineColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-lime-500',
];

const TITLE_PREFIXES = ['dr.', 'prof.', 'mr.', 'mrs.', 'ms.', 'nurse'];

/** Show first real name, skipping honorific titles like "Dr." */
function getShortName(fullName: string): string {
  const parts = fullName.split(' ').filter(Boolean);
  if (parts.length <= 1) return fullName;
  const first = parts[0]!.toLowerCase().replace(/\.$/, '');
  if (TITLE_PREFIXES.includes(first) || TITLE_PREFIXES.includes(first + '.')) {
    return parts.slice(1, 3).join(' ');
  }
  return parts[0]!;
}

function timeToFraction(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return (h + m / 60 - HOUR_START) / TOTAL_HOURS;
}

function ShiftTimeline({ shifts }: { shifts: ShiftListItem[] }) {
  const workingShifts = shifts.filter((s) => !OFF_SHIFT_TYPES.has(s.shift_type));
  const gridHours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => HOUR_START + i);

  if (workingShifts.length === 0) return null;

  return (
    <div className="overflow-x-auto">
    <div className="relative min-w-[480px]">
      {/* Hour markers */}
      <div className="relative flex text-xs text-muted-foreground mb-1 px-0.5" style={{ height: '1.25rem' }}>
        {LABEL_HOURS.map((h) => {
          const left = ((h - HOUR_START) / TOTAL_HOURS) * 100;
          return (
            <span
              key={h}
              className="absolute tabular-nums -translate-x-1/2"
              style={{ left: `${left}%` }}
            >
              {(h % 24).toString().padStart(2, '0')}
            </span>
          );
        })}
      </div>

      {/* Grid background */}
      <div className="relative h-auto min-h-[40px] bg-muted/30 rounded-md border overflow-hidden">
        {/* Grid lines */}
        {gridHours.map((h) => {
          const left = ((h - HOUR_START) / TOTAL_HOURS) * 100;
          return (
            <div
              key={h}
              className={cn(
                'absolute top-0 bottom-0 border-l',
                LABEL_HOURS.includes(h)
                  ? 'border-muted-foreground/20'
                  : 'border-muted-foreground/5',
              )}
              style={{ left: `${left}%` }}
            />
          );
        })}

        {/* Current time marker */}
        <CurrentTimeMarker />

        {/* Shift bars */}
        <div className="relative space-y-1 py-1.5 px-0.5">
          {workingShifts.map((shift, i) => {
            const startFrac = Math.max(0, timeToFraction(shift.start_time));
            let endFrac = Math.min(1, timeToFraction(shift.end_time));
            // Overnight shift (end < start) — extend bar to end of day
            if (endFrac <= startFrac) endFrac = 1;
            const width = Math.max(0, endFrac - startFrac);
            const colorClass = timelineColors[i % timelineColors.length];
            const isActive = shift.status === 'ACTIVE' || shift.status === 'ON_BREAK';

            return (
              <div key={shift.id} className="relative h-7">
                <div
                  className={cn(
                    'absolute top-0 h-full rounded-sm flex items-center px-2 text-xs font-medium text-white truncate',
                    colorClass,
                    isActive && 'ring-2 ring-white/50',
                    shift.status === 'CANCELLED' && 'opacity-30 line-through',
                  )}
                  style={{
                    left: `${startFrac * 100}%`,
                    width: `${width * 100}%`,
                    minWidth: '2rem',
                  }}
                  title={`${shift.staff_resource_name}: ${shift.start_time.slice(0, 5)} — ${shift.end_time.slice(0, 5)} (${shift.status_display})`}
                >
                  {getShortName(shift.staff_resource_name)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </div>
  );
}

function CurrentTimeMarker() {
  const now = new Date();
  const frac = (now.getHours() + now.getMinutes() / 60 - HOUR_START) / TOTAL_HOURS;
  if (frac < 0 || frac > 1) return null;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
      style={{ left: `${frac * 100}%` }}
    >
      <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
    </div>
  );
}
