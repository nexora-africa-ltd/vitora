/**
 * useProactiveInsights — Hook for automated proactive clinical insights.
 *
 * Watches encounter context changes (via AIChatContext), debounces triggers,
 * deduplicates via context hashing, and returns actionable insight cards.
 *
 * Three tiers:
 * - Tier 1: Rule-based vital alerts (critical, instant)
 * - Tier 2: Pattern-based nudges (screening, drug interactions)
 * - Tier 3: LLM-powered insights (contextual, conditional)
 *
 * Rate-limited: triggers at most once per 5 seconds after context changes.
 * Deduplication: skips API call if context hasn't meaningfully changed.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { aiApi } from '@/lib/api/ai';
import { ENABLE_AI } from '@/lib/utils/constants';
import type {
  AIPatientContext,
  AIEncounterContext,
  ProactiveInsight,
  ProactiveInsightsRequest,
  ProactiveInsightsResponse,
  ProactiveInsightTierCounts,
} from '@/lib/types/ai';

// =============================================================================
// Configuration
// =============================================================================

/** Debounce delay in ms after last context change before triggering insights */
const DEBOUNCE_MS = 5000;

/** Minimum interval between API calls in ms (rate limit guard) */
const MIN_INTERVAL_MS = 30000;

// =============================================================================
// Hook
// =============================================================================

export interface UseProactiveInsightsOptions {
  /** Whether to enable proactive insights (default: true when AI enabled) */
  enabled?: boolean;
  /** Whether to include LLM tier 3 insights (default: true) */
  includeLLM?: boolean;
  /** Stable key for sessionStorage caching (e.g. encounter ID). Persists across hard refreshes. */
  cacheKey?: string | number;
}

export interface UseProactiveInsightsReturn {
  /** Current list of proactive insights */
  insights: ProactiveInsight[];
  /** Whether insights are currently being generated */
  isLoading: boolean;
  /** Tier breakdown counts */
  tierCounts: ProactiveInsightTierCounts | null;
  /** Total number of active insights */
  total: number;
  /** Dismiss a specific insight by ID */
  dismissInsight: (id: string) => void;
  /** Dismiss all insights */
  dismissAll: () => void;
  /** Manually trigger insight generation (bypasses debounce) */
  refresh: () => void;
  /** Last error, if any */
  error: string | null;
  /** True when generation completed but no insights were found */
  noInsightsFound: boolean;
}

// =============================================================================
// SessionStorage cache helpers
// =============================================================================

const CACHE_PREFIX = 'vitora_proactive_insights_';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedInsights {
  insights: ProactiveInsight[];
  tierCounts: ProactiveInsightTierCounts;
  contextHash: string;
  timestamp: number;
}

function getCachedInsights(cacheKey: string | number | undefined): CachedInsights | null {
  if (!cacheKey) return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const cached: CachedInsights = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function setCachedInsights(
  cacheKey: string | number | undefined,
  insights: ProactiveInsight[],
  tierCounts: ProactiveInsightTierCounts,
  contextHash: string,
): void {
  if (!cacheKey) return;
  try {
    const entry: CachedInsights = { insights, tierCounts, contextHash, timestamp: Date.now() };
    sessionStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry));
  } catch {
    // Quota exceeded — ignore
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useProactiveInsights(
  patientContext: AIPatientContext | null,
  encounterContext: AIEncounterContext | null,
  options: UseProactiveInsightsOptions = {},
): UseProactiveInsightsReturn {
  const { enabled = true, includeLLM = true, cacheKey } = options;

  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [tierCounts, setTierCounts] = useState<ProactiveInsightTierCounts | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [noInsightsFound, setNoInsightsFound] = useState(false);

  // Refs for debouncing and rate limiting
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallRef = useRef<number>(0);
  const contextHashRef = useRef<string>('');
  const userInitiatedRef = useRef(false);
  const cacheRehydratedRef = useRef(false);

  // Rehydrate from sessionStorage on mount
  useEffect(() => {
    if (cacheRehydratedRef.current) return;
    cacheRehydratedRef.current = true;
    const cached = getCachedInsights(cacheKey);
    if (cached && cached.insights.length > 0) {
      setInsights(cached.insights);
      setTierCounts(cached.tierCounts);
      contextHashRef.current = cached.contextHash;
      // Mark last call time so debounced auto-trigger doesn't immediately fire
      lastCallRef.current = cached.timestamp;
    }
  }, [cacheKey]);

  // Mutation for the API call
  const mutation = useMutation({
    mutationFn: (data: ProactiveInsightsRequest) => aiApi.getProactiveInsights(data),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (response: ProactiveInsightsResponse) => {
      // Update context hash for deduplication
      contextHashRef.current = response.context_hash;

      if (response.total > 0) {
        setInsights(response.insights);
        setTierCounts(response.tier_counts);
        setNoInsightsFound(false);
        // Persist to sessionStorage
        setCachedInsights(cacheKey, response.insights, response.tier_counts, response.context_hash);
      } else if (userInitiatedRef.current) {
        // User explicitly clicked Generate but no insights found
        setInsights([]);
        setTierCounts(response.tier_counts);
        setNoInsightsFound(true);
      }
      // If total is 0 from automatic dedup, keep existing insights
      setError(null);
      userInitiatedRef.current = false;
    },
    onError: (err: Error) => {
      // Don't clear existing insights on error — graceful degradation
      if (err instanceof AxiosError && err.response?.status === 429) {
        // Parse "Expected available in X seconds." from DRF throttle response
        const detail = (err.response?.data as any)?.detail || '';
        const match = detail.match(/(\d+)\s*seconds?/);
        const seconds = match ? parseInt(match[1]) : 30;
        setError(`Insight generation is rate-limited. Try again in ${seconds}s.`);
      } else if (err instanceof AxiosError && err.response?.status === 503) {
        setError('TibaBot AI service is temporarily unavailable. Rule-based insights still active.');
      } else {
        setError(err.message || 'Failed to generate insights');
      }
    },
  });

  // Build the request payload from context
  const buildRequest = useCallback((): ProactiveInsightsRequest | null => {
    if (!patientContext && !encounterContext) return null;

    // Build vitals from encounter context
    const vitals = encounterContext?.vitals
      ? {
          spo2: encounterContext.vitals.spo2,
          pulse: encounterContext.vitals.pulse,
          temperature: encounterContext.vitals.temperature,
          respiratory_rate: encounterContext.vitals.rr,
          systolic_bp: encounterContext.vitals.systolic_bp,
          diastolic_bp: encounterContext.vitals.diastolic_bp,
        }
      : undefined;

    return {
      patient_context: {
        patient_age: patientContext?.patient_age,
        patient_sex: patientContext?.patient_sex,
        allergies: patientContext?.allergies,
        comorbidities: patientContext?.comorbidities,
        current_medications: patientContext?.current_medications,
      },
      encounter_context: {
        chief_complaint: encounterContext?.chief_complaint,
        vitals,
        diagnoses: encounterContext?.diagnoses,
        clinical_notes: encounterContext?.clinical_notes,
      },
      context_hash: contextHashRef.current || undefined,
      include_llm: includeLLM,
    };
  }, [patientContext, encounterContext, includeLLM]);

  // Trigger insight generation
  const triggerInsights = useCallback((bypassRateLimit = false) => {
    if (!ENABLE_AI || !enabled) return;

    const now = Date.now();
    const elapsed = now - lastCallRef.current;

    // Rate limit guard (skipped for manual refresh)
    if (!bypassRateLimit && elapsed < MIN_INTERVAL_MS && lastCallRef.current > 0) {
      return;
    }

    const request = buildRequest();
    if (!request) return;

    lastCallRef.current = now;
    mutation.mutate(request);
  }, [enabled, buildRequest, mutation]);

  // Debounced trigger on context changes
  useEffect(() => {
    if (!ENABLE_AI || !enabled) return;
    if (!patientContext && !encounterContext) return;

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      triggerInsights();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [patientContext, encounterContext, enabled, triggerInsights]);

  // Dismiss handlers
  const dismissInsight = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const dismissAll = useCallback(() => {
    setDismissedIds((prev) => new Set([...prev, ...insights.map((i) => i.id)]));
  }, [insights]);

  // Manual refresh (bypasses debounce and clears dismissed state)
  const refresh = useCallback(() => {
    contextHashRef.current = ''; // Clear hash to force regeneration
    setDismissedIds(new Set()); // Reset dismissed so results show again
    setNoInsightsFound(false); // Clear empty state
    userInitiatedRef.current = true; // Track that this was user-initiated
    triggerInsights(true); // Bypass rate limit for user-initiated action
  }, [triggerInsights]);

  // Filter out dismissed insights
  const visibleInsights = insights.filter((i) => !dismissedIds.has(i.id));

  return {
    insights: visibleInsights,
    isLoading: mutation.isPending,
    tierCounts,
    total: visibleInsights.length,
    dismissInsight,
    dismissAll,
    refresh,
    error,
    noInsightsFound,
  };
}
