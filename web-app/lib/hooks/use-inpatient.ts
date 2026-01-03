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

export function useCreateAdmissionRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AdmissionRecommendation>) => inpatientApi.createAdmissionRecommendation(data),
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
