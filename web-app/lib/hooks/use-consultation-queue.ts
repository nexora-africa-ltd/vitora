/**
 * React hooks for consultation queue operations.
 *
 * Phase 3.3: Call Patient Functionality
 *
 * Provides hooks for:
 * - Fetching the consultation queue
 * - Calling patients
 * - Starting consultations
 * - Bypassing triage
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consultationQueueApi } from '@/lib/api/consultation-queue';
import type { ConsultationQueueFilters } from '@/lib/types/encounter';

// =============================================================================
// Query Keys
// =============================================================================

export const consultationQueueKeys = {
  all: ['consultation-queue'] as const,
  list: (filters?: ConsultationQueueFilters) => 
    [...consultationQueueKeys.all, 'list', filters] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook for fetching the consultation queue.
 *
 * @param filters - Optional filters (consultation_status, triage_status, search)
 * @returns Query result with consultation queue data
 */
export function useConsultationQueue(filters?: ConsultationQueueFilters) {
  return useQuery({
    queryKey: consultationQueueKeys.list(filters),
    queryFn: () => consultationQueueApi.getQueue(filters),
    // Refetch every 30 seconds for real-time updates
    refetchInterval: 30000,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook for calling a patient for consultation.
 *
 * Updates consultation_status to CALLED and triggers a notification.
 *
 * @returns Mutation for calling a patient
 */
export function useCallPatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (encounterId: number) => consultationQueueApi.callPatient(encounterId),
    onSuccess: () => {
      // Invalidate consultation queue to refetch
      queryClient.invalidateQueries({ queryKey: consultationQueueKeys.all });
      // Also invalidate encounters list
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
  });
}

/**
 * Hook for starting a consultation.
 *
 * Updates consultation_status to IN_PROGRESS and records start time.
 *
 * @returns Mutation for starting consultation
 */
export function useStartConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (encounterId: number) => consultationQueueApi.startConsultation(encounterId),
    onSuccess: () => {
      // Invalidate consultation queue to refetch
      queryClient.invalidateQueries({ queryKey: consultationQueueKeys.all });
      // Also invalidate encounters list
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
  });
}

/**
 * Hook for bypassing triage.
 *
 * Only allowed for OPTIONAL triage encounters.
 * Sets triage_status to BYPASSED with the given reason.
 *
 * @returns Mutation for bypassing triage
 */
export function useBypassTriage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      encounterId, 
      reason, 
      notes 
    }: { 
      encounterId: number; 
      reason: string; 
      notes?: string;
    }) => consultationQueueApi.bypassTriage(encounterId, reason, notes),
    onSuccess: () => {
      // Invalidate consultation queue to refetch
      queryClient.invalidateQueries({ queryKey: consultationQueueKeys.all });
      // Also invalidate encounters list
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
  });
}
