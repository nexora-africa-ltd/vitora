import { QueryClient, DefaultOptions } from '@tanstack/react-query';
import { transformAxiosError } from './api/client';
import { AxiosError } from 'axios';

const defaultOptions: DefaultOptions = {
  queries: {
    // Stale time: 1 minute
    staleTime: 60 * 1000,
    
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
    
    // Don't refetch on window focus in development
    refetchOnWindowFocus: process.env.NODE_ENV === 'production',
    
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

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions,
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
