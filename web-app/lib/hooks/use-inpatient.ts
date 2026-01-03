/**
 * React hooks for inpatient (Admissions/IPD) data fetching and mutations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inpatientApi } from '@/lib/api/inpatient';
import type {
  Admission,
  AdmissionListParams,
  AdmissionRecommendation,
  AdmissionRecommendationListParams,
  Bed,
  BedListParams,
  InpatientWard,
} from '@/lib/types/inpatient';

export function useInpatientWards() {
  return useQuery({
    queryKey: ['inpatient', 'wards'],
    queryFn: () => inpatientApi.listWards(),
  });
}

export function useBeds(params?: BedListParams) {
  return useQuery({
    queryKey: ['inpatient', 'beds', params],
    queryFn: () => inpatientApi.listBeds(params),
  });
}

export function useWardBeds(
  wardId: number | undefined,
  params?: Omit<BedListParams, 'ward'> & { page?: number; page_size?: number }
) {
  return useQuery({
    queryKey: ['inpatient', 'wards', wardId, 'beds', params],
    enabled: typeof wardId === 'number',
    queryFn: () => inpatientApi.listWardBeds(wardId as number, params),
  });
}

export function useAdmissionRecommendations(params?: AdmissionRecommendationListParams) {
  return useQuery({
    queryKey: ['inpatient', 'admission-recommendations', params],
    queryFn: () => inpatientApi.listAdmissionRecommendations(params),
  });
}

export function useAdmissions(params?: AdmissionListParams) {
  return useQuery({
    queryKey: ['inpatient', 'admissions', params],
    queryFn: () => inpatientApi.listAdmissions(params),
  });
}

export function useAdmission(admissionId: number | undefined) {
  return useQuery({
    queryKey: ['inpatient', 'admissions', admissionId],
    enabled: typeof admissionId === 'number',
    queryFn: () => inpatientApi.getAdmission(admissionId as number),
  });
}

export function useCreateAdmissionRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AdmissionRecommendation>) => inpatientApi.createAdmissionRecommendation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'admission-recommendations'] });
    },
  });
}

export function useAcceptAdmissionRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number }) =>
      inpatientApi.acceptAdmissionRecommendation(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'admission-recommendations'] });
    },
  });
}

export function useDeclineAdmissionRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, reason }: { id: number; userId: number; reason: string }) =>
      inpatientApi.declineAdmissionRecommendation(id, userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'admission-recommendations'] });
    },
  });
}

export function useCreateAdmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Admission>) => inpatientApi.createAdmission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'admissions'] });
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'beds'] });
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'wards'] });
    },
  });
}

export function useUpdateAdmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Admission> }) => inpatientApi.updateAdmission(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'admissions'] });
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'admissions', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'beds'] });
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'wards'] });
    },
  });
}

export function useUpdateBed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Bed> }) => inpatientApi.updateBed(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'beds'] });
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'wards'] });
    },
  });
}
