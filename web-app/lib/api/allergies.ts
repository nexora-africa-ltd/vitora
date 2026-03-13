/**
 * Allergy API client.
 *
 * Structured allergy management with drug-allergy interaction checking.
 * Endpoints are nested under patients or standalone.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  AllergySchema,
  AllergyListSchema,
  AllergyLookupResultSchema,
  DrugInteractionCheckSchema,
  HptSubstanceSearchResponseSchema,
} from '@/lib/schemas/allergy.schema';
import type {
  Allergy,
  AllergyListItem,
  AllergyLookupResult,
  AllergyCreatePayload,
  AllergyUpdatePayload,
  DrugInteractionCheck,
  SubstanceType,
  HptSubstanceResult,
} from '@/lib/types/allergy';

export const allergiesApi = {
  // ============ Patient Allergies (Nested) ============

  /**
   * List allergies for a specific patient.
   */
  async listByPatient(patientId: number): Promise<AllergyListItem[]> {
    const response = await apiClient.get(`/api/patients/${patientId}/allergies/`);
    return parseResponse(z.array(AllergyListSchema), response.data, {
      context: 'allergiesApi.listByPatient',
    });
  },

  /**
   * Get a specific allergy detail for a patient.
   */
  async get(patientId: number, allergyId: number): Promise<Allergy> {
    const response = await apiClient.get(`/api/patients/${patientId}/allergies/${allergyId}/`);
    return parseResponse(AllergySchema, response.data, {
      context: 'allergiesApi.get',
    });
  },

  /**
   * Create a new allergy for a patient.
   */
  async create(patientId: number, data: AllergyCreatePayload): Promise<Allergy> {
    const response = await apiClient.post(`/api/patients/${patientId}/allergies/`, data);
    return parseResponse(AllergySchema, response.data, {
      context: 'allergiesApi.create',
    });
  },

  /**
   * Update an existing allergy.
   */
  async update(patientId: number, allergyId: number, data: AllergyUpdatePayload): Promise<Allergy> {
    const response = await apiClient.patch(
      `/api/patients/${patientId}/allergies/${allergyId}/`,
      data
    );
    return parseResponse(AllergySchema, response.data, {
      context: 'allergiesApi.update',
    });
  },

  /**
   * Delete an allergy.
   */
  async delete(patientId: number, allergyId: number): Promise<void> {
    await apiClient.delete(`/api/patients/${patientId}/allergies/${allergyId}/`);
  },

  // ============ Standalone Allergies ============

  /**
   * List all allergies (standalone, with optional filters).
   */
  async list(params?: {
    patient?: number;
    substance_type?: SubstanceType;
    severity?: string;
    status?: string;
    search?: string;
  }): Promise<AllergyListItem[]> {
    const response = await apiClient.get('/api/allergies/', { params });
    return parseResponse(z.array(AllergyListSchema), response.data, {
      context: 'allergiesApi.list',
    });
  },

  /**
   * Get a specific allergy by ID (standalone).
   */
  async getById(allergyId: number): Promise<Allergy> {
    const response = await apiClient.get(`/api/allergies/${allergyId}/`);
    return parseResponse(AllergySchema, response.data, {
      context: 'allergiesApi.getById',
    });
  },

  // ============ Lookup & Interactions ============

  /**
   * Look up allergy substances for autocomplete.
   *
   * @param query - Search query (minimum 2 characters)
   * @param type - Substance type filter (defaults to medication)
   */
  async lookup(query: string, type: SubstanceType = 'medication'): Promise<AllergyLookupResult[]> {
    const response = await apiClient.get('/api/allergies/lookup/', {
      params: { q: query, type },
    });
    return parseResponse(z.array(AllergyLookupResultSchema), response.data, {
      context: 'allergiesApi.lookup',
    });
  },

  /**
   * Check drug-allergy interactions for a patient.
   *
   * @param patientId - Patient ID
   * @param drugIds - List of drug IDs to check
   * @param drugNames - Optional list of drug names to check
   */
  async checkInteractions(
    patientId: number,
    drugIds: number[],
    drugNames: string[] = []
  ): Promise<DrugInteractionCheck> {
    const response = await apiClient.post('/api/allergies/check-interactions/', {
      patient_id: patientId,
      drug_ids: drugIds,
      drug_names: drugNames,
    });
    return parseResponse(DrugInteractionCheckSchema, response.data, {
      context: 'allergiesApi.checkInteractions',
    });
  },

  // ============ HPT Substance Search ============

  /**
   * Search HPT active components for allergy substance recording.
   * Uses DHA HPT Registry to find active pharmaceutical ingredients by ATC code.
   *
   * @param query - Search query (minimum 2 characters)
   */
  async hptSubstanceSearch(query: string): Promise<{ count: number; results: HptSubstanceResult[] }> {
    const response = await apiClient.get('/api/patients/allergies/hpt-substance-search/', {
      params: { q: query },
    });
    return parseResponse(HptSubstanceSearchResponseSchema, response.data, {
      context: 'allergiesApi.hptSubstanceSearch',
    });
  },
};
