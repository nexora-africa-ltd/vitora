/**
 * Hook that checks if the current user has an active shift (clocked in).
 *
 * Used to gate clinical write actions on the frontend — buttons are
 * disabled with a tooltip instead of letting the user complete work
 * only to get a 403.
 *
 * Re-uses the existing ['my-shift-today'] React Query cache so no
 * additional API calls are made.
 */

import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from '@/lib/api/scheduling';
import type { AttendanceStatus } from '@/lib/types/scheduling';

const ON_DUTY_STATUSES: Set<AttendanceStatus> = new Set(['CLOCKED_IN', 'ON_BREAK']);

export function useRequiresActiveShift() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-shift-today'],
    queryFn: () => attendanceApi.myToday(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const status = data?.attendance_status ?? 'NO_SHIFT';
  const isOnDuty = ON_DUTY_STATUSES.has(status as AttendanceStatus);

  return {
    /** Whether the user is currently clocked in (ACTIVE or ON_BREAK). */
    isOnDuty,
    /** True while the query is loading — use to avoid flashing a disabled state. */
    isLoading,
    /** The raw attendance status for display purposes. */
    attendanceStatus: status as AttendanceStatus,
    /** Tooltip text to show on disabled buttons. */
    gateTooltip: isOnDuty
      ? undefined
      : 'You must clock in before performing this action',
    /**
     * Append `?emergency_override=true` to bypass the backend gate.
     * Use sparingly — logged in AuditLog.
     */
    emergencyOverrideParam: '?emergency_override=true',
  };
}
