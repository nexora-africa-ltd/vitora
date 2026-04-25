import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chronicConditionsApi } from '@/lib/api/chronic-conditions';
import { toast } from 'sonner';
import type {
  ChronicConditionCreatePayload,
  ChronicConditionUpdatePayload,
} from '@/lib/types/chronic-condition';

export const chronicConditionKeys = {
  all: ['chronic-conditions'] as const,
  patient: (patientId: number) => [...chronicConditionKeys.all, 'patient', patientId] as const,
  detail: (patientId: number, id: number) =>
    [...chronicConditionKeys.patient(patientId), id] as const,
};

export function usePatientChronicConditions(patientId: number) {
  return useQuery({
    queryKey: chronicConditionKeys.patient(patientId),
    queryFn: () => chronicConditionsApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

export function useCreateChronicCondition(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ChronicConditionCreatePayload) =>
      chronicConditionsApi.create(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chronicConditionKeys.patient(patientId) });
      toast.success('Chronic condition recorded');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to record condition');
    },
  });
}

export function useUpdateChronicCondition(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ChronicConditionUpdatePayload }) =>
      chronicConditionsApi.update(patientId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chronicConditionKeys.patient(patientId) });
      toast.success('Condition updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update condition');
    },
  });
}

export function useDeleteChronicCondition(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => chronicConditionsApi.delete(patientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chronicConditionKeys.patient(patientId) });
      toast.success('Condition removed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove condition');
    },
  });
}
