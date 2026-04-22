import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { proceduresApi } from '@/lib/api/procedures';
import type { ProcedureOrderListItem } from '@/lib/types/procedure';
import type { PaginatedResponse } from '@/lib/types';

export const procedureKeys = {
  all: ['procedures'] as const,
  orders: () => [...procedureKeys.all, 'orders'] as const,
  encounterOrders: (encounterId: number) =>
    [...procedureKeys.orders(), 'encounter', encounterId] as const,
  patientOrders: (patientId: number) =>
    [...procedureKeys.orders(), 'patient', patientId] as const,
};

/**
 * Hook for fetching procedure orders for a specific encounter.
 */
export function useEncounterProcedureOrders(
  encounterId: number
): UseQueryResult<PaginatedResponse<ProcedureOrderListItem>, Error> {
  return useQuery<PaginatedResponse<ProcedureOrderListItem>>({
    queryKey: procedureKeys.encounterOrders(encounterId),
    queryFn: () =>
      proceduresApi.listOrders({ encounter: String(encounterId) }),
    enabled: !!encounterId,
  });
}

/**
 * Hook for fetching procedure orders for a specific patient.
 */
export function usePatientProcedureOrders(
  patientId: number
): UseQueryResult<PaginatedResponse<ProcedureOrderListItem>, Error> {
  return useQuery<PaginatedResponse<ProcedureOrderListItem>>({
    queryKey: procedureKeys.patientOrders(patientId),
    queryFn: () => proceduresApi.listOrders({ patient: String(patientId) }),
    enabled: !!patientId,
  });
}
