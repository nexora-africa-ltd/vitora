/**
 * React Query hooks for Drug Formulary.
 */

import { useQuery } from '@tanstack/react-query';
import { formularyApi } from '@/lib/api/formulary';

/**
 * Search the drug formulary with debounced query.
 * Only fires when query is at least 2 characters.
 */
export function useFormularySearch(query: string, limit = 10) {
  return useQuery({
    queryKey: ['formulary', 'search', query, limit],
    queryFn: () => formularyApi.search(query, limit),
    enabled: query.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes — drug data doesn't change often
    placeholderData: (prev) => prev,
  });
}

/**
 * Get full SmPC monograph detail.
 */
export function useSmpcDetail(docId: string | null) {
  return useQuery({
    queryKey: ['formulary', 'smpc', docId],
    queryFn: () => formularyApi.getSmpc(docId!),
    enabled: !!docId,
    staleTime: 30 * 60 * 1000, // 30 minutes — SmPC data is static
  });
}

/**
 * Formulary service stats (for health indicator).
 */
export function useFormularyStats() {
  return useQuery({
    queryKey: ['formulary', 'stats'],
    queryFn: () => formularyApi.stats(),
    staleTime: 10 * 60 * 1000,
  });
}
