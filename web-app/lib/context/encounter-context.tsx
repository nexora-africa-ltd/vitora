/**
 * Encounter Context Provider
 * 
 * Provides a single, authoritative source of encounter data.
 * Must be used within a PatientProvider to validate patient-encounter relationship.
 * 
 * Key Features:
 * - Patient validation: Ensures encounter belongs to current patient
 * - Order permissions: Exposes canPlaceOrders based on encounter status
 * - Triage/Consultation tracking: Provides status for workflow decisions
 * - Single fetch guarantee: Encounter data fetched ONCE and shared
 * 
 * Usage:
 * ```tsx
 * <PatientProvider patientId={1}>
 *   <EncounterProvider encounterId={100}>
 *     <EncounterDetails />
 *     <LabOrderForm />
 *   </EncounterProvider>
 * </PatientProvider>
 * ```
 */
'use client';

import React, { createContext, useContext, useMemo, useEffect, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { encountersApi } from '@/lib/api/encounters';
import { useOptionalPatientContext } from './patient-context';
import type { Encounter } from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface EncounterContextValue {
  /** The encounter data (null if not loaded or error) */
  encounter: Encounter | null;
  /** Whether encounter data is currently loading */
  isLoading: boolean;
  /** Error object if fetch failed or validation failed */
  error: Error | null;
  /** Whether orders can be placed on this encounter */
  canPlaceOrders: boolean;
  /** Whether this is an active (non-completed, non-cancelled) encounter */
  isActiveEncounter: boolean;
  /** The encounter ID being fetched */
  encounterId: number | null;
  /** The patient ID from the encounter */
  patientId: number | null;
  /** Current triage status */
  triageStatus: string | null;
  /** Current consultation status */
  consultationStatus: string | null;
  /** Refetch encounter data (use sparingly) */
  refetch: () => void;
}

// =============================================================================
// Context
// =============================================================================

const EncounterContext = createContext<EncounterContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export interface EncounterProviderProps {
  /** The encounter ID to fetch */
  encounterId: number | null;
  /** Child components that will have access to encounter context */
  children: ReactNode;
}

export function EncounterProvider({ encounterId, children }: EncounterProviderProps) {
  // Get patient context (optional - may be used standalone for encounter-first flows)
  const patientContext = useOptionalPatientContext();
  
  // Track validation error separately
  const [validationError, setValidationError] = useState<Error | null>(null);

  // Fetch encounter data using React Query
  const {
    data: encounter,
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['encounter-context', encounterId],
    queryFn: () => encountersApi.get(encounterId!),
    enabled: !!encounterId && encounterId > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes - encounters change more frequently
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  // Validate patient-encounter relationship when both are loaded
  useEffect(() => {
    if (encounter && patientContext?.patient) {
      if (encounter.patient !== patientContext.patient.id) {
        setValidationError(new Error('Encounter does not belong to current patient'));
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  }, [encounter, patientContext?.patient]);

  // Derive order permissions
  const canPlaceOrders = useMemo(() => {
    if (!encounter) return false;
    // Can only place orders on IN_PROGRESS or DRAFT encounters
    return encounter.status === 'IN_PROGRESS' || encounter.status === 'DRAFT';
  }, [encounter]);

  // Derive active encounter status
  const isActiveEncounter = useMemo(() => {
    if (!encounter) return false;
    return encounter.status !== 'COMPLETED' && encounter.status !== 'CANCELLED';
  }, [encounter]);

  // Extract statuses
  const triageStatus = encounter?.triage_status ?? null;
  const consultationStatus = null; // TODO: Add when backend provides this field

  // Combine errors (validation takes precedence)
  const error = validationError ?? (fetchError as Error | null);

  // Build context value (memoized to prevent unnecessary rerenders)
  const contextValue = useMemo<EncounterContextValue>(() => ({
    encounter: validationError ? null : (encounter ?? null),
    isLoading,
    error,
    canPlaceOrders: validationError ? false : canPlaceOrders,
    isActiveEncounter: validationError ? false : isActiveEncounter,
    encounterId,
    patientId: encounter?.patient ?? null,
    triageStatus,
    consultationStatus,
    refetch,
  }), [
    encounter,
    isLoading,
    error,
    canPlaceOrders,
    isActiveEncounter,
    encounterId,
    triageStatus,
    consultationStatus,
    refetch,
    validationError,
  ]);

  return (
    <EncounterContext.Provider value={contextValue}>
      {children}
    </EncounterContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access encounter context.
 * Must be used within an EncounterProvider.
 * 
 * @throws Error if used outside of EncounterProvider
 */
export function useEncounterContext(): EncounterContextValue {
  const context = useContext(EncounterContext);
  
  if (context === undefined) {
    throw new Error('useEncounterContext must be used within an EncounterProvider');
  }
  
  return context;
}

/**
 * Optional hook that returns null instead of throwing if used outside provider.
 * Useful for components that may or may not be within an encounter context.
 */
export function useOptionalEncounterContext(): EncounterContextValue | null {
  return useContext(EncounterContext) ?? null;
}

// =============================================================================
// Exports
// =============================================================================

export { EncounterContext };
