/**
 * React hooks for version history
 *
 * Provides data fetching hooks for model version history.
 */

import { useQuery } from '@tanstack/react-query';
import { historyApi } from '@/lib/api/history';
import type { HistoryParams } from '@/lib/types/history';

/**
 * Query key factory for history queries
 */
export const historyKeys = {
  all: ['history'] as const,
  patient: (patientId: number) => [...historyKeys.all, 'patient', patientId] as const,
  patientHistory: (patientId: number, params?: HistoryParams) =>
    [...historyKeys.patient(patientId), 'versions', params] as const,
  patientCount: (patientId: number) =>
    [...historyKeys.patient(patientId), 'count'] as const,
  encounter: (encounterId: number) => [...historyKeys.all, 'encounter', encounterId] as const,
  encounterHistory: (encounterId: number, params?: HistoryParams) =>
    [...historyKeys.encounter(encounterId), 'versions', params] as const,
  prescription: (prescriptionId: number) =>
    [...historyKeys.all, 'prescription', prescriptionId] as const,
  prescriptionHistory: (prescriptionId: number, params?: HistoryParams) =>
    [...historyKeys.prescription(prescriptionId), 'versions', params] as const,
  diagnosis: (diagnosisId: number) => [...historyKeys.all, 'diagnosis', diagnosisId] as const,
  diagnosisHistory: (diagnosisId: number, params?: HistoryParams) =>
    [...historyKeys.diagnosis(diagnosisId), 'versions', params] as const,
};

/**
 * Hook to fetch patient version history
 */
export function usePatientHistory(patientId: number, params: HistoryParams = {}) {
  return useQuery({
    queryKey: historyKeys.patientHistory(patientId, params),
    queryFn: () => historyApi.getPatientHistory(patientId, params),
    enabled: !!patientId,
  });
}

/**
 * Hook to fetch patient version count
 */
export function usePatientHistoryCount(patientId: number) {
  return useQuery({
    queryKey: historyKeys.patientCount(patientId),
    queryFn: () => historyApi.getPatientHistoryCount(patientId),
    enabled: !!patientId,
  });
}

/**
 * Hook to fetch encounter version history
 */
export function useEncounterHistory(encounterId: number, params: HistoryParams = {}) {
  return useQuery({
    queryKey: historyKeys.encounterHistory(encounterId, params),
    queryFn: () => historyApi.getEncounterHistory(encounterId, params),
    enabled: !!encounterId,
  });
}

/**
 * Hook to fetch prescription version history
 */
export function usePrescriptionHistory(prescriptionId: number, params: HistoryParams = {}) {
  return useQuery({
    queryKey: historyKeys.prescriptionHistory(prescriptionId, params),
    queryFn: () => historyApi.getPrescriptionHistory(prescriptionId, params),
    enabled: !!prescriptionId,
  });
}

/**
 * Hook to fetch diagnosis version history
 */
export function useDiagnosisHistory(diagnosisId: number, params: HistoryParams = {}) {
  return useQuery({
    queryKey: historyKeys.diagnosisHistory(diagnosisId, params),
    queryFn: () => historyApi.getDiagnosisHistory(diagnosisId, params),
    enabled: !!diagnosisId,
  });
}
