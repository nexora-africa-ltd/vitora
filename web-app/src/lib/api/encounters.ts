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
import { PaginatedResponse } from '@/lib/types/patient';

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
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },
};
