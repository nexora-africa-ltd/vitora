'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  LogIn,
  LogOut,
  Timer,
  CalendarOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Coffee,
  Play,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { attendanceApi } from '@/lib/api/scheduling';
import { getApiErrorMessage } from '@/lib/api/client';
import { ClockInDialog } from './clock-in-dialog';
import { EmergencyClockInDialog } from './emergency-clock-in-dialog';
import type { AttendanceStatus, Shift, ClockInPayload, EmergencyClockInPayload } from '@/lib/types/scheduling';

// =============================================================================
// Helpers
// =============================================================================

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h ?? '0', 10);
  const min = m ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'less than a minute';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getShiftProgress(shift: Shift): { percent: number; elapsed: string; remaining: string } {
  const now = new Date();
  const date = shift.shift_date;
  const start = new Date(`${date}T${shift.start_time}`);
  let end = new Date(`${date}T${shift.end_time}`);

  // Handle overnight shifts
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  const totalMin = (end.getTime() - start.getTime()) / 60000;
  const elapsedMin = (now.getTime() - start.getTime()) / 60000;
  const remainingMin = Math.max(0, totalMin - elapsedMin);
  const percent = Math.min(100, Math.max(0, (elapsedMin / totalMin) * 100));

  return {
    percent: Math.round(percent),
    elapsed: formatDuration(Math.max(0, elapsedMin)),
    remaining: formatDuration(remainingMin),
  };
}

function getTimeUntilShift(shift: Shift): { label: string; isOverdue: boolean; minutes: number } {
  const now = new Date();
  const date = shift.shift_date;
  const start = new Date(`${date}T${shift.start_time}`);
  const diffMin = (start.getTime() - now.getTime()) / 60000;

  if (diffMin > 0) {
    return { label: `starts in ${formatDuration(diffMin)}`, isOverdue: false, minutes: diffMin };
  }
  return { label: `started ${formatDuration(Math.abs(diffMin))} ago`, isOverdue: true, minutes: diffMin };
}

function isPastShiftEndTime(shift: Shift): boolean {
  const now = new Date();
  const date = shift.shift_date;
  const start = new Date(`${date}T${shift.start_time}`);
  let end = new Date(`${date}T${shift.end_time}`);

  // Handle overnight shifts
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  return now > end;
}

// =============================================================================
// Shift Greeting Line
// =============================================================================

interface ShiftGreetingProps {
  greetingLabel: string;
  nameWithTitle: string;
  attendanceStatus: AttendanceStatus;
  shift: Shift | null;
}

export function ShiftGreetingLine({ greetingLabel, nameWithTitle, attendanceStatus, shift }: ShiftGreetingProps) {
  const shiftInfo = useMemo(() => {
    if (!shift) return null;
    if (attendanceStatus === 'CLOCKED_IN') return getShiftProgress(shift);
    if (attendanceStatus === 'UPCOMING' || attendanceStatus === 'SHOULD_CLOCK_IN') return getTimeUntilShift(shift);
    return null;
  }, [shift, attendanceStatus]);

  const typeLabel = shift?.shift_type_display ?? shift?.shift_type ?? '';

  switch (attendanceStatus) {
    case 'NO_SHIFT':
      return (
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          {greetingLabel}, {nameWithTitle} <span aria-hidden="true">👋</span>
        </h2>
      );

    case 'UPCOMING': {
      const info = shiftInfo as { label: string; minutes: number };
      return (
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            {greetingLabel}, {nameWithTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            Your <span className="font-medium text-foreground">{typeLabel}</span> shift {info?.label ?? ''}
          </p>
        </div>
      );
    }

    case 'SHOULD_CLOCK_IN': {
      const info = shiftInfo as { label: string; isOverdue: boolean };
      return (
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            {greetingLabel}, {nameWithTitle}
          </h2>
          <p className="text-sm text-destructive font-medium">
            Your <span>{typeLabel}</span> shift {info?.label ?? ''} — please clock in
          </p>
        </div>
      );
    }

    case 'CLOCKED_IN': {
      const progress = shiftInfo as { percent: number; remaining: string; elapsed: string };
      return (
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            {greetingLabel}, {nameWithTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            On duty — <span className="font-medium text-foreground">{progress?.remaining ?? ''}</span> remaining
          </p>
        </div>
      );
    }

    case 'COMPLETED':
      return (
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            {greetingLabel}, {nameWithTitle} <span aria-hidden="true">✅</span>
          </h2>
          <p className="text-sm text-muted-foreground">Shift complete. Rest well.</p>
        </div>
      );

    case 'ON_BREAK':
      return (
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            {greetingLabel}, {nameWithTitle} <span aria-hidden="true">☕</span>
          </h2>
          <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
            On break — remember to resume when you&apos;re back
          </p>
        </div>
      );

    default:
      return (
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          {greetingLabel}, {nameWithTitle} <span aria-hidden="true">👋</span>
        </h2>
      );
  }
}

// =============================================================================
// Today's Assignment Card
// =============================================================================

export function TodayAssignmentCard() {
  const queryClient = useQueryClient();
  const [clockInDialogOpen, setClockInDialogOpen] = useState(false);
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my-shift-today'],
    queryFn: () => attendanceApi.myToday(),
    refetchInterval: 60_000, // Refresh every minute
  });

  const clockInMutation = useMutation({
    mutationFn: ({ shiftId, payload }: { shiftId: number; payload?: ClockInPayload }) =>
      attendanceApi.clockIn(shiftId, payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      setClockInDialogOpen(false);
      const messages: string[] = ['Clocked in successfully'];
      if (response.session_auto_opened) {
        messages.push('Clinic session opened');
      }
      toast.success(messages.join('. '));
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: (shiftId: number) => attendanceApi.clockOut(shiftId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      const messages: string[] = ['Clocked out successfully'];
      if (response.session_auto_closed) {
        messages.push('Clinic session closed');
      }
      toast.success(messages.join('. '));
    },
    onError: () => toast.error('Failed to clock out'),
  });

  const takeBreakMutation = useMutation({
    mutationFn: (shiftId: number) => attendanceApi.takeBreak(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      toast.success('Break started');
    },
    onError: () => toast.error('Failed to take break'),
  });

  const resumeMutation = useMutation({
    mutationFn: (shiftId: number) => attendanceApi.resume(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      toast.success('Resumed shift');
    },
    onError: () => toast.error('Failed to resume shift'),
  });

  const emergencyClockInMutation = useMutation({
    mutationFn: (payload: EmergencyClockInPayload) => attendanceApi.emergencyClockIn(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['my-shift-today'] });
      queryClient.invalidateQueries({ queryKey: ['my-shift-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['roster-shifts'] });
      setEmergencyDialogOpen(false);
      const messages: string[] = ['Emergency clock-in successful'];
      if (response.session_auto_opened) {
        messages.push('Clinic session opened');
      }
      toast.success(messages.join('. '));
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const status = data?.attendance_status ?? 'NO_SHIFT';
  const shift = data?.shifts?.[0] ?? null;

  if (status === 'NO_SHIFT') {
    return (
      <>
      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <CalendarOff className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">No shift scheduled today</p>
              <p className="text-xs">Check the roster or use emergency clock-in if needed.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
              onClick={() => setEmergencyDialogOpen(true)}
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Emergency </span>Clock-In
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/scheduling/my-shifts">
                <span className="hidden sm:inline">My Shifts</span>
                <span className="sm:hidden">Shifts</span>
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <EmergencyClockInDialog
        open={emergencyDialogOpen}
        onOpenChange={setEmergencyDialogOpen}
        onConfirm={(payload) => emergencyClockInMutation.mutate(payload)}
        isPending={emergencyClockInMutation.isPending}
      />
      </>
    );
  }

  if (!shift) return null;

  const progress = (status === 'CLOCKED_IN' || status === 'ON_BREAK') ? getShiftProgress(shift) : null;
  const timeInfo = (status === 'UPCOMING' || status === 'SHOULD_CLOCK_IN') ? getTimeUntilShift(shift) : null;
  const isPending = clockInMutation.isPending || clockOutMutation.isPending || takeBreakMutation.isPending || resumeMutation.isPending || emergencyClockInMutation.isPending;

  return (
    <>
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardContent className="relative p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Shift info */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {status === 'CLOCKED_IN' ? (
                <Timer className="h-5 w-5 text-primary" />
              ) : status === 'ON_BREAK' ? (
                <Coffee className="h-5 w-5 text-amber-600" />
              ) : status === 'COMPLETED' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : status === 'SHOULD_CLOCK_IN' ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Clock className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">
                  {shift.shift_type_display ?? shift.shift_type}
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                </span>
                {shift.department && (
                  <Badge variant="outline" className="text-xs">{shift.department}</Badge>
                )}
                {shift.is_emergency && (
                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">Emergency</Badge>
                )}
              </div>

              {/* Status line */}
              {status === 'UPCOMING' && timeInfo && (
                <p className="text-xs text-muted-foreground">
                  Starts in <span className="font-medium text-foreground">{formatDuration(timeInfo.minutes)}</span>
                </p>
              )}
              {status === 'SHOULD_CLOCK_IN' && timeInfo && (
                isPastShiftEndTime(shift) ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Shift has ended — use emergency clock-in if needed
                  </p>
                ) : (
                  <p className="text-xs text-destructive font-medium">
                    Shift {timeInfo.label} — please clock in
                  </p>
                )
              )}
              {status === 'CLOCKED_IN' && progress && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{progress.elapsed} elapsed</span>
                    <span>·</span>
                    <span className="font-medium text-foreground">{progress.remaining} remaining</span>
                  </div>
                  {(shift.clinic_name || shift.room_name) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {shift.clinic_name}
                      {shift.room_name && <span>· {shift.room_name}</span>}
                    </div>
                  )}
                  <Progress value={progress.percent} className="h-1.5" />
                </div>
              )}
              {status === 'ON_BREAK' && progress && (
                <div className="space-y-1.5">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    On break — {progress.remaining} remaining in shift
                  </p>
                  {(shift.clinic_name || shift.room_name) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {shift.clinic_name}
                      {shift.room_name && <span>· {shift.room_name}</span>}
                    </div>
                  )}
                  <Progress value={progress.percent} className="h-1.5" />
                </div>
              )}
              {status === 'COMPLETED' && (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Shift completed
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {(status === 'UPCOMING' || status === 'SHOULD_CLOCK_IN') && (
              isPastShiftEndTime(shift) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  onClick={() => setEmergencyDialogOpen(true)}
                  disabled={isPending}
                >
                  <AlertCircle className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Emergency </span>Clock-In
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={status === 'SHOULD_CLOCK_IN' ? 'default' : 'outline'}
                  onClick={() => setClockInDialogOpen(true)}
                  disabled={isPending}
                >
                  <LogIn className="h-4 w-4 mr-1" />
                  Clock In
                </Button>
              )
            )}
            {status === 'CLOCKED_IN' && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => takeBreakMutation.mutate(shift.id)}
                  disabled={isPending}
                >
                  <Coffee className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Break</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clockOutMutation.mutate(shift.id)}
                  disabled={isPending}
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Clock Out</span>
                </Button>
              </>
            )}
            {status === 'ON_BREAK' && (
              <>
                <Button
                  size="sm"
                  onClick={() => resumeMutation.mutate(shift.id)}
                  disabled={isPending}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Resume
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clockOutMutation.mutate(shift.id)}
                  disabled={isPending}
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Clock Out</span>
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/scheduling/my-shifts">
                <span className="hidden sm:inline">My Shifts</span>
                <span className="sm:hidden">Shifts</span>
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <ClockInDialog
      open={clockInDialogOpen}
      onOpenChange={setClockInDialogOpen}
      onConfirm={(payload) => clockInMutation.mutate({ shiftId: shift.id, payload })}
      isPending={clockInMutation.isPending}
    />

    <EmergencyClockInDialog
      open={emergencyDialogOpen}
      onOpenChange={setEmergencyDialogOpen}
      onConfirm={(payload) => emergencyClockInMutation.mutate(payload)}
      isPending={emergencyClockInMutation.isPending}
    />
    </>
  );
}

// =============================================================================
// Hook to expose attendance data for the greeting
// =============================================================================

export function useMyTodayShift() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-shift-today'],
    queryFn: () => attendanceApi.myToday(),
    refetchInterval: 60_000,
  });

  return {
    attendanceStatus: data?.attendance_status ?? 'NO_SHIFT' as AttendanceStatus,
    primaryShift: data?.shifts?.[0] ?? null,
    isLoading,
  };
}
