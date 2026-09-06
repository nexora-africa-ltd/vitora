// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * React Query hooks for facility-scoped scheduling shift vacancies.
 * Use in scheduling pages with a current facility ID and list filter parameters.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shiftVacanciesApi } from '@/lib/api/scheduling';
import type { ShiftVacancyCreateData, ShiftVacancyListParams } from '@/lib/types/scheduling';

export const shiftVacancyQueryKeys = {
  all: ['shift-vacancies'] as const,
  list: (facilityId: number | null | undefined, params?: ShiftVacancyListParams) =>
    [...shiftVacancyQueryKeys.all, facilityId, params] as const,
};

export function useShiftVacancies(
  facilityId: number | null | undefined,
  params?: ShiftVacancyListParams
) {
  return useQuery({
    queryKey: shiftVacancyQueryKeys.list(facilityId, params),
    queryFn: () => shiftVacanciesApi.list(params),
    enabled: Boolean(facilityId),
  });
}

function useInvalidateShiftVacancies() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: shiftVacancyQueryKeys.all });
}

export function useCreateShiftVacancy() {
  const invalidate = useInvalidateShiftVacancies();
  return useMutation({
    mutationFn: (data: ShiftVacancyCreateData) => shiftVacanciesApi.create(data),
    onSuccess: invalidate,
  });
}

export function useFillShiftVacancy() {
  const invalidate = useInvalidateShiftVacancies();
  return useMutation({
    mutationFn: (id: number) => shiftVacanciesApi.fill(id),
    onSuccess: invalidate,
  });
}

export function useCancelShiftVacancy() {
  const invalidate = useInvalidateShiftVacancies();
  return useMutation({
    mutationFn: (id: number) => shiftVacanciesApi.cancel(id),
    onSuccess: invalidate,
  });
}
