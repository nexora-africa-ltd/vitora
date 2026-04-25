import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pastSurgeriesApi } from '@/lib/api/past-surgeries';
import { toast } from 'sonner';
import type {
  PastSurgeryCreatePayload,
  PastSurgeryUpdatePayload,
} from '@/lib/types/past-surgery';

export const pastSurgeryKeys = {
  all: ['past-surgeries'] as const,
  patient: (patientId: number) => [...pastSurgeryKeys.all, 'patient', patientId] as const,
  detail: (patientId: number, id: number) =>
    [...pastSurgeryKeys.patient(patientId), id] as const,
};

export function usePatientPastSurgeries(patientId: number) {
  return useQuery({
    queryKey: pastSurgeryKeys.patient(patientId),
    queryFn: () => pastSurgeriesApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

export function useCreatePastSurgery(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PastSurgeryCreatePayload) => pastSurgeriesApi.create(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pastSurgeryKeys.patient(patientId) });
      toast.success('Surgery recorded');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to record surgery');
    },
  });
}

export function useUpdatePastSurgery(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PastSurgeryUpdatePayload }) =>
      pastSurgeriesApi.update(patientId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pastSurgeryKeys.patient(patientId) });
      toast.success('Surgery updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update surgery');
    },
  });
}

export function useDeletePastSurgery(patientId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => pastSurgeriesApi.delete(patientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pastSurgeryKeys.patient(patientId) });
      toast.success('Surgery removed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove surgery');
    },
  });
}
