'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { labourPartographObservationsApi, labourPartographsApi } from '@/lib/api/mch';
import type {
  LabourPartographCreateData,
  LabourPartographObservationCreateData,
} from '@/lib/types/mch';

export function useLabourPartographs(registrationId: number | undefined) {
  return useQuery({
    queryKey: ['mch-partographs', { registration: registrationId ?? null }],
    queryFn: () => labourPartographsApi.list({ registration: registrationId }),
    enabled: typeof registrationId === 'number',
  });
}

export function useCreateLabourPartograph() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LabourPartographCreateData) => labourPartographsApi.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['mch-partographs', { registration: variables.registration }],
      });
    },
  });
}

export function useLabourPartographObservations(partographId: number | undefined) {
  return useQuery({
    queryKey: ['mch-partograph-observations', partographId ?? null],
    queryFn: () => labourPartographObservationsApi.list(partographId!),
    enabled: typeof partographId === 'number',
  });
}

export function useCreateLabourPartographObservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LabourPartographObservationCreateData) =>
      labourPartographObservationsApi.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['mch-partograph-observations', variables.partograph],
      });
    },
  });
}