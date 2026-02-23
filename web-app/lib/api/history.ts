/**
 * History API client for Vitora HMIS
 *
 * Provides methods to fetch version history for models with audit trail tracking.
 * Supports DHA compliance requirement for field-level change tracking.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  VersionHistoryArraySchema,
  VersionCountSchema,
} from '@/lib/schemas/history.schema';
import type {
  VersionHistoryItem,
  VersionCountResponse,
  HistoryParams,
} from '@/lib/types/history';

/**
 * Supported model types for history tracking
 */
export type HistoryModelType = 'patients' | 'encounters' | 'prescriptions' | 'diagnoses';

export const historyApi = {
  /**
   * Get version history for a patient
   */
  async getPatientHistory(
    patientId: number,
    params: HistoryParams = {}
  ): Promise<VersionHistoryItem[]> {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));

    const url = `/api/patients/${patientId}/history/${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const response = await apiClient.get<VersionHistoryItem[]>(url);

    return parseResponse(VersionHistoryArraySchema, response.data, {
      context: 'historyApi.getPatientHistory',
    }) as VersionHistoryItem[];
  },

  /**
   * Get version count for a patient
   */
  async getPatientHistoryCount(patientId: number): Promise<VersionCountResponse> {
    const response = await apiClient.get<VersionCountResponse>(
      `/api/patients/${patientId}/history-count/`
    );

    return parseResponse(VersionCountSchema, response.data, {
      context: 'historyApi.getPatientHistoryCount',
    }) as VersionCountResponse;
  },

  /**
   * Get version history for an encounter
   */
  async getEncounterHistory(
    encounterId: number,
    params: HistoryParams = {}
  ): Promise<VersionHistoryItem[]> {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));

    const url = `/api/encounters/${encounterId}/history/${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const response = await apiClient.get<VersionHistoryItem[]>(url);

    return parseResponse(VersionHistoryArraySchema, response.data, {
      context: 'historyApi.getEncounterHistory',
    }) as VersionHistoryItem[];
  },

  /**
   * Get version count for an encounter
   */
  async getEncounterHistoryCount(encounterId: number): Promise<VersionCountResponse> {
    const response = await apiClient.get<VersionCountResponse>(
      `/api/encounters/${encounterId}/history-count/`
    );

    return parseResponse(VersionCountSchema, response.data, {
      context: 'historyApi.getEncounterHistoryCount',
    }) as VersionCountResponse;
  },

  /**
   * Get version history for a prescription
   */
  async getPrescriptionHistory(
    prescriptionId: number,
    params: HistoryParams = {}
  ): Promise<VersionHistoryItem[]> {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));

    const url = `/api/pharmacy/prescriptions/${prescriptionId}/history/${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const response = await apiClient.get<VersionHistoryItem[]>(url);

    return parseResponse(VersionHistoryArraySchema, response.data, {
      context: 'historyApi.getPrescriptionHistory',
    }) as VersionHistoryItem[];
  },

  /**
   * Get version history for a diagnosis
   */
  async getDiagnosisHistory(
    diagnosisId: number,
    params: HistoryParams = {}
  ): Promise<VersionHistoryItem[]> {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));

    const url = `/api/encounters/diagnoses/${diagnosisId}/history/${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const response = await apiClient.get<VersionHistoryItem[]>(url);

    return parseResponse(VersionHistoryArraySchema, response.data, {
      context: 'historyApi.getDiagnosisHistory',
    }) as VersionHistoryItem[];
  },
};
