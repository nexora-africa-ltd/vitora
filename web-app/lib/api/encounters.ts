/**
 * Encounters API client.
 */

import { apiClient } from './client';
import {
  Encounter,
  EncounterListParams,
  Diagnosis,
  TreatmentPlan,
} from '@/lib/types/encounter';
import { PaginatedResponse } from '@/lib/types';

export const encountersApi = {
  /**
   * Get paginated list of encounters.
   */
  async list(params?: EncounterListParams): Promise<PaginatedResponse<Encounter>> {
    const response = await apiClient.get<PaginatedResponse<Encounter>>('/api/encounters/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single encounter by ID.
   */
  async get(id: number): Promise<Encounter> {
    const response = await apiClient.get<Encounter>(`/api/encounters/${id}/`);
    return response.data;
  },

  /**
   * Create a new encounter.
   */
  async create(data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.post<Encounter>('/api/encounters/', data);
    return response.data;
  },

  /**
   * Update an encounter.
   */
  async update(id: number, data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.patch<Encounter>(`/api/encounters/${id}/`, data);
    return response.data;
  },

  /**
   * Get diagnoses for an encounter.
   */
  async getDiagnoses(encounterId: number): Promise<Diagnosis[]> {
    const response = await apiClient.get<Diagnosis[]>(
      `/api/encounters/${encounterId}/diagnoses/`
    );
    return response.data;
  },

  /**
   * Get treatment plan for an encounter.
   */
  async getTreatmentPlan(encounterId: number): Promise<TreatmentPlan | null> {
    try {
      const response = await apiClient.get<TreatmentPlan>(
        `/api/encounters/${encounterId}/treatment-plan/`
      );
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get pre-triage queue (encounters awaiting triage).
   * 
   * Returns encounters with:
   * - triage_status = PENDING (or IN_PROGRESS if include_in_progress=true)
   * - triage_requirement in (MANDATORY, OPTIONAL)
   * 
   * Sorted by arrival time (created_at) ascending.
   */
  async getPreTriageQueue(params?: PreTriageQueueParams): Promise<PaginatedResponse<PreTriageQueueItem>> {
    const response = await apiClient.get<PaginatedResponse<PreTriageQueueItem>>(
      '/api/encounters/pre_triage_queue/',
      { params }
    );
    return response.data;
  },

  /**
   * Edit chief complaint with audit trail.
   * 
   * Only allowed for triaged encounters. Requires a reason for the edit.
   */
  async editChiefComplaint(
    encounterId: number,
    data: {
      chief_complaint: string;
      edit_reason: string;
      edit_reason_other?: string;
    }
  ): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(
      `/api/encounters/${encounterId}/edit_chief_complaint/`,
      data
    );
    return response.data;
  },
};

// =============================================================================
// Pre-Triage Queue Types
// =============================================================================

export interface PreTriageQueueParams {
  triage_requirement?: 'MANDATORY' | 'OPTIONAL';
  encounter_type?: string;
  include_in_progress?: boolean;
}

export interface PreTriageQueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number | null;
  patient_gender: string;
  encounter_type: string;
  encounter_type_display?: string;
  chief_complaint: string;
  triage_requirement: 'MANDATORY' | 'OPTIONAL' | 'NOT_REQUIRED';
  triage_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYPASSED' | 'NOT_APPLICABLE';
  created_at: string;
  wait_time_minutes: number;
}
