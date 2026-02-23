/**
 * React hooks for allergy data fetching and mutations.
 *
 * Structured allergy management with drug-allergy interaction checking.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { allergiesApi } from '@/lib/api/allergies';
import { toast } from 'sonner';
import type {
  AllergyCreatePayload,
  AllergyUpdatePayload,
  SubstanceType,
} from '@/lib/types/allergy';

// ============ Query Keys ============

export const allergyKeys = {
  all: ['allergies'] as const,
  lists: () => [...allergyKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...allergyKeys.lists(), filters] as const,
  patient: (patientId: number) => [...allergyKeys.all, 'patient', patientId] as const,
  detail: (patientId: number, allergyId: number) =>
    [...allergyKeys.patient(patientId), allergyId] as const,
  lookup: (query: string, type: SubstanceType) =>
    [...allergyKeys.all, 'lookup', query, type] as const,
};

// ============ Patient Allergy Hooks ============

/**
 * Hook for fetching a patient's allergies.
 */
export function usePatientAllergies(patientId: number) {
  return useQuery({
    queryKey: allergyKeys.patient(patientId),
    queryFn: () => allergiesApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

/**
 * Hook for fetching a specific allergy detail.
 */
export function useAllergy(patientId: number, allergyId: number) {
  return useQuery({
    queryKey: allergyKeys.detail(patientId, allergyId),
    queryFn: () => allergiesApi.get(patientId, allergyId),
    enabled: !!patientId && !!allergyId,
  });
}

// ============ Lookup Hook ============

/**
 * Hook for substance lookup autocomplete.
 */
export function useAllergyLookup(query: string, type: SubstanceType = 'medication') {
  return useQuery({
    queryKey: allergyKeys.lookup(query, type),
    queryFn: () => allergiesApi.lookup(query, type),
    enabled: query.length >= 2,
    staleTime: 30000, // Cache results for 30 seconds
  });
}

// ============ Mutation Hooks ============

/**
 * Hook for creating a new allergy.
 */
export function useCreateAllergy(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AllergyCreatePayload) => allergiesApi.create(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: allergyKeys.patient(patientId) });
      toast.success('Allergy recorded successfully');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to record allergy';
      toast.error(message);
    },
  });
}

/**
 * Hook for updating an allergy.
 */
export function useUpdateAllergy(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ allergyId, data }: { allergyId: number; data: AllergyUpdatePayload }) =>
      allergiesApi.update(patientId, allergyId, data),
    onSuccess: (_, { allergyId }) => {
      queryClient.invalidateQueries({ queryKey: allergyKeys.patient(patientId) });
      queryClient.invalidateQueries({ queryKey: allergyKeys.detail(patientId, allergyId) });
      toast.success('Allergy updated successfully');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to update allergy';
      toast.error(message);
    },
  });
}

/**
 * Hook for deleting an allergy.
 */
export function useDeleteAllergy(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (allergyId: number) => allergiesApi.delete(patientId, allergyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: allergyKeys.patient(patientId) });
      toast.success('Allergy removed successfully');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to remove allergy';
      toast.error(message);
    },
  });
}

/**
 * Hook for resolving an allergy (mark as resolved).
 */
export function useResolveAllergy(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (allergyId: number) =>
      allergiesApi.update(patientId, allergyId, { status: 'resolved' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: allergyKeys.patient(patientId) });
      toast.success('Allergy marked as resolved');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to resolve allergy';
      toast.error(message);
    },
  });
}

// ============ Drug Interaction Check ============

/**
 * Hook for checking drug-allergy interactions.
 *
 * Use this before prescribing or dispensing to check for conflicts.
 */
export function useCheckDrugInteractions() {
  return useMutation({
    mutationFn: ({
      patientId,
      drugIds,
      drugNames = [],
    }: {
      patientId: number;
      drugIds: number[];
      drugNames?: string[];
    }) => allergiesApi.checkInteractions(patientId, drugIds, drugNames),
  });
}
