import { useQuery } from '@tanstack/react-query';

import { getLocalMCHRegistration, listLocalANCVisits, listLocalImmunizations, listLocalMCHRegistrations, listLocalScreenings } from '@/lib/db';

export function useLocalMCHRegistrations(options: { search?: string; highRiskOnly?: boolean } = {}) {
  const query = useQuery({
    queryKey: ['local-mch-registrations', options.search ?? '', options.highRiskOnly ?? false],
    queryFn: () => listLocalMCHRegistrations(options),
  });

  return {
    ...query,
    count: query.data?.count ?? 0,
    registrations: query.data?.records ?? [],
  };
}

export function useLocalMCHRegistration(id: number) {
  const query = useQuery({
    queryKey: ['local-mch-registration', id],
    queryFn: () => getLocalMCHRegistration(id),
    enabled: Number.isFinite(id),
  });

  return {
    ...query,
    registration: query.data,
  };
}

export function useLocalANCVisits(registrationId: number) {
  const query = useQuery({
    queryKey: ['local-anc-visits', registrationId],
    queryFn: () => listLocalANCVisits({ registrationId }),
    enabled: Number.isFinite(registrationId),
  });

  return {
    ...query,
    count: query.data?.count ?? 0,
    visits: query.data?.records ?? [],
  };
}

export function useLocalImmunizations(patientId: number) {
  const query = useQuery({
    queryKey: ['local-immunizations', patientId],
    queryFn: () => listLocalImmunizations({ patientId }),
    enabled: Number.isFinite(patientId),
  });

  return {
    ...query,
    count: query.data?.count ?? 0,
    records: query.data?.records ?? [],
  };
}

export function useLocalScreenings(options: { patientId?: number } = {}) {
  const query = useQuery({
    queryKey: ['local-screenings', options.patientId ?? null],
    queryFn: () => listLocalScreenings({ patient: options.patientId }),
  });

  return {
    ...query,
    count: query.data?.count ?? 0,
    screenings: query.data?.records ?? [],
  };
}