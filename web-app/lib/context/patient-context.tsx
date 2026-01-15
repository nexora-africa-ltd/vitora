/**
 * Patient Context Provider
 * 
 * Provides a single, authoritative source of patient data across all child components.
 * This eliminates duplicate fetches and ensures patient identity consistency.
 * 
 * Key Features:
 * - Single fetch guarantee: Patient data fetched ONCE and shared
 * - Verification status: Tracks CR and SHA verification
 * - Read-only by design: No mutation methods exposed
 * - Error handling: Graceful error state management
 * 
 * Usage:
 * ```tsx
 * <PatientProvider patientId={1}>
 *   <PatientShellHeader />
 *   <PatientDetails />
 * </PatientProvider>
 * ```
 */
'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '@/lib/api/patients';
import type { Patient } from '@/lib/types/patient';

// =============================================================================
// Types
// =============================================================================

export interface PatientContextValue {
  /** The patient data (null if not loaded or error) */
  patient: Patient | null;
  /** Whether patient data is currently loading */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
  /** Whether the patient has a CR number (verified in Client Registry) */
  isVerified: boolean;
  /** Whether the patient has SHA coverage */
  hasSHA: boolean;
  /** Whether this is a sensitive patient (HIV/GBV/Mental Health) */
  isSensitive: boolean;
  /** The patient ID being fetched */
  patientId: number | null;
  /** Refetch patient data (use sparingly) */
  refetch: () => void;
}

// =============================================================================
// Context
// =============================================================================

const PatientContext = createContext<PatientContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export interface PatientProviderProps {
  /** The patient ID to fetch */
  patientId: number | null;
  /** Child components that will have access to patient context */
  children: ReactNode;
}

export function PatientProvider({ patientId, children }: PatientProviderProps) {
  // Fetch patient data using React Query
  const {
    data: patient,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['patient-context', patientId],
    queryFn: () => patientsApi.getPatient(patientId!),
    enabled: !!patientId && patientId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - patient data doesn't change often
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Derive verification status
  const isVerified = useMemo(() => {
    return !!patient?.cr_number;
  }, [patient?.cr_number]);

  const hasSHA = useMemo(() => {
    return !!patient?.sha_number;
  }, [patient?.sha_number]);

  const isSensitive = useMemo(() => {
    return patient?.is_sensitive ?? false;
  }, [patient?.is_sensitive]);

  // Build context value (memoized to prevent unnecessary rerenders)
  const contextValue = useMemo<PatientContextValue>(() => ({
    patient: patient ?? null,
    isLoading,
    error: error as Error | null,
    isVerified,
    hasSHA,
    isSensitive,
    patientId,
    refetch,
  }), [patient, isLoading, error, isVerified, hasSHA, isSensitive, patientId, refetch]);

  return (
    <PatientContext.Provider value={contextValue}>
      {children}
    </PatientContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access patient context.
 * Must be used within a PatientProvider.
 * 
 * @throws Error if used outside of PatientProvider
 */
export function usePatientContext(): PatientContextValue {
  const context = useContext(PatientContext);
  
  if (context === undefined) {
    throw new Error('usePatientContext must be used within a PatientProvider');
  }
  
  return context;
}

/**
 * Optional hook that returns null instead of throwing if used outside provider.
 * Useful for components that may or may not be within a patient context.
 */
export function useOptionalPatientContext(): PatientContextValue | null {
  return useContext(PatientContext) ?? null;
}

// =============================================================================
// Exports
// =============================================================================

export { PatientContext };
