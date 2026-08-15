/**
 * React Query hooks for patient vitals-derived review suggestions.
 *
 * Purpose:
 * - Fetch and mutate vital-flag suggestions and keep related UI cache fresh.
 *
 * Usage:
 * - Used by patient detail review panel components.
 *
 * Inputs:
 * - patientId, suggestionId, and action payloads.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { vitalFlagSuggestionsApi } from '@/lib/api/vital-flag-suggestions';
import { chronicConditionKeys } from '@/lib/hooks/use-chronic-conditions';
import type {
  VitalFlagAcceptPayload,
  VitalFlagAcknowledgePayload,
  VitalFlagMapPayload,
  VitalFlagRejectPayload,
} from '@/lib/types/vital-flag-suggestion';

export const vitalFlagSuggestionKeys = {
  all: ['vital-flag-suggestions'] as const,
  patient: (patientId: number) => [...vitalFlagSuggestionKeys.all, 'patient', patientId] as const,
  detail: (patientId: number, suggestionId: number) =>
    [...vitalFlagSuggestionKeys.patient(patientId), suggestionId] as const,
};

function invalidatePatientSuggestionQueries(queryClient: ReturnType<typeof useQueryClient>, patientId: number) {
  queryClient.invalidateQueries({ queryKey: vitalFlagSuggestionKeys.patient(patientId) });
  queryClient.invalidateQueries({ queryKey: chronicConditionKeys.patient(patientId) });
}

export function usePatientVitalFlagSuggestions(patientId: number) {
  return useQuery({
    queryKey: vitalFlagSuggestionKeys.patient(patientId),
    queryFn: () => vitalFlagSuggestionsApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

export function useAcknowledgeVitalFlagSuggestion(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      suggestionId,
      data,
    }: {
      suggestionId: number;
      data?: VitalFlagAcknowledgePayload;
    }) => vitalFlagSuggestionsApi.acknowledge(patientId, suggestionId, data),
    onSuccess: () => {
      invalidatePatientSuggestionQueries(queryClient, patientId);
      toast.success('Suggestion acknowledged');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to acknowledge suggestion');
    },
  });
}

export function useMapVitalFlagSuggestionCodes(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, data }: { suggestionId: number; data: VitalFlagMapPayload }) =>
      vitalFlagSuggestionsApi.mapCodes(patientId, suggestionId, data),
    onSuccess: () => {
      invalidatePatientSuggestionQueries(queryClient, patientId);
      toast.success('Code mapping updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update code mapping');
    },
  });
}

export function useAcceptVitalFlagSuggestion(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, data }: { suggestionId: number; data: VitalFlagAcceptPayload }) =>
      vitalFlagSuggestionsApi.accept(patientId, suggestionId, data),
    onSuccess: () => {
      invalidatePatientSuggestionQueries(queryClient, patientId);
      toast.success('Suggestion accepted');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to accept suggestion');
    },
  });
}

export function useRejectVitalFlagSuggestion(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, data }: { suggestionId: number; data: VitalFlagRejectPayload }) =>
      vitalFlagSuggestionsApi.reject(patientId, suggestionId, data),
    onSuccess: () => {
      invalidatePatientSuggestionQueries(queryClient, patientId);
      toast.success('Suggestion rejected');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to reject suggestion');
    },
  });
}
