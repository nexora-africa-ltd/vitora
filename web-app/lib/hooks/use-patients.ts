'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { Patient, PaginatedResponse } from '@/lib/types';

interface UsePatientsParams {
  limit?: number;
  page?: number;
  search?: string;
}

/**
 * Hook for fetching patients list
 */
export function usePatients(params: UsePatientsParams = {}) {
  const { limit = 10, page = 1, search } = params;

  return useQuery<PaginatedResponse<Patient>>({
    queryKey: ['patients', { limit, page, search }],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      // Django REST Framework uses page_size for pagination
      searchParams.set('page_size', String(limit));
      searchParams.set('page', String(page));
      if (search) {
        searchParams.set('search', search);
      }

      const response = await apiClient.get<PaginatedResponse<Patient>>(
        `/api/patients/?${searchParams.toString()}`
      );
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook for fetching a single patient
 */
export function usePatient(id: string | number) {
  return useQuery<Patient>({
    queryKey: ['patient', id],
    queryFn: async () => {
      const response = await apiClient.get<Patient>(`/api/patients/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });
}
