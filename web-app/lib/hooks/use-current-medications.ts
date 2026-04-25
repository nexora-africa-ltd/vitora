import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { currentMedicationsApi } from '@/lib/api/current-medications';
import { toast } from 'sonner';
import type {
  CurrentMedicationCreatePayload,
  CurrentMedicationUpdatePayload,
} from '@/lib/types/current-medication';

export const currentMedicationKeys = {
  all: ['current-medications'] as const,
  patient: (patientId: number) => [...currentMedicationKeys.all, 'patient', patientId] as const,
  detail: (patientId: number, id: number) =>
    [...currentMedicationKeys.patient(patientId), id] as const,
};

export function usePatientCurrentMedications(patientId: number) {
  return useQuery({
    queryKey: currentMedicationKeys.patient(patientId),
    queryFn: () => currentMedicationsApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

export function useCreateCurrentMedication(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CurrentMedicationCreatePayload) =>
      currentMedicationsApi.create(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentMedicationKeys.patient(patientId) });
      toast.success('Medication recorded');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to record medication');
    },
  });
}

export function useUpdateCurrentMedication(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CurrentMedicationUpdatePayload }) =>
      currentMedicationsApi.update(patientId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentMedicationKeys.patient(patientId) });
      toast.success('Medication updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update medication');
    },
  });
}

export function useDeleteCurrentMedication(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => currentMedicationsApi.delete(patientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentMedicationKeys.patient(patientId) });
      toast.success('Medication removed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove medication');
    },
  });
}
