/**
 * AI/TibaBot React hooks.
 *
 * These hooks are feature-gated: they check NEXT_PUBLIC_ENABLE_AI before making
 * any requests. When AI is disabled, hooks return safe defaults.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '@/lib/api/ai';
import { ENABLE_AI } from '@/lib/utils/constants';
import type {
  AIICD10SuggestResponse,
  AIClinicalChatRequest,
  AIClinicalChatResponse,
  AIClinicalAssistRequest,
  AIClinicalAssistResponse,
  AIChatSessionListResponse,
  AIChatSessionDetailResponse,
} from '@/lib/types/ai';

// =============================================================================
// Query Keys
// =============================================================================

export const aiKeys = {
  all: ['ai'] as const,
  status: () => [...aiKeys.all, 'status'] as const,
  sessions: () => [...aiKeys.all, 'sessions'] as const,
  session: (id: string) => [...aiKeys.all, 'session', id] as const,
};

// =============================================================================
// Phase 1 Hooks
// =============================================================================

/**
 * Check whether AI features are enabled (frontend flag).
 *
 * Reads NEXT_PUBLIC_ENABLE_AI. When false, all AI components should
 * not be rendered — not just hidden with CSS.
 */
export function useAIEnabled(): boolean {
  return ENABLE_AI;
}

/**
 * Hook for AI-powered ICD-10 code suggestions.
 *
 * Sends clinical text to the backend AI proxy and returns ranked
 * ICD-10 code suggestions with confidence scores.
 *
 * Features:
 * - Auto-disabled when ENABLE_AI is false
 * - Returns advisory suggestions only (clinician confirms)
 * - Graceful degradation when TibaBot is unavailable
 *
 * @example
 * ```tsx
 * const { mutate, data, isPending } = useAIICD10Suggest();
 * mutate("patient presenting with malaria symptoms and fever");
 * ```
 */
export function useAIICD10Suggest() {
  return useMutation<AIICD10SuggestResponse, Error, string>({
    mutationFn: (clinicalText: string) => aiApi.suggestICD10(clinicalText),
    // Don't retry on failure — graceful degradation is handled in the response
    retry: false,
  });
}

/**
 * Hook for checking AI feature status (backend + service health).
 *
 * Calls GET /api/ai/status/ to check:
 * - Whether the backend TIBABOT_ENABLED flag is on
 * - Whether TibaBot service is actually reachable
 *
 * Only queries when the frontend flag is enabled.
 */
export function useAIStatus() {
  return useQuery({
    queryKey: aiKeys.status(),
    queryFn: () => aiApi.getStatus(),
    enabled: ENABLE_AI,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
}

// =============================================================================
// Phase 2 Hooks — Clinical Chat & Assist
// =============================================================================

/**
 * Hook for sending clinical chat messages.
 *
 * Sends a message to the clinical chat endpoint and returns the assistant response.
 * Supports session continuity via session_id.
 *
 * @example
 * ```tsx
 * const { mutateAsync, isPending } = useAIClinicalChat();
 * const response = await mutateAsync({ message: "What are the DDx for...", session_id: "abc" });
 * ```
 */
export function useAIClinicalChat() {
  const queryClient = useQueryClient();

  return useMutation<AIClinicalChatResponse, Error, AIClinicalChatRequest>({
    mutationFn: (data) => aiApi.clinicalChat(data),
    retry: false,
    onSuccess: () => {
      // Invalidate session list to show updated session
      queryClient.invalidateQueries({ queryKey: aiKeys.sessions() });
    },
  });
}

/**
 * Hook for encounter-aware clinical assistance.
 *
 * Sends patient/encounter context for contextual clinical reasoning.
 * Used when clinician clicks "Ask about this patient" in the widget.
 *
 * @example
 * ```tsx
 * const { mutateAsync, isPending } = useAIClinicalAssist();
 * const response = await mutateAsync({
 *   query: "Differential diagnosis",
 *   patient_context: { patient_age: 45, patient_sex: "M" },
 *   encounter_context: { chief_complaint: "cough x 3 days" },
 * });
 * ```
 */
export function useAIClinicalAssist() {
  return useMutation<AIClinicalAssistResponse, Error, AIClinicalAssistRequest>({
    mutationFn: (data) => aiApi.clinicalAssist(data),
    retry: false,
  });
}

/**
 * Hook for listing chat sessions.
 *
 * Fetches all chat sessions for the current user.
 * Cached for 2 minutes; invalidated when a new message is sent.
 */
export function useAIChatSessions() {
  return useQuery<AIChatSessionListResponse, Error>({
    queryKey: aiKeys.sessions(),
    queryFn: () => aiApi.listChatSessions(),
    enabled: ENABLE_AI,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook for fetching a specific chat session with its messages.
 *
 * @param sessionId - The session UUID to fetch
 */
export function useAIChatSession(sessionId: string | null) {
  return useQuery<AIChatSessionDetailResponse, Error>({
    queryKey: aiKeys.session(sessionId ?? ''),
    queryFn: () => aiApi.getChatSession(sessionId!),
    enabled: ENABLE_AI && !!sessionId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook for deleting a chat session.
 *
 * Invalidates the session list after deletion.
 */
export function useDeleteAIChatSession() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (sessionId) => aiApi.deleteChatSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.sessions() });
    },
  });
}
