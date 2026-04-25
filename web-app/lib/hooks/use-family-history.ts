import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { familyHistoryApi } from '@/lib/api/family-history';
import { toast } from 'sonner';
import type {
  FamilyHistoryCreatePayload,
  FamilyHistoryUpdatePayload,
} from '@/lib/types/family-history';

export const familyHistoryKeys = {
  all: ['family-history'] as const,
  patient: (patientId: number) => [...familyHistoryKeys.all, 'patient', patientId] as const,
  detail: (patientId: number, id: number) =>
    [...familyHistoryKeys.patient(patientId), id] as const,
};

export function usePatientFamilyHistory(patientId: number) {
  return useQuery({
    queryKey: familyHistoryKeys.patient(patientId),
    queryFn: () => familyHistoryApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

export function useCreateFamilyHistory(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FamilyHistoryCreatePayload) =>
      familyHistoryApi.create(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyHistoryKeys.patient(patientId) });
      toast.success('Family history recorded');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to record family history');
    },
  });
}

export function useUpdateFamilyHistory(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FamilyHistoryUpdatePayload }) =>
      familyHistoryApi.update(patientId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyHistoryKeys.patient(patientId) });
      toast.success('Family history updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update family history');
    },
  });
}

export function useDeleteFamilyHistory(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => familyHistoryApi.delete(patientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyHistoryKeys.patient(patientId) });
      toast.success('Family history removed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove family history');
    },
  });
}
