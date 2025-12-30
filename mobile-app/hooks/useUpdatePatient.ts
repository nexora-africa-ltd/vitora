/**
 * useUpdatePatient Hook
 *
 * TanStack Query mutation hook for updating an existing patient.
 *
 * @example
 * const { mutate: updatePatient, isPending } = useUpdatePatient();
 * updatePatient({ id: 123, data: { first_name: 'Jane' } });
 */

import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { patientsApi, Patient, UpdatePatientData } from '@/lib/api/patients';
import { patientKeys } from './usePatients';

/**
 * Input for updating a patient
 */
export interface UpdatePatientInput {
  id: number;
  data: UpdatePatientData;
}

/**
 * Options for the update patient mutation
 */
export interface UseUpdatePatientOptions {
  onSuccess?: (patient: Patient) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for updating an existing patient
 *
 * @param options - Optional callbacks for success/error
 * @returns Mutation result with mutate function
 */
export function useUpdatePatient(
  options: UseUpdatePatientOptions = {}
): UseMutationResult<Patient, Error, UpdatePatientInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: UpdatePatientInput) => patientsApi.update(id, data),
    onSuccess: (patient) => {
      // Update the patient detail cache
      queryClient.setQueryData(patientKeys.detail(patient.id), patient);
      // Invalidate patient list queries to refetch
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      options.onSuccess?.(patient);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
