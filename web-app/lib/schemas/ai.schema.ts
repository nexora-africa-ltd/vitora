/**
 * Zod schemas for AI/TibaBot API response validation.
 */

import { z } from 'zod';

// =============================================================================
// Phase 1 — ICD-10
// =============================================================================

/** Schema for a single ICD-10 suggestion */
export const AIICD10SuggestionSchema = z.object({
  code: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Schema for the ICD-10 suggest response */
export const AIICD10SuggestResponseSchema = z.object({
  suggestions: z.array(AIICD10SuggestionSchema),
  clinical_text_preview: z.string().optional(),
  error: z.string().optional(),
});

/** Schema for AI status response */
export const AIStatusSchema = z.object({
  enabled: z.boolean(),
  service_name: z.string(),
  service_available: z.boolean(),
});

// =============================================================================
// Phase 2 — Clinical Chat & Assist
// =============================================================================

/** Schema for a single chat message */
export const AIChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
  isStreaming: z.boolean().optional(),
});

/** Schema for POST /api/ai/clinical/chat/ response */
export const AIClinicalChatResponseSchema = z.object({
  session_id: z.string(),
  message: AIChatMessageSchema,
  error: z.string().optional(),
});

/** Schema for POST /api/ai/clinical/assist/ response */
export const AIClinicalAssistResponseSchema = z.object({
  response: z.string(),
  references: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});

/** Schema for a chat session summary */
export const AIChatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
});

/** Schema for GET /api/ai/clinical/chat/sessions/ response */
export const AIChatSessionListResponseSchema = z.object({
  sessions: z.array(AIChatSessionSchema),
});

/** Schema for GET /api/ai/clinical/chat/session/{id}/ response */
export const AIChatSessionDetailResponseSchema = z.object({
  session: AIChatSessionSchema,
  messages: z.array(AIChatMessageSchema),
});

// =============================================================================
// Phase 3 — Feedback
// =============================================================================

/** Schema for POST /api/ai/feedback/ response */
export const AIFeedbackResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
  feedback_id: z.string().optional(),
});

/** Schema for GET /api/ai/feedback/stats/ response */
export const AIFeedbackStatsSchema = z.object({
  total_up: z.number(),
  total_down: z.number(),
  recent_negatives: z.number().optional(),
});
