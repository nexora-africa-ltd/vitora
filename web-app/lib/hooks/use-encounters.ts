/**
 * React hooks for encounter data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { encountersApi, PreTriageQueueParams } from '@/lib/api/encounters';
import { EncounterListParams, Encounter } from '@/lib/types/encounter';

/**
 * Hook for fetching paginated encounter list.
 */
export function useEncounters(params?: EncounterListParams) {
  return useQuery({
    queryKey: ['encounters', params],
    queryFn: () => encountersApi.list(params),
  });
}

/**
 * Hook for fetching a single encounter.
 */
export function useEncounter(id: number) {
  return useQuery({
    queryKey: ['encounters', id],
    queryFn: () => encountersApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching encounter diagnoses.
 */
export function useEncounterDiagnoses(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'diagnoses'],
    queryFn: () => encountersApi.getDiagnoses(encounterId),
    enabled: !!encounterId,
  });
}

/**
 * Hook for fetching encounter treatment plan.
 */
export function useEncounterTreatmentPlan(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'treatment-plan'],
    queryFn: () => encountersApi.getTreatmentPlan(encounterId),
    enabled: !!encounterId,
  });
}

/**
 * Hook for creating an encounter.
 */
export function useCreateEncounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Encounter>) => encountersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
  });
}

/**
 * Hook for updating an encounter.
 */
export function useUpdateEncounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Encounter> }) =>
      encountersApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['encounters', variables.id] });
    },
  });
}

/**
 * Hook for fetching pre-triage queue (encounters awaiting triage).
 * 
 * Returns encounters with:
 * - triage_status = PENDING (or IN_PROGRESS if include_in_progress=true)
 * - triage_requirement in (MANDATORY, OPTIONAL)
 * 
 * Auto-refreshes every 15 seconds.
 */
export function usePreTriageQueue(params?: PreTriageQueueParams) {
  return useQuery({
    queryKey: ['encounters', 'pre-triage-queue', params],
    queryFn: () => encountersApi.getPreTriageQueue(params),
    refetchInterval: 15000, // Auto-refresh every 15 seconds
  });
}
