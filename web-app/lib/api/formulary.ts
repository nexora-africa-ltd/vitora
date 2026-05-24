/**
 * Drug Formulary API client.
 *
 * Proxied through Django backend — never calls TibaBot directly.
 */

import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  FormularySearchResponseSchema,
  FormularyStatsSchema,
  SmpcSummarySchema,
} from '@/lib/schemas/formulary.schema';
import type {
  FormularySearchResponse,
  FormularyStats,
  SmpcSummary,
} from '@/lib/types/formulary';

export const formularyApi = {
  /**
   * Search across SmPC, PPB Products, and KEML.
   */
  async search(query: string, limit = 10): Promise<FormularySearchResponse> {
    const response = await apiClient.get<FormularySearchResponse>(
      '/api/ai/formulary/search/',
      { params: { q: query, limit } }
    );
    return parseResponse(FormularySearchResponseSchema, response.data, {
      context: 'formularyApi.search',
    });
  },

  /**
   * Get full SmPC monograph by document ID.
   */
  async getSmpc(docId: string): Promise<SmpcSummary> {
    const response = await apiClient.get<SmpcSummary>(
      `/api/ai/formulary/smpc/${docId}/`
    );
    return parseResponse(SmpcSummarySchema, response.data, {
      context: 'formularyApi.getSmpc',
    });
  },

  /**
   * Get formulary service statistics.
   */
  async stats(): Promise<FormularyStats> {
    const response = await apiClient.get<FormularyStats>(
      '/api/ai/formulary/stats/'
    );
    return parseResponse(FormularyStatsSchema, response.data, {
      context: 'formularyApi.stats',
    });
  },
};
