/**
 * Check-in hooks for Vitora HMIS
 *
 * Sprint: Returning Patient Workflow - Sprint 1
 *
 * Provides React Query hooks for:
 * - Patient lookup with clinical snapshot
 * - Patient check-in
 * - Today's check-ins list
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { checkinApi } from '@/lib/api/checkin';
import type { CheckInRequest, TodayCheckinsResponse } from '@/lib/types/checkin';

// =============================================================================
// QUERY KEYS
// =============================================================================

export const checkinKeys = {
  all: ['checkin'] as const,
  lookup: (query: string) => [...checkinKeys.all, 'lookup', query] as const,
  today: () => [...checkinKeys.all, 'today'] as const,
  todayFiltered: (params: Record<string, unknown>) => [...checkinKeys.today(), params] as const,
};

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Hook for looking up a patient by MRN, phone, national ID, or name.
 *
 * Returns patient details with clinical snapshot and suggested visit context.
 *
 * @param query - Search query (MRN, phone, ID, or name)
 * @param options - Additional options (enabled)
 */
export function usePatientLookup(query: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: checkinKeys.lookup(query),
    queryFn: () => checkinApi.lookupPatient(query),
    enabled: (options?.enabled ?? true) && !!query && query.length >= 2,
    staleTime: 60000, // 1 minute
    retry: false, // Don't retry 404s
  });
}

/**
 * Hook for fetching today's check-ins
 *
 * @param params - Optional filters
 */
export function useTodayCheckins(params?: {
  destination_clinic?: number;
  status?: string;
  page?: number;
  page_size?: number;
}) {
  return useQuery({
    queryKey: params ? checkinKeys.todayFiltered(params) : checkinKeys.today(),
    queryFn: () => checkinApi.getTodayCheckins(params),
    staleTime: 30000, // 30 seconds - check-ins change frequently
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Hook for checking in a patient.
 *
 * Invalidates today's check-ins on success.
 */
export function useCheckinPatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      patientId,
      data,
    }: {
      patientId: number;
      data: CheckInRequest;
    }) => checkinApi.checkinPatient(patientId, data),
    onSuccess: () => {
      // Invalidate today's check-ins list
      queryClient.invalidateQueries({ queryKey: checkinKeys.today() });
      // Also invalidate triage queue if patient goes to triage
      queryClient.invalidateQueries({ queryKey: ['triage', 'waiting'] });
      // Also invalidate clinic queues
      queryClient.invalidateQueries({ queryKey: ['clinics'] });
    },
  });
}
