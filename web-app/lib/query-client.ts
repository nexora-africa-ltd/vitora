import { QueryClient, DefaultOptions, QueryCache, MutationCache } from '@tanstack/react-query';
import { transformAxiosError } from './api/client';
import { AxiosError } from 'axios';
import { ZodError } from 'zod';

/**
 * Global error handler for queries and mutations.
 * Handles Axios errors, Zod validation errors, and other errors consistently.
 */
function handleGlobalError(error: Error): void {
  if (process.env.NODE_ENV !== 'development') return;

  if (error instanceof AxiosError) {
    const apiError = transformAxiosError(error);
    console.error('[Query Error] API:', {
      message: apiError.message,
      status: apiError.status,
      code: apiError.code,
      details: apiError.details,
    });
  } else if (error instanceof ZodError) {
    const context = (error as ZodError & { context?: string }).context;
    const issues = error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
    console.error(`[Query Error] Validation failed (${context || 'unknown'}):`, issues);
    // Log first few issues in detail for debugging
    if (error.issues.length > 0) {
      console.error('[Query Error] Issue details:', error.issues.slice(0, 3));
    }
  } else {
    console.error('[Query Error] Unknown:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
  }
}

const defaultOptions: DefaultOptions = {
  queries: {
    // Stale time: 2 minutes (increased from 1 minute to reduce refetching)
    staleTime: 2 * 60 * 1000,

    // Cache time: 5 minutes
    gcTime: 5 * 60 * 1000,

    // Retry failed requests once
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error instanceof AxiosError && error.response?.status) {
        if (error.response.status >= 400 && error.response.status < 500) {
          return false;
        }
      }
      return failureCount < 1;
    },

    // Disable refetch on window focus to prevent excessive reloads
    // Users can manually refresh via pull-to-refresh or refresh button
    refetchOnWindowFocus: false,

    // Only refetch on reconnect if data is stale
    refetchOnReconnect: 'always',

    // Network mode
    networkMode: 'offlineFirst',
  },
  mutations: {
    // Retry mutations once
    retry: 1,

    // Network mode
    networkMode: 'offlineFirst',
  },
};

/**
 * Create QueryClient with global error handling.
 * Uses QueryCache and MutationCache onError callbacks
 * to transform and log errors consistently.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions,
    queryCache: new QueryCache({
      onError: (error) => {
        handleGlobalError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        handleGlobalError(error);
      },
    }),
  });
}

/**
 * Query keys factory for consistent query key management.
 */
export const queryKeys = {
  // Patients
  patients: {
    all: ['patients'] as const,
    lists: () => [...queryKeys.patients.all, 'list'] as const,
    list: (params: object) => [...queryKeys.patients.lists(), params] as const,
    details: () => [...queryKeys.patients.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.patients.details(), id] as const,
    emergencyContacts: (id: number) => [...queryKeys.patients.detail(id), 'emergency-contacts'] as const,
    encounters: (id: number) => [...queryKeys.patients.detail(id), 'encounters'] as const,
  },

  // Encounters
  encounters: {
    all: ['encounters'] as const,
    lists: () => [...queryKeys.encounters.all, 'list'] as const,
    list: (params: object) => [...queryKeys.encounters.lists(), params] as const,
    details: () => [...queryKeys.encounters.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.encounters.details(), id] as const,
    diagnoses: (id: number) => [...queryKeys.encounters.detail(id), 'diagnoses'] as const,
    treatmentPlan: (id: number) => [...queryKeys.encounters.detail(id), 'treatment-plan'] as const,
  },

  // Locations
  locations: {
    all: ['locations'] as const,
    counties: () => [...queryKeys.locations.all, 'counties'] as const,
    subCounties: (countyId: number) => [...queryKeys.locations.all, 'sub-counties', countyId] as const,
    wards: (subCountyId: number) => [...queryKeys.locations.all, 'wards', subCountyId] as const,
  },

  // ICD-10 codes
  icd10: {
    all: ['icd10'] as const,
    search: (query: string) => [...queryKeys.icd10.all, 'search', query] as const,
  },
};
