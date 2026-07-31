import { QueryClient, DefaultOptions, QueryCache, MutationCache } from '@tanstack/react-query';
import { transformAxiosError } from './api/client';
import { AxiosError } from 'axios';
import { ZodError } from 'zod';

/**
 * Global error handler for queries and mutations.
 * Handles Axios errors, Zod validation errors, and other errors consistently.
 */
function handleGlobalError(error: unknown): void {
  if (process.env.NODE_ENV !== 'development') return;

  if (error instanceof AxiosError) {
    if (error.code === 'ERR_CANCELED') return;

    let apiError;
    try {
      apiError = transformAxiosError(error);
    } catch (transformError) {
      const transformMessage =
        transformError instanceof Error ? transformError.message : String(transformError);
      apiError = {
        message: error.message || 'Failed to parse API error response',
        status:
          typeof error.response?.status === 'number'
            ? error.response.status
            : 0,
        code: error.code || 'ERROR_TRANSFORM_FAILED',
        details: { transformError: [transformMessage] },
      };
    }
    const payload: {
      message: string;
      status: number;
      code: string;
      method?: string;
      url?: string;
      details?: Record<string, string[]>;
    } = {
      message: apiError.message || 'Unknown API error',
      status: Number.isFinite(apiError.status) ? apiError.status : -1,
      code: apiError.code || 'UNKNOWN_ERROR',
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      details:
        apiError.details && Object.keys(apiError.details).length > 0
          ? apiError.details
          : undefined,
    };

    const compactPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
    );

    if (Object.keys(compactPayload).length === 0) {
      console.warn('[Query Error] API: empty payload', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
      });
      return;
    }

    // React Query often surfaces expected 4xx states during UI flows.
    // Keep those as warnings to avoid noisy Next.js dev overlays.
    if (payload.status >= 500) {
      console.error('[Query Error] API:', compactPayload);
    } else {
      console.warn('[Query Error] API:', compactPayload);
    }
  } else if (error instanceof ZodError) {
    const context = (error as ZodError & { context?: string }).context;
    const issues = error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
    console.warn(`[Query Error] Validation failed (${context || 'unknown'}):`, issues);
    // Log first few issues in detail for debugging
    if (error.issues.length > 0) {
      console.warn('[Query Error] Issue details:', error.issues.slice(0, 3));
    }
  } else {
    const unknown = error instanceof Error ? error : new Error(String(error));
    console.error('[Query Error] Unknown:', {
      name: unknown.name,
      message: unknown.message,
      stack: unknown.stack?.split('\n').slice(0, 3).join('\n'),
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
    // Never retry mutations — they are not idempotent.
    // A "failed" mutation that actually reached the server (e.g. 201 + Zod
    // validation error) would create duplicate records on retry.
    retry: false,

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
      onError: (error, query) => {
        // Allow queries to opt out of global error logging
        if (query.meta?.skipGlobalErrorHandler) return;
        handleGlobalError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.skipGlobalErrorHandler) return;
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
