/**
 * React hooks for social history data fetching and mutations.
 *
 * Structured social-history management for FHIR R4 interoperability.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialHistoryApi } from '@/lib/api/social-history';
import { toast } from 'sonner';
import type {
  SocialHistoryCreatePayload,
  SocialHistoryUpdatePayload,
} from '@/lib/types/social-history';

// ============ Query Keys ============

export const socialHistoryKeys = {
  all: ['social-history'] as const,
  patient: (patientId: number) => [...socialHistoryKeys.all, 'patient', patientId] as const,
  detail: (patientId: number, observationId: number) =>
    [...socialHistoryKeys.patient(patientId), observationId] as const,
};

// ============ Query Hooks ============

/**
 * Hook for fetching a patient's social history observations.
 */
export function usePatientSocialHistory(patientId: number) {
  return useQuery({
    queryKey: socialHistoryKeys.patient(patientId),
    queryFn: () => socialHistoryApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

/**
 * Hook for fetching a specific social history observation.
 */
export function useSocialHistoryObservation(patientId: number, observationId: number) {
  return useQuery({
    queryKey: socialHistoryKeys.detail(patientId, observationId),
    queryFn: () => socialHistoryApi.get(patientId, observationId),
    enabled: !!patientId && !!observationId,
  });
}

// ============ Mutation Hooks ============

/**
 * Hook for creating a new social history observation.
 */
export function useCreateSocialHistory(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SocialHistoryCreatePayload) =>
      socialHistoryApi.create(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialHistoryKeys.patient(patientId) });
      toast.success('Social history recorded');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to record social history';
      toast.error(message);
    },
  });
}

/**
 * Hook for updating a social history observation.
 */
export function useUpdateSocialHistory(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      observationId,
      data,
    }: {
      observationId: number;
      data: SocialHistoryUpdatePayload;
    }) => socialHistoryApi.update(patientId, observationId, data),
    onSuccess: (_, { observationId }) => {
      queryClient.invalidateQueries({ queryKey: socialHistoryKeys.patient(patientId) });
      queryClient.invalidateQueries({
        queryKey: socialHistoryKeys.detail(patientId, observationId),
      });
      toast.success('Social history updated');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to update social history';
      toast.error(message);
    },
  });
}

/**
 * Hook for deleting a social history observation.
 */
export function useDeleteSocialHistory(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (observationId: number) => socialHistoryApi.delete(patientId, observationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialHistoryKeys.patient(patientId) });
      toast.success('Social history removed');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to remove social history';
      toast.error(message);
    },
  });
}
