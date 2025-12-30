/**
 * useCreatePatient Hook
 *
 * TanStack Query mutation hook for creating a new patient.
 *
 * @example
 * const { mutate: createPatient, isPending } = useCreatePatient();
 * createPatient({ first_name: 'John', ... });
 */

import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { patientsApi, Patient, CreatePatientData } from '@/lib/api/patients';
import { patientKeys } from './usePatients';

/**
 * Options for the create patient mutation
 */
export interface UseCreatePatientOptions {
  onSuccess?: (patient: Patient) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for creating a new patient
 *
 * @param options - Optional callbacks for success/error
 * @returns Mutation result with mutate function
 */
export function useCreatePatient(
  options: UseCreatePatientOptions = {}
): UseMutationResult<Patient, Error, CreatePatientData> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePatientData) => patientsApi.create(data),
    onSuccess: (patient) => {
      // Invalidate patient list queries to refetch
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      options.onSuccess?.(patient);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
