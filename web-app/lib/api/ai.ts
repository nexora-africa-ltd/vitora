/**
 * AI/TibaBot API client.
 *
 * All TibaBot calls are proxied through the Django backend.
 * The frontend never calls TibaBot directly.
 */

import { apiClient } from '@/lib/api/client';
import { AIICD10SuggestResponseSchema, AIStatusSchema } from '@/lib/schemas/ai.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { AIICD10SuggestResponse, AIStatus } from '@/lib/types/ai';

export const aiApi = {
  /**
   * Get ICD-10 code suggestions for clinical text.
   *
   * Sends clinical text to the Django backend, which proxies to TibaBot.
   * Returns ranked ICD-10 codes with confidence scores.
   *
   * Advisory only — clinician must confirm/reject each suggestion.
   *
   * @param clinicalText - Free-text clinical description
   * @returns Ranked ICD-10 suggestions with confidence scores
   */
  suggestICD10: async (clinicalText: string): Promise<AIICD10SuggestResponse> => {
    const response = await apiClient.post('/api/ai/icd10-suggest/', {
      clinical_text: clinicalText,
    });
    return parseResponse(AIICD10SuggestResponseSchema, response.data, {
      context: 'aiApi.suggestICD10',
    });
  },

  /**
   * Check AI feature status.
   *
   * Returns whether AI features are enabled and if TibaBot is reachable.
   * Used to decide whether to render AI components in the UI.
   */
  getStatus: async (): Promise<AIStatus> => {
    const response = await apiClient.get('/api/ai/status/');
    return parseResponse(AIStatusSchema, response.data, {
      context: 'aiApi.getStatus',
    });
  },
};
