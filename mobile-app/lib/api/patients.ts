/**
 * Patients API Module
 *
 * Provides type-safe methods for patient CRUD operations.
 *
 * @module lib/api/patients
 */

import { getApiClient } from './client';

/**
 * Patient type matching backend Patient model
 */
export interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  county: number;
  sub_county: number;
  ward?: number | null;
  national_id?: string | null;
  phone_number?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  referral_source?: string;
  is_sensitive?: boolean;
  consent_given?: boolean;
  consent_date?: string | null;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Data required to create a new patient
 */
export interface CreatePatientData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  county: number;
  sub_county: number;
  ward?: number | null;
  national_id?: string | null;
  phone_number?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  referral_source?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

/**
 * Partial data for updating a patient
 */
export type UpdatePatientData = Partial<CreatePatientData>;

/**
 * Paginated response from patient list endpoint
 */
export interface PatientListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Patient[];
}

/**
 * Query parameters for patient list
 */
export interface PatientListParams {
  page?: number;
  page_size?: number;
  search?: string;
  mrn?: string;
  county?: number;
  sub_county?: number;
  gender?: 'M' | 'F' | 'O';
  ordering?: string;
}

/**
 * Patients API methods
 */
export const patientsApi = {
  /**
   * List patients with pagination and filtering
   *
   * @param params - Optional query parameters
   * @returns Paginated list of patients
   */
  async list(params?: PatientListParams): Promise<PatientListResponse> {
    const client = getApiClient();
    const response = await client.get<PatientListResponse>('/api/patients/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single patient by ID
   *
   * @param id - Patient ID
   * @returns Patient details
   */
  async get(id: number): Promise<Patient> {
    const client = getApiClient();
    const response = await client.get<Patient>(`/api/patients/${id}/`);
    return response.data;
  },

  /**
   * Create a new patient
   *
   * @param data - Patient data
   * @returns Created patient with auto-generated MRN
   */
  async create(data: CreatePatientData): Promise<Patient> {
    const client = getApiClient();
    const response = await client.post<Patient>('/api/patients/', data);
    return response.data;
  },

  /**
   * Update an existing patient
   *
   * @param id - Patient ID
   * @param data - Partial patient data to update
   * @returns Updated patient
   */
  async update(id: number, data: UpdatePatientData): Promise<Patient> {
    const client = getApiClient();
    const response = await client.patch<Patient>(`/api/patients/${id}/`, data);
    return response.data;
  },

  /**
   * Delete a patient
   *
   * @param id - Patient ID
   */
  async delete(id: number): Promise<void> {
    const client = getApiClient();
    await client.delete(`/api/patients/${id}/`);
  },

  /**
   * Find a patient by MRN
   *
   * @param mrn - Medical Record Number
   * @returns Patient or null if not found
   */
  async getByMrn(mrn: string): Promise<Patient | null> {
    const client = getApiClient();
    const response = await client.get<PatientListResponse>('/api/patients/', {
      params: { mrn },
    });

    if (response.data.count > 0 && response.data.results.length > 0) {
      return response.data.results[0];
    }

    return null;
  },
};
