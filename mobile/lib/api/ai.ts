import { apiClient } from './client';
import {
  AIClinicalAssistResponseSchema,
  AIFeedbackResponseSchema,
  AIICD10SuggestResponseSchema,
  AILabInterpretResponseSchema,
  AIStatusSchema,
} from '@/lib/schemas/ai.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type {
  AIClinicalAssistRequest,
  AIClinicalAssistResponse,
  AIFeedbackRequest,
  AIFeedbackResponse,
  AIICD10SuggestResponse,
  AILabInterpretRequest,
  AILabInterpretResponse,
  AIStatus,
} from '@/lib/types/ai';

export const aiApi = {
  /** Check TibaBot service availability. */
  async status(): Promise<AIStatus> {
    const response = await apiClient.get('/api/ai/status/');
    return parseResponse(AIStatusSchema, response.data, {
      context: 'ai.status',
    });
  },

  /** Single-turn clinical decision support query. */
  async assist(data: AIClinicalAssistRequest): Promise<AIClinicalAssistResponse> {
    const response = await apiClient.post('/api/ai/clinical/assist/', data);
    return parseResponse(AIClinicalAssistResponseSchema, response.data, {
      context: 'ai.assist',
    });
  },

  /** Auto-suggest ICD-10 codes from clinical text. */
  async suggestICD10(clinicalText: string): Promise<AIICD10SuggestResponse> {
    const response = await apiClient.post('/api/ai/icd10-suggest/', {
      clinical_text: clinicalText,
    });
    return parseResponse(AIICD10SuggestResponseSchema, response.data, {
      context: 'ai.suggestICD10',
    });
  },

  /** Interpret lab results with clinical context. */
  async interpretLab(data: AILabInterpretRequest): Promise<AILabInterpretResponse> {
    const response = await apiClient.post('/api/ai/lab/interpret/', data);
    return parseResponse(AILabInterpretResponseSchema, response.data, {
      context: 'ai.interpretLab',
    });
  },

  /** Submit feedback on an AI response. */
  async sendFeedback(data: AIFeedbackRequest): Promise<AIFeedbackResponse> {
    const response = await apiClient.post('/api/ai/feedback/', data);
    return parseResponse(AIFeedbackResponseSchema, response.data, {
      context: 'ai.sendFeedback',
    });
  },
};
