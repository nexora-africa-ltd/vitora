/**
 * React Query hooks for Analytics & BI.
 *
 * Fetches from /api/analytics/ endpoints with appropriate caching.
 */

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api/analytics';
import type {
  FacilitySummaryParams,
  DepartmentPerformanceParams,
  DiagnosisTrendParams,
} from '@/lib/types/analytics';

// Query keys
export const ANALYTICS_KEYS = {
  facilitySummary: (params?: FacilitySummaryParams) =>
    ['analytics', 'facility-summary', params] as const,
  departmentPerformance: (params?: DepartmentPerformanceParams) =>
    ['analytics', 'department-performance', params] as const,
  diagnosisTrends: (params?: DiagnosisTrendParams) =>
    ['analytics', 'diagnosis-trends', params] as const,
  demographics: () => ['analytics', 'demographics'] as const,
};

// Analytics data is ETL'd nightly — 15 min stale time is fine
const STALE_TIME = 15 * 60 * 1000;

/**
 * Fetch facility daily summaries (date-range filterable).
 */
export function useFacilitySummary(params?: FacilitySummaryParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.facilitySummary(params),
    queryFn: () => analyticsApi.getFacilitySummary(params),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetch department monthly performance (year/month/department filterable).
 */
export function useDepartmentPerformance(params?: DepartmentPerformanceParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.departmentPerformance(params),
    queryFn: () => analyticsApi.getDepartmentPerformance(params),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetch diagnosis trends.
 */
export function useDiagnosisTrends(params?: DiagnosisTrendParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.diagnosisTrends(params),
    queryFn: () => analyticsApi.getDiagnosisTrends(params),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetch patient demographic snapshots.
 */
export function useDemographics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.demographics(),
    queryFn: () => analyticsApi.getDemographics(),
    staleTime: STALE_TIME,
  });
}
