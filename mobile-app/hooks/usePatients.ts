/**
 * usePatients Hook
 *
 * TanStack Query hook for fetching patients list with pagination and search.
 *
 * @example
 * const { data, isLoading, error } = usePatients({ search: 'John' });
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  patientsApi,
  PatientListResponse,
  PatientListParams,
} from '@/lib/api/patients';

/**
 * Query key factory for patients
 */
export const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  list: (params: PatientListParams) =>
    [...patientKeys.lists(), params] as const,
  details: () => [...patientKeys.all, 'detail'] as const,
  detail: (id: number) => [...patientKeys.details(), id] as const,
};

/**
 * Hook for fetching patients list
 *
 * @param params - Optional query parameters for filtering/pagination
 * @returns Query result with patient list data
 */
export function usePatients(
  params: PatientListParams = {}
): UseQueryResult<PatientListResponse, Error> {
  return useQuery({
    queryKey: patientKeys.list(params),
    queryFn: () => patientsApi.list(params),
  });
}
