/**
 * React Query hook for Dashboard Statistics.
 *
 * Fetches real-time statistics from /api/core/dashboard/stats/
 * with caching aligned to backend TTL (5 minutes).
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { DashboardStats } from '@/lib/types/dashboard-stats';

// Query key for React Query cache management
export const DASHBOARD_STATS_QUERY_KEY = ['dashboard', 'stats'] as const;

// Cache times (aligned with backend TTL)
const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const REFETCH_INTERVAL = 5 * 60 * 1000; // Auto-refresh every 5 minutes

interface UseDashboardStatsOptions {
  /** Bypass cache and fetch fresh data */
  refresh?: boolean;
  /** Enable/disable the query */
  enabled?: boolean;
}

// Default stats to show while loading or on error
const DEFAULT_STATS: DashboardStats = {
  timestamp: new Date().toISOString(),
  cache_ttl: 300,
  patients: { total: 0, today: 0, this_week: 0, this_month: 0 },
  encounters: { total: 0, today: 0, in_progress: 0, completed_today: 0 },
  pharmacy: { prescriptions_today: 0, pending_dispensing: 0, low_stock_items: 0, expiring_soon: 0 },
  laboratory: { pending_tests: 0, completed_today: 0, critical_results: 0 },
  triage: { waiting: 0, avg_wait_time_minutes: 0, emergency_count: 0 },
  billing: { revenue_today: 0, pending_payments: 0, sha_claims_pending: 0 },
  alerts: { critical: 0, high: 0, medium: 0, total_unresolved: 0 },
};

/**
 * Fetch dashboard statistics from the API.
 */
async function fetchDashboardStats(refresh = false): Promise<DashboardStats> {
  const params = refresh ? { refresh: 'true' } : {};
  const response = await apiClient.get<DashboardStats>('/api/core/dashboard/stats/', {
    params,
  });
  return response.data;
}

/**
 * Hook to fetch dashboard statistics.
 *
 * @example
 * ```tsx
 * const { data: stats, isLoading } = useDashboardStats();
 *
 * // Display stats
 * <div>Total Patients: {stats?.patients.total}</div>
 * <div>Today's Encounters: {stats?.encounters.today}</div>
 * ```
 */
export function useDashboardStats(options: UseDashboardStatsOptions = {}) {
  const { refresh = false, enabled = true } = options;

  return useQuery<DashboardStats>({
    queryKey: [...DASHBOARD_STATS_QUERY_KEY, { refresh }],
    queryFn: () => fetchDashboardStats(refresh),
    staleTime: STALE_TIME,
    refetchInterval: REFETCH_INTERVAL,
    enabled,
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    placeholderData: DEFAULT_STATS, // Show zeros while loading
  });
}

/**
 * Helper to format currency for display.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Helper to format large numbers with commas.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-KE').format(value);
}
