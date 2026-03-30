import { useQuery } from '@tanstack/react-query';
import { proceduresApi } from '@/lib/api/procedures';

export const procedureKeys = {
  all: ['procedures'] as const,
  orders: () => [...procedureKeys.all, 'orders'] as const,
  encounterOrders: (encounterId: number) =>
    [...procedureKeys.orders(), 'encounter', encounterId] as const,
};

/**
 * Hook for fetching procedure orders for a specific encounter.
 */
export function useEncounterProcedureOrders(encounterId: number) {
  return useQuery({
    queryKey: procedureKeys.encounterOrders(encounterId),
    queryFn: () =>
      proceduresApi.listOrders({ encounter: String(encounterId) }),
    enabled: !!encounterId,
  });
}
