/**
 * Shared Vital Thresholds Hook
 *
 * Provides unified vital sign threshold logic for both triage and encounter modules.
 * Fetches thresholds from backend and falls back to clinical defaults.
 *
 * Now imports shared types and utilities from @/lib/vitals module.
 *
 * Usage:
 * - Triage module: Real-time alerts during triage assessment
 * - Encounter module: Display warnings on vitals in encounter edit
 */
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { TriageVitalThreshold } from '@/lib/types/triage';

// Import shared vitals module
import {
  DEFAULT_THRESHOLDS,
  evaluateVitals,
  getFieldStatus as getFieldStatusUtil,
  getAgeGroup,
  getVitalRangeHint,
  getVitalPlaceholder,
  type AgeGroup,
  type VitalType,
  type VitalAlert,
  type VitalValues,
  type FieldStatus,
} from '@/lib/vitals';

// Re-export everything from vitals module for backward compatibility
export {
  DEFAULT_THRESHOLDS,
  evaluateVitals,
  getFieldStatus,
  calculateMAP,
  type VitalType,
  type VitalAlert,
  type VitalValues,
  type FieldStatus,
} from '@/lib/vitals';

// =============================================================================
// REACT QUERY HOOK
// =============================================================================

interface UseVitalThresholdsOptions {
  /** Whether to fetch from backend (default: true) */
  enabled?: boolean;
  /** Stale time in ms (default: 5 minutes) */
  staleTime?: number;
  /** Patient date of birth — enables age-adjusted thresholds for paediatric patients */
  patientDob?: string | null;
}

/**
 * Hook to fetch vital thresholds from backend with fallback to defaults
 *
 * @example
 * ```tsx
 * const { thresholds, getAlerts, getFieldStatus, isLoading } = useVitalThresholds();
 *
 * // Get alerts for current vital values
 * const alerts = getAlerts(formData);
 *
 * // Get status for styling an input
 * const tempStatus = getFieldStatus('temperature', alerts);
 * ```
 */
export function useVitalThresholds(options: UseVitalThresholdsOptions = {}) {
  const { enabled = true, staleTime = 5 * 60 * 1000, patientDob } = options;

  // Compute age group from DOB (null for adults/unknown)
  const ageGroup: AgeGroup | null = React.useMemo(
    () => (patientDob ? getAgeGroup(patientDob) : null),
    [patientDob]
  );

  const query = useQuery({
    queryKey: ['vital-thresholds'],
    queryFn: async () => {
      const response = await apiClient.get<TriageVitalThreshold[] | { results: TriageVitalThreshold[] }>('/api/triage/vital-thresholds/');
      // Handle both array and paginated response formats
      const data = response.data;
      if (Array.isArray(data)) {
        return data;
      }
      // Paginated response
      if (data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)) {
        return data.results;
      }
      // Fallback to empty array
      return [];
    },
    enabled,
    staleTime,
    // Don't throw on error, we'll fall back to defaults
    retry: 1,
  });

  // Convert array response to record, falling back to defaults
  const thresholds: Record<VitalType, TriageVitalThreshold> = React.useMemo(() => {
    const result = { ...DEFAULT_THRESHOLDS } as Record<VitalType, TriageVitalThreshold>;

    // Safely handle the response data
    const dataArray = query.data;
    if (dataArray && Array.isArray(dataArray)) {
      for (const threshold of dataArray) {
        if (threshold && threshold.is_active && threshold.vital_type) {
          result[threshold.vital_type] = threshold;
        }
      }
    }

    return result;
  }, [query.data]);

  // Helper to get alerts for vital values (age-aware)
  const getAlerts = React.useCallback(
    (values: VitalValues): VitalAlert[] => evaluateVitals(values, thresholds, ageGroup),
    [thresholds, ageGroup]
  );

  // Helper to get field status
  const getStatus = React.useCallback(
    (field: string, alerts: VitalAlert[]): FieldStatus => getFieldStatusUtil(field, alerts),
    []
  );

  // Helper to get age-specific range hint for a vital
  const getRangeHint = React.useCallback(
    (vitalKey: string): string => getVitalRangeHint(vitalKey, ageGroup),
    [ageGroup]
  );

  // Helper to get age-appropriate placeholder for a vital input
  const getPlaceholder = React.useCallback(
    (vitalKey: string): string => getVitalPlaceholder(vitalKey, ageGroup),
    [ageGroup]
  );

  return {
    /** Threshold records by vital type */
    thresholds,
    /** Computed age group (null for adults) */
    ageGroup,
    /** Get alerts for vital values */
    getAlerts,
    /** Get field status for styling */
    getFieldStatus: getStatus,
    /** Get age-specific normal range hint string */
    getRangeHint,
    /** Get age-appropriate placeholder value for a vital input */
    getPlaceholder,
    /** Whether thresholds are loading from backend */
    isLoading: query.isLoading,
    /** Whether backend fetch failed (using defaults) */
    isUsingDefaults: query.isError || !query.data,
    /** Raw query for advanced usage */
    query,
  };
}

export default useVitalThresholds;
