import { useQuery } from '@tanstack/react-query';

import { getLocalEncounter, listLocalEncounters } from '@/lib/db';

export function useLocalEncounters(options: { limit?: number; patientId?: number; search?: string } = {}) {
  const query = useQuery({
    queryKey: ['local-encounters', options.patientId ?? null, options.search ?? '', options.limit ?? null],
    queryFn: () => listLocalEncounters(options),
  });

  return {
    ...query,
    count: query.data?.count ?? 0,
    encounters: query.data?.records ?? [],
  };
}

export function useLocalEncounter(id: number) {
  const query = useQuery({
    queryKey: ['local-encounter', id],
    queryFn: () => getLocalEncounter(id),
    enabled: Number.isFinite(id),
  });

  return {
    ...query,
    encounter: query.data,
  };
}