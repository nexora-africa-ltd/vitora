/**
 * Patients API client for Vitora HMIS
 */

import { apiClient } from './client';
import type { Patient, PatientCreateData, PatientUpdateData, PatientListParams, EmergencyContact, PatientEncounter } from '@/lib/types/patient';
import type { PaginatedResponse } from '@/lib/types';

export const patientsApi = {
  /**
   * Get paginated list of patients
   */
  async getPatients(params: PatientListParams = {}): Promise<PaginatedResponse<Patient>> {
    const searchParams = new URLSearchParams();

    if (params.page) searchParams.set('page', String(params.page));
    if (params.page_size) searchParams.set('page_size', String(params.page_size));
    if (params.search) searchParams.set('search', params.search);
    if (params.gender) searchParams.set('gender', params.gender);
    if (params.county) searchParams.set('county', String(params.county));
    if (params.is_sensitive !== undefined) searchParams.set('is_sensitive', String(params.is_sensitive));
    if (params.ordering) searchParams.set('ordering', params.ordering);

    const response = await apiClient.get<PaginatedResponse<Patient>>(
      `/api/patients/?${searchParams.toString()}`
    );
    return response.data;
  },

  /**
   * Get a single patient by ID
   */
  async getPatient(id: number): Promise<Patient> {
    const response = await apiClient.get<Patient>(`/api/patients/${id}/`);
    return response.data;
  },

  /**
   * Create a new patient
   */
  async createPatient(data: PatientCreateData): Promise<Patient> {
    const response = await apiClient.post<Patient>('/api/patients/', data);
    return response.data;
  },

  /**
   * Update a patient
   */
  async updatePatient(id: number, data: PatientUpdateData): Promise<Patient> {
    const response = await apiClient.patch<Patient>(`/api/patients/${id}/`, data);
    return response.data;
  },

  /**
   * Delete a patient
   */
  async deletePatient(id: number): Promise<void> {
    await apiClient.delete(`/api/patients/${id}/`);
  },

  /**
   * Get patient's emergency contacts
   */
  async getEmergencyContacts(patientId: number): Promise<EmergencyContact[]> {
    const response = await apiClient.get<EmergencyContact[]>(
      `/api/patients/${patientId}/emergency-contacts/`
    );
    return response.data;
  },

  /**
   * Get patient's encounters
   */
  async getEncounters(patientId: number): Promise<PatientEncounter[]> {
    const response = await apiClient.get<{ results: PatientEncounter[] }>(
      `/api/encounters/?patient=${patientId}`
    );
    return response.data.results || [];
  },
};
