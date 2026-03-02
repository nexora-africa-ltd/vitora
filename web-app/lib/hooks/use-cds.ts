/**
 * CDS (Clinical Decision Support) React Query Hooks
 *
 * Provides hooks for fetching and acting on CDS alerts within encounters.
 * Advisory-only — alerts inform but never block clinical workflow.
 *
 * @module lib/hooks/use-cds
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cdsApi } from '@/lib/api/cds';

// =============================================================================
// Query Keys
// =============================================================================

export const cdsKeys = {
  all: ['cds'] as const,
  alerts: () => [...cdsKeys.all, 'alerts'] as const,
  encounterAlerts: (encounterId: number) => [...cdsKeys.alerts(), 'encounter', encounterId] as const,
  patientAlerts: (patientId: number) => [...cdsKeys.alerts(), 'patient', patientId] as const,
  dashboard: () => [...cdsKeys.all, 'dashboard'] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch pending CDS alerts for a specific encounter.
 * Returns alerts sorted by priority (CRITICAL first).
 */
export function useEncounterCDSAlerts(encounterId: number | null | undefined) {
  return useQuery({
    queryKey: cdsKeys.encounterAlerts(encounterId!),
    queryFn: () => cdsApi.getPendingAlerts({ encounter: encounterId! }),
    enabled: !!encounterId,
    staleTime: 30_000, // 30s — alerts don't change that quickly
    refetchOnWindowFocus: true,
  });
}

/**
 * Evaluate CDS rules against an encounter (trigger new alerts).
 */
export function useEvaluateEncounterCDS() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (encounterId: number) => cdsApi.evaluateEncounter(encounterId),
    onSuccess: (_data, encounterId) => {
      // Invalidate encounter alerts cache so new alerts are fetched
      queryClient.invalidateQueries({ queryKey: cdsKeys.encounterAlerts(encounterId) });
    },
  });
}

/**
 * Acknowledge a CDS alert (mark as seen).
 */
export function useAcknowledgeCDSAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: number) => cdsApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cdsKeys.alerts() });
    },
  });
}

/**
 * Accept a CDS alert recommendation.
 */
export function useAcceptCDSAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: number) => cdsApi.acceptAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cdsKeys.alerts() });
    },
  });
}

/**
 * Override a CDS alert with a documented reason.
 */
export function useOverrideCDSAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId, reason }: { alertId: number; reason: string }) =>
      cdsApi.overrideAlert(alertId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cdsKeys.alerts() });
    },
  });
}

/**
 * Dismiss a low-priority CDS alert.
 */
export function useDismissCDSAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: number) => cdsApi.dismissAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cdsKeys.alerts() });
    },
  });
}
