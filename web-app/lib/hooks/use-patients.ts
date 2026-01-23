/**
 * Patient hooks for data fetching and mutations.
 *
 * Consolidated from use-patients.ts and use-patients-enhanced.ts
 * to provide a single source of truth for patient-related hooks.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '@/lib/api/patients';
import type { PatientListParams, PatientCreateData, PatientUpdateData } from '@/lib/types/patient';

/**
 * Hook for fetching paginated patients list
 */
export function usePatients(params: PatientListParams = {}) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => patientsApi.getPatients(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook for fetching a single patient
 */
export function usePatient(id: number | string) {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

  return useQuery({
    queryKey: ['patient', numericId],
    queryFn: () => patientsApi.getPatient(numericId),
    enabled: !!id && !isNaN(numericId),
  });
}

/**
 * Hook for fetching patient's emergency contacts
 */
export function usePatientEmergencyContacts(patientId: number) {
  return useQuery({
    queryKey: ['patient', patientId, 'emergency-contacts'],
    queryFn: () => patientsApi.getEmergencyContacts(patientId),
    enabled: !!patientId,
  });
}

/**
 * Hook for fetching patient's encounters
 */
export function usePatientEncounters(patientId: number) {
  return useQuery({
    queryKey: ['patient', patientId, 'encounters'],
    queryFn: () => patientsApi.getEncounters(patientId),
    enabled: !!patientId,
  });
}

/**
 * Hook for creating a patient with optional idempotency support.
 *
 * Sprint 1.7: Data Integrity - Idempotent API Operations
 *
 * @example
 * const createPatient = useCreatePatient();
 * const [idempotencyKey, clearKey] = useIdempotencyKey('patient-registration');
 *
 * await createPatient.mutateAsync({ data, idempotencyKey });
 * clearKey(); // Clear after success
 */
export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, idempotencyKey }: { data: PatientCreateData; idempotencyKey?: string }) =>
      patientsApi.createPatient(data, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/**
 * Hook for updating a patient
 */
export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PatientUpdateData }) =>
      patientsApi.updatePatient(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

/**
 * Hook for deleting a patient
 */
export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => patientsApi.deletePatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}
