/**
 * usePatient Hook
 *
 * TanStack Query hook for fetching a single patient by ID.
 *
 * @example
 * const { data: patient, isLoading } = usePatient(123);
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { patientsApi, Patient } from '@/lib/api/patients';
import { patientKeys } from './usePatients';

/**
 * Hook for fetching a single patient
 *
 * @param id - Patient ID
 * @param enabled - Whether the query should run
 * @returns Query result with patient data
 */
export function usePatient(
  id: number,
  enabled: boolean = true
): UseQueryResult<Patient, Error> {
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: () => patientsApi.get(id),
    enabled: enabled && id > 0,
  });
}
