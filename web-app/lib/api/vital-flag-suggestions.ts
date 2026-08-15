/**
 * API client for patient vitals-derived review suggestions.
 *
 * Purpose:
 * - Wrap /api/patients/{patientId}/vital-flag-suggestions endpoints.
 *
 * Usage:
 * - Import into hooks/components for list/review actions.
 *
 * Inputs:
 * - patientId, suggestionId, and action payloads.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  VitalFlagSuggestionListSchema,
  VitalFlagSuggestionSchema,
} from '@/lib/schemas/vital-flag-suggestion.schema';
import type {
  VitalFlagAcceptPayload,
  VitalFlagAcknowledgePayload,
  VitalFlagMapPayload,
  VitalFlagRejectPayload,
  VitalFlagSuggestion,
} from '@/lib/types/vital-flag-suggestion';

export const vitalFlagSuggestionsApi = {
  async listByPatient(patientId: number): Promise<VitalFlagSuggestion[]> {
    const response = await apiClient.get(`/api/patients/${patientId}/vital-flag-suggestions/`);
    return parseResponse(VitalFlagSuggestionListSchema, response.data.results || [], {
      context: 'vitalFlagSuggestionsApi.listByPatient',
    });
  },

  async get(patientId: number, suggestionId: number): Promise<VitalFlagSuggestion> {
    const response = await apiClient.get(
      `/api/patients/${patientId}/vital-flag-suggestions/${suggestionId}/`
    );
    return parseResponse(VitalFlagSuggestionSchema, response.data, {
      context: 'vitalFlagSuggestionsApi.get',
    });
  },

  async acknowledge(
    patientId: number,
    suggestionId: number,
    data: VitalFlagAcknowledgePayload = {}
  ): Promise<VitalFlagSuggestion> {
    const response = await apiClient.post(
      `/api/patients/${patientId}/vital-flag-suggestions/${suggestionId}/acknowledge/`,
      data
    );
    return parseResponse(VitalFlagSuggestionSchema, response.data, {
      context: 'vitalFlagSuggestionsApi.acknowledge',
    });
  },

  async mapCodes(
    patientId: number,
    suggestionId: number,
    data: VitalFlagMapPayload
  ): Promise<VitalFlagSuggestion> {
    const response = await apiClient.post(
      `/api/patients/${patientId}/vital-flag-suggestions/${suggestionId}/map-codes/`,
      data
    );
    return parseResponse(VitalFlagSuggestionSchema, response.data, {
      context: 'vitalFlagSuggestionsApi.mapCodes',
    });
  },

  async accept(
    patientId: number,
    suggestionId: number,
    data: VitalFlagAcceptPayload
  ): Promise<VitalFlagSuggestion> {
    const response = await apiClient.post(
      `/api/patients/${patientId}/vital-flag-suggestions/${suggestionId}/accept/`,
      data
    );
    return parseResponse(VitalFlagSuggestionSchema, response.data, {
      context: 'vitalFlagSuggestionsApi.accept',
    });
  },

  async reject(
    patientId: number,
    suggestionId: number,
    data: VitalFlagRejectPayload
  ): Promise<VitalFlagSuggestion> {
    const response = await apiClient.post(
      `/api/patients/${patientId}/vital-flag-suggestions/${suggestionId}/reject/`,
      data
    );
    return parseResponse(VitalFlagSuggestionSchema, response.data, {
      context: 'vitalFlagSuggestionsApi.reject',
    });
  },
};
