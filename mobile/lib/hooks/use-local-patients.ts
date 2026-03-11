import { useQuery } from '@tanstack/react-query';

import { getLocalPatient, listLocalPatients } from '@/lib/db';

export function useLocalPatients(options: { limit?: number; search?: string } = {}) {
  const query = useQuery({
    queryKey: ['local-patients', options.search ?? '', options.limit ?? null],
    queryFn: () => listLocalPatients(options),
  });

  return {
    ...query,
    count: query.data?.count ?? 0,
    patients: query.data?.records ?? [],
  };
}

export function useLocalPatient(id: number) {
  const query = useQuery({
    queryKey: ['local-patient', id],
    queryFn: () => getLocalPatient(id),
    enabled: Number.isFinite(id),
  });

  return {
    ...query,
    patient: query.data,
  };
}