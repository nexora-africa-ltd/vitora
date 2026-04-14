'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { labourPartographObservationsApi, labourPartographsApi, mchRegistrationsApi, deliveriesApi } from '@/lib/api/mch';
import type { MCHRegistration,
  MCHRegistrationListParams,
  Delivery,
  LabourPartographCreateData,
  LabourPartographObservationCreateData,
} from '@/lib/types/mch';

export function useMCHRegistrations(params?: MCHRegistrationListParams, enabled = true) {
  return useQuery({
    queryKey: ['mch-registrations', params ?? {}],
    queryFn: () => mchRegistrationsApi.list(params),
    enabled,
  });
}

export function useMCHRegistration(registrationId: number | undefined) {
  return useQuery<MCHRegistration>({
    queryKey: ['mch-registration', registrationId ?? null],
    queryFn: () => mchRegistrationsApi.get(registrationId!),
    enabled: typeof registrationId === 'number' && registrationId > 0,
  });
}

export function useLabourPartographs(registrationId: number | undefined) {
  return useQuery({
    queryKey: ['mch-partographs', { registration: registrationId ?? null }],
    queryFn: () => labourPartographsApi.list({ registration: registrationId }),
    enabled: typeof registrationId === 'number' && registrationId > 0,
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
    enabled: typeof partographId === 'number' && partographId > 0,
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

export function useDelivery(deliveryId: number | undefined) {
  return useQuery<Delivery>({
    queryKey: ['delivery', deliveryId ?? null],
    queryFn: () => deliveriesApi.get(deliveryId!),
    enabled: typeof deliveryId === 'number' && deliveryId > 0,
  });
}
