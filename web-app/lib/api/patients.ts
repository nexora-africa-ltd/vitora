/**
 * Patients API client for Vitora HMIS
 *
 * All responses are validated with Zod schemas to catch data shape mismatches
 * before they cause runtime errors in components.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PatientSchema,
  PatientListItemSchema,
  PaginatedPatientSchema,
  EmergencyContactArrayResponseSchema,
  PatientEncounterArrayResponseSchema,
} from '@/lib/schemas/patient.schema';
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
    return parseResponse(PaginatedPatientSchema, response.data, {
      context: 'patientsApi.getPatients',
    }) as PaginatedResponse<Patient>;
  },

  /**
   * Get a single patient by ID
   */
  async getPatient(id: number): Promise<Patient> {
    const response = await apiClient.get<Patient>(`/api/patients/${id}/`);
    return parseResponse(PatientSchema, response.data, {
      context: 'patientsApi.getPatient',
    }) as Patient;
  },

  /**
   * Create a new patient with optional idempotency support.
   *
   * Sprint 1.7: Data Integrity - Idempotent API Operations
   *
   * When an idempotency key is provided:
   * - First request: Creates the patient and caches the response
   * - Subsequent requests with same key: Returns the cached response
   *
   * This prevents duplicate patient creation on network retries or
   * accidental double-submissions.
   *
   * @param data - Patient data to create
   * @param idempotencyKey - Optional UUID to prevent duplicate creation
   * @returns The created patient
   */
  async createPatient(data: PatientCreateData, idempotencyKey?: string): Promise<Patient> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    const response = await apiClient.post<Patient>('/api/patients/', data, { headers });
    return parseResponse(PatientSchema, response.data, {
      context: 'patientsApi.createPatient',
    }) as Patient;
  },

  /**
   * Update a patient
   */
  async updatePatient(id: number, data: PatientUpdateData): Promise<Patient> {
    const response = await apiClient.patch<Patient>(`/api/patients/${id}/`, data);
    return parseResponse(PatientSchema, response.data, {
      context: 'patientsApi.updatePatient',
    }) as Patient;
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
    return parseResponse(EmergencyContactArrayResponseSchema, response.data, {
      context: 'patientsApi.getEmergencyContacts',
    }) as EmergencyContact[];
  },

  /**
   * Get patient's encounters
   */
  async getEncounters(patientId: number): Promise<PatientEncounter[]> {
    const response = await apiClient.get<{ results: PatientEncounter[] }>(
      `/api/encounters/?patient=${patientId}`
    );
    const validated = parseResponse(PatientEncounterArrayResponseSchema, response.data, {
      context: 'patientsApi.getEncounters',
    });
    return validated.results;
  },
};
