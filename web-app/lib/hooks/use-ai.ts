/**
 * AI/TibaBot React hooks.
 *
 * These hooks are feature-gated: they check NEXT_PUBLIC_ENABLE_AI before making
 * any requests. When AI is disabled, hooks return safe defaults.
 */

'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { aiApi } from '@/lib/api/ai';
import { ENABLE_AI } from '@/lib/utils/constants';
import type { AIICD10SuggestResponse } from '@/lib/types/ai';

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
    queryKey: ['ai-status'],
    queryFn: () => aiApi.getStatus(),
    enabled: ENABLE_AI,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
}
