/**
 * useSHA Hook
 *
 * React Query helpers for SHA eligibility checks.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { shaApi } from '@/lib/api/sha';
import type {
  SHADirectEligibilityRequest,
  SHADirectEligibilityResponse,
  SHAEligibility,
} from '@/lib/types/sha';

export const shaKeys = {
  all: ['sha'] as const,
  eligibility: (patientId: number) => [...shaKeys.all, 'eligibility', patientId] as const,
  direct: (lookup: string) => [...shaKeys.all, 'direct', lookup] as const,
};

export function useSHAEligibility(
  patientId: number | null,
): UseQueryResult<SHAEligibility | null, Error> {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: shaKeys.eligibility(patientId ?? 0),
    queryFn: async () => {
      if (!patientId) {
        return null;
      }

      return (
        queryClient.getQueryData<SHAEligibility>(shaKeys.eligibility(patientId)) ?? null
      );
    },
    enabled: false,
    initialData: patientId
      ? queryClient.getQueryData<SHAEligibility>(shaKeys.eligibility(patientId)) ?? null
      : null,
  });
}

export function useCheckSHAEligibility(
  patientId: number | null,
): UseMutationResult<SHAEligibility, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!patientId) {
        throw new Error('Patient ID is required');
      }

      return shaApi.checkPatientEligibility(patientId);
    },
    onSuccess: (result) => {
      if (!patientId) {
        return;
      }

      queryClient.setQueryData(shaKeys.eligibility(patientId), result);
    },
  });
}

export function useDirectSHAEligibility(): UseMutationResult<
  SHADirectEligibilityResponse,
  Error,
  SHADirectEligibilityRequest
> {
  return useMutation({
    mutationFn: (params) => shaApi.checkDirectEligibility(params),
  });
}