/**
 * useFeatureFlag - Fetch dynamic feature flags from the backend.
 *
 * Checks /api/core/features/check/?name=... and caches the result.
 * Returns false for unknown flags (safe default).
 *
 * @module hooks/use-feature-flags
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import { FeatureFlagSchema } from '@/lib/schemas/core.schema';

// Query key factory
export const featureFlagKeys = {
  all: ['featureFlags'] as const,
  flag: (name: string) => [...featureFlagKeys.all, name] as const,
};

/**
 * Check whether a backend feature flag is enabled.
 *
 * Caches the result for 5 minutes. Returns false while loading or on error.
 *
 * @param name - Feature flag name (e.g., "smart_autopopulate")
 * @returns Whether the flag is enabled
 */
export function useFeatureFlag(name: string): boolean {
  const { data } = useQuery({
    queryKey: featureFlagKeys.flag(name),
    queryFn: async () => {
      const response = await apiClient.get('/api/core/features/check/', {
        params: { name },
      });
      return parseResponse(FeatureFlagSchema, response.data, {
        context: `useFeatureFlag(${name})`,
      });
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  return data?.is_enabled ?? false;
}
