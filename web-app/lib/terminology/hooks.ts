/**
 * Terminology React Query Hooks
 * 
 * Pre-configured hooks for searching DHA/SHA terminologies with:
 * - Debounced search (minimum 2 characters)
 * - Smart caching (30 minutes - terminologies don't change often)
 * - Type-safe responses
 * 
 * @example
 * // In a component
 * const { data, isLoading } = useICD11Search({ search: 'malaria' });
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { terminologyApi } from './api';
import type {
  TerminologySearchParams,
  InterventionSearchParams,
  DrugSearchParams,
} from './types';

// ============================================================================
// Query Keys
// ============================================================================

export const terminologyQueryKeys = {
  all: ['terminology'] as const,
  icd11: (params?: TerminologySearchParams) => 
    [...terminologyQueryKeys.all, 'icd11', params] as const,
  interventions: (params?: InterventionSearchParams) => 
    [...terminologyQueryKeys.all, 'interventions', params] as const,
  ichi: (params?: TerminologySearchParams) => 
    [...terminologyQueryKeys.all, 'ichi', params] as const,
  loinc: (params?: TerminologySearchParams) => 
    [...terminologyQueryKeys.all, 'loinc', params] as const,
  drugs: (params?: DrugSearchParams) => 
    [...terminologyQueryKeys.all, 'drugs', params] as const,
  activeComponents: (params?: TerminologySearchParams) => 
    [...terminologyQueryKeys.all, 'activeComponents', params] as const,
};

// ============================================================================
// Hook Options
// ============================================================================

interface UseTerminologySearchOptions {
  /** Override default enabled state */
  enabled?: boolean;
  /** Minimum search length to trigger query (default: 2) */
  minSearchLength?: number;
  /** Cache time in milliseconds (default: 30 minutes) */
  staleTime?: number;
}

const DEFAULT_OPTIONS: Required<Omit<UseTerminologySearchOptions, 'enabled'>> = {
  minSearchLength: 2,
  staleTime: 30 * 60 * 1000, // 30 minutes
};

// ============================================================================
// ICD-11 Hook (Diagnosis Codes)
// ============================================================================

/**
 * Search ICD-11 diagnosis codes
 * 
 * @example
 * const { data, isLoading, error } = useICD11Search({ search: 'diabetes' });
 */
export function useICD11Search(
  params?: TerminologySearchParams,
  options?: UseTerminologySearchOptions
) {
  const { minSearchLength, staleTime } = { ...DEFAULT_OPTIONS, ...options };
  const searchLength = params?.search?.length ?? 0;
  
  return useQuery({
    queryKey: terminologyQueryKeys.icd11(params),
    queryFn: () => terminologyApi.searchICD11(params),
    enabled: options?.enabled !== false && searchLength >= minSearchLength,
    staleTime,
  });
}

// ============================================================================
// SHA Interventions Hook (Procedures)
// ============================================================================

/**
 * Search SHA interventions/procedures
 * 
 * @example
 * const { data } = useInterventionsSearch({ 
 *   search: 'consultation',
 *   facility_level: 4 
 * });
 */
export function useInterventionsSearch(
  params?: InterventionSearchParams,
  options?: UseTerminologySearchOptions
) {
  const { minSearchLength, staleTime } = { ...DEFAULT_OPTIONS, ...options };
  const searchLength = params?.search?.length ?? 0;
  
  return useQuery({
    queryKey: terminologyQueryKeys.interventions(params),
    queryFn: () => terminologyApi.searchInterventions(params),
    enabled: options?.enabled !== false && searchLength >= minSearchLength,
    staleTime,
  });
}

// ============================================================================
// ICHI Hook (Health Interventions)
// ============================================================================

/**
 * Search ICHI codes
 * 
 * @example
 * const { data } = useICHISearch({ search: 'appendectomy' });
 */
export function useICHISearch(
  params?: TerminologySearchParams,
  options?: UseTerminologySearchOptions
) {
  const { minSearchLength, staleTime } = { ...DEFAULT_OPTIONS, ...options };
  const searchLength = params?.search?.length ?? 0;
  
  return useQuery({
    queryKey: terminologyQueryKeys.ichi(params),
    queryFn: () => terminologyApi.searchICHI(params),
    enabled: options?.enabled !== false && searchLength >= minSearchLength,
    staleTime,
  });
}

// ============================================================================
// LOINC Hook (Lab Test Codes)
// ============================================================================

/**
 * Search LOINC lab test codes
 * 
 * @example
 * const { data } = useLOINCSearch({ search: 'hemoglobin' });
 */
export function useLOINCSearch(
  params?: TerminologySearchParams,
  options?: UseTerminologySearchOptions
) {
  const { minSearchLength, staleTime } = { ...DEFAULT_OPTIONS, ...options };
  const searchLength = params?.search?.length ?? 0;
  
  return useQuery({
    queryKey: terminologyQueryKeys.loinc(params),
    queryFn: () => terminologyApi.searchLOINC(params),
    enabled: options?.enabled !== false && searchLength >= minSearchLength,
    staleTime,
  });
}

// ============================================================================
// Drugs Hook (Kenya Drug Registry)
// ============================================================================

/**
 * Search Kenya drug registry
 * 
 * @example
 * const { data } = useDrugsSearch({ search: 'paracetamol' });
 */
export function useDrugsSearch(
  params?: DrugSearchParams,
  options?: UseTerminologySearchOptions
) {
  const { minSearchLength, staleTime } = { ...DEFAULT_OPTIONS, ...options };
  const searchLength = params?.search?.length ?? 0;
  
  return useQuery({
    queryKey: terminologyQueryKeys.drugs(params),
    queryFn: () => terminologyApi.searchDrugs(params),
    enabled: options?.enabled !== false && searchLength >= minSearchLength,
    staleTime,
  });
}

// ============================================================================
// Active Components Hook (Drug Ingredients)
// ============================================================================

/**
 * Search drug active components
 * 
 * @example
 * const { data } = useActiveComponentsSearch({ search: 'acetaminophen' });
 */
export function useActiveComponentsSearch(
  params?: TerminologySearchParams,
  options?: UseTerminologySearchOptions
) {
  const { minSearchLength, staleTime } = { ...DEFAULT_OPTIONS, ...options };
  const searchLength = params?.search?.length ?? 0;
  
  return useQuery({
    queryKey: terminologyQueryKeys.activeComponents(params),
    queryFn: () => terminologyApi.searchActiveComponents(params),
    enabled: options?.enabled !== false && searchLength >= minSearchLength,
    staleTime,
  });
}
