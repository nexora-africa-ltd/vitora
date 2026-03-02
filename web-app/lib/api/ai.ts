/**
 * AI/TibaBot API client.
 *
 * All TibaBot calls are proxied through the Django backend.
 * The frontend never calls TibaBot directly.
 */

import { apiClient } from '@/lib/api/client';
import {
  AIICD10SuggestResponseSchema,
  AIStatusSchema,
  AIClinicalChatResponseSchema,
  AIClinicalAssistResponseSchema,
  AIChatSessionListResponseSchema,
  AIChatSessionDetailResponseSchema,
} from '@/lib/schemas/ai.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type {
  AIICD10SuggestResponse,
  AIStatus,
  AIClinicalChatRequest,
  AIClinicalChatResponse,
  AIClinicalAssistRequest,
  AIClinicalAssistResponse,
  AIChatSessionListResponse,
  AIChatSessionDetailResponse,
} from '@/lib/types/ai';

export const aiApi = {
  // ===========================================================================
  // Phase 1 — ICD-10
  // ===========================================================================

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

  // ===========================================================================
  // Phase 2 — Clinical Chat & Assist
  // ===========================================================================

  /**
   * Send a message in a clinical chat session.
   *
   * If session_id is provided, continues an existing session.
   * Otherwise, creates a new session.
   *
   * @param data - Chat request with message and optional session_id
   * @returns Chat response with session_id and assistant message
   */
  clinicalChat: async (data: AIClinicalChatRequest): Promise<AIClinicalChatResponse> => {
    const response = await apiClient.post('/api/ai/clinical/chat/', data);
    return parseResponse(AIClinicalChatResponseSchema, response.data, {
      context: 'aiApi.clinicalChat',
    });
  },

  /**
   * Get encounter-aware clinical assistance.
   *
   * Sends patient/encounter context (no PII) for contextual clinical reasoning.
   * Used when clinician clicks "Ask about this patient" on an encounter page.
   *
   * @param data - Assist request with query, patient_context, encounter_context
   * @returns Clinical assist response with reasoning and references
   */
  clinicalAssist: async (data: AIClinicalAssistRequest): Promise<AIClinicalAssistResponse> => {
    const response = await apiClient.post('/api/ai/clinical/assist/', data);
    return parseResponse(AIClinicalAssistResponseSchema, response.data, {
      context: 'aiApi.clinicalAssist',
    });
  },

  /**
   * List all chat sessions for the current user.
   *
   * Returns session summaries ordered by most recent update.
   */
  listChatSessions: async (): Promise<AIChatSessionListResponse> => {
    const response = await apiClient.get('/api/ai/clinical/chat/sessions/');
    return parseResponse(AIChatSessionListResponseSchema, response.data, {
      context: 'aiApi.listChatSessions',
    });
  },

  /**
   * Get a specific chat session with its full message history.
   *
   * @param sessionId - Session UUID
   * @returns Session detail with all messages
   */
  getChatSession: async (sessionId: string): Promise<AIChatSessionDetailResponse> => {
    const response = await apiClient.get(`/api/ai/clinical/chat/session/${sessionId}/`);
    return parseResponse(AIChatSessionDetailResponseSchema, response.data, {
      context: 'aiApi.getChatSession',
    });
  },

  /**
   * Delete a chat session and all its messages.
   *
   * @param sessionId - Session UUID
   */
  deleteChatSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`/api/ai/clinical/chat/session/${sessionId}/`);
  },
};
