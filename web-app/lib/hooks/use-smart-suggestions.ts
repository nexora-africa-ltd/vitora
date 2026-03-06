/**
 * useSmartSuggestions - Hook for managing AI/CDS smart field suggestions.
 *
 * Combines CDS alert suggested_actions and AI autopopulate suggestions
 * into a unified interface for encounter form components.
 *
 * Feature-gated: returns empty suggestions when smart_autopopulate is off.
 *
 * @module hooks/use-smart-suggestions
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '@/lib/api/ai';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { useAIEnabled } from '@/lib/hooks/use-ai';
import type { CDSSuggestedAction } from '@/lib/types/cds';
import type {
  AIAutopopulateRequest,
  AIAutopopulateResponse,
  AIAutopopulateSuggestedField,
} from '@/lib/types/ai';

// =============================================================================
// Types
// =============================================================================

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

/** A unified suggestion item combining CDS and AI sources. */
export interface SmartSuggestion {
  /** Unique ID for tracking acceptance/rejection */
  id: string;
  /** Target form field name */
  field_name: string;
  /** Suggested value */
  value: unknown;
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
  /** Reason/explanation for the suggestion */
  reason: string;
  /** Origin: "ai" | "cds" | "history" */
  source: string;
  /** Current status */
  status: SuggestionStatus;
}

export interface UseSmartSuggestionsOptions {
  /** CDS alerts' suggested_actions for the current encounter */
  cdsActions?: CDSSuggestedAction[];
}

export interface UseSmartSuggestionsReturn {
  /** All suggestions (pending, accepted, rejected) */
  suggestions: SmartSuggestion[];
  /** Only pending suggestions */
  pendingSuggestions: SmartSuggestion[];
  /** Suggestions for a specific field */
  getFieldSuggestions: (fieldName: string) => SmartSuggestion[];
  /** Accept a suggestion (returns the value to apply) */
  accept: (id: string) => unknown | undefined;
  /** Reject a suggestion */
  reject: (id: string) => void;
  /** Accept all pending suggestions */
  acceptAll: () => Array<{ field_name: string; value: unknown }>;
  /** Reject all pending suggestions */
  rejectAll: () => void;
  /** Fetch AI autopopulate suggestions */
  fetchSuggestions: (request: AIAutopopulateRequest) => void;
  /** Whether autopopulate is currently loading */
  isLoading: boolean;
  /** Whether the smart autopopulate feature is available */
  isAvailable: boolean;
  /** Error from the last autopopulate request */
  error: string | null;
}

// =============================================================================
// Hook
// =============================================================================

export function useSmartSuggestions(
  options: UseSmartSuggestionsOptions = {}
): UseSmartSuggestionsReturn {
  const { cdsActions = [] } = options;
  const aiEnabled = useAIEnabled();
  const flagEnabled = useFeatureFlag('smart_autopopulate');
  const isAvailable = aiEnabled && flagEnabled;

  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Merge CDS actions into suggestions on mount/change
  const cdsSuggestions = useMemo<SmartSuggestion[]>(() => {
    if (!isAvailable || cdsActions.length === 0) return [];
    return cdsActions.map((action, i) => ({
      id: `cds-${action.target_field}-${i}`,
      field_name: action.target_field,
      value: action.value,
      confidence: action.confidence,
      reason: action.reason,
      source: 'cds',
      status: 'pending' as SuggestionStatus,
    }));
  }, [cdsActions, isAvailable]);

  // AI autopopulate mutation
  const autopopulateMutation = useMutation<AIAutopopulateResponse, Error, AIAutopopulateRequest>({
    mutationFn: (data) => aiApi.autopopulate(data),
    retry: false,
    onSuccess: (data) => {
      setError(data.error || null);
      const aiSuggestions: SmartSuggestion[] = data.suggested_fields.map(
        (field: AIAutopopulateSuggestedField, i: number) => ({
          id: `ai-${field.field_name}-${i}`,
          field_name: field.field_name,
          value: field.value,
          confidence: field.confidence,
          reason: field.reason || '',
          source: field.source || 'ai',
          status: 'pending' as SuggestionStatus,
        })
      );
      setSuggestions((prev) => {
        // Remove old AI suggestions, keep CDS + accepted/rejected
        const nonAi = prev.filter((s) => s.source !== 'ai');
        return [...nonAi, ...aiSuggestions];
      });
    },
    onError: () => {
      setError('AI suggestions temporarily unavailable.');
    },
  });

  // Combine CDS and managed suggestions
  const allSuggestions = useMemo(() => {
    // Merge CDS suggestions that aren't already tracked
    const tracked = new Set(suggestions.map((s) => s.id));
    const newCds = cdsSuggestions.filter((s) => !tracked.has(s.id));
    if (newCds.length > 0) {
      return [...suggestions, ...newCds];
    }
    return suggestions;
  }, [suggestions, cdsSuggestions]);

  const pendingSuggestions = useMemo(
    () => allSuggestions.filter((s) => s.status === 'pending'),
    [allSuggestions]
  );

  const getFieldSuggestions = useCallback(
    (fieldName: string) =>
      allSuggestions.filter((s) => s.field_name === fieldName && s.status === 'pending'),
    [allSuggestions]
  );

  const accept = useCallback(
    (id: string) => {
      let value: unknown;
      setSuggestions((prev) =>
        prev.map((s) => {
          if (s.id === id) {
            value = s.value;
            return { ...s, status: 'accepted' as SuggestionStatus };
          }
          return s;
        })
      );
      return value;
    },
    []
  );

  const reject = useCallback((id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'rejected' as SuggestionStatus } : s))
    );
  }, []);

  const acceptAll = useCallback(() => {
    const results: Array<{ field_name: string; value: unknown }> = [];
    setSuggestions((prev) =>
      prev.map((s) => {
        if (s.status === 'pending') {
          results.push({ field_name: s.field_name, value: s.value });
          return { ...s, status: 'accepted' as SuggestionStatus };
        }
        return s;
      })
    );
    return results;
  }, []);

  const rejectAll = useCallback(() => {
    setSuggestions((prev) =>
      prev.map((s) => (s.status === 'pending' ? { ...s, status: 'rejected' as SuggestionStatus } : s))
    );
  }, []);

  const fetchSuggestions = useCallback(
    (request: AIAutopopulateRequest) => {
      if (!isAvailable) return;
      autopopulateMutation.mutate(request);
    },
    [isAvailable, autopopulateMutation]
  );

  return {
    suggestions: allSuggestions,
    pendingSuggestions,
    getFieldSuggestions,
    accept,
    reject,
    acceptAll,
    rejectAll,
    fetchSuggestions,
    isLoading: autopopulateMutation.isPending,
    isAvailable,
    error,
  };
}
