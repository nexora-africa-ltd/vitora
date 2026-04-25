/**
 * Social History Observation API client.
 *
 * Structured social-history management for FHIR R4 interoperability.
 * Endpoints are nested under patients.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import { SocialHistoryObservationSchema } from '@/lib/schemas/social-history.schema';
import type {
  SocialHistoryObservation,
  SocialHistoryCreatePayload,
  SocialHistoryUpdatePayload,
} from '@/lib/types/social-history';

export const socialHistoryApi = {
  /**
   * List social history observations for a specific patient.
   */
  async listByPatient(patientId: number): Promise<SocialHistoryObservation[]> {
    const response = await apiClient.get(`/api/patients/${patientId}/social-history/`);
    return parseResponse(z.array(SocialHistoryObservationSchema), response.data.results || [], {
      context: 'socialHistoryApi.listByPatient',
    });
  },

  /**
   * Get a specific social history observation.
   */
  async get(patientId: number, observationId: number): Promise<SocialHistoryObservation> {
    const response = await apiClient.get(
      `/api/patients/${patientId}/social-history/${observationId}/`
    );
    return parseResponse(SocialHistoryObservationSchema, response.data, {
      context: 'socialHistoryApi.get',
    });
  },

  /**
   * Create a new social history observation.
   */
  async create(
    patientId: number,
    data: SocialHistoryCreatePayload
  ): Promise<SocialHistoryObservation> {
    const response = await apiClient.post(`/api/patients/${patientId}/social-history/`, data);
    return parseResponse(SocialHistoryObservationSchema, response.data, {
      context: 'socialHistoryApi.create',
    });
  },

  /**
   * Update an existing social history observation.
   */
  async update(
    patientId: number,
    observationId: number,
    data: SocialHistoryUpdatePayload
  ): Promise<SocialHistoryObservation> {
    const response = await apiClient.patch(
      `/api/patients/${patientId}/social-history/${observationId}/`,
      data
    );
    return parseResponse(SocialHistoryObservationSchema, response.data, {
      context: 'socialHistoryApi.update',
    });
  },

  /**
   * Delete a social history observation.
   */
  async delete(patientId: number, observationId: number): Promise<void> {
    await apiClient.delete(`/api/patients/${patientId}/social-history/${observationId}/`);
  },
};
