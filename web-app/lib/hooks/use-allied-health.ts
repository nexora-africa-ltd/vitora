/**
 * Allied Health Dashboard Hooks
 * Sprint Allied Health - Dashboard data fetching
 */

import { useQuery } from '@tanstack/react-query';
import { alliedHealthApi } from '@/lib/api/allied-health';

// Query key factory
export const alliedHealthKeys = {
  all: ['allied-health'] as const,
  dashboard: () => [...alliedHealthKeys.all, 'dashboard'] as const,
  todaysSessions: () => [...alliedHealthKeys.all, 'todays-sessions'] as const,
};

/**
 * Hook for fetching Allied Health dashboard statistics
 */
export function useAlliedHealthDashboard() {
  return useQuery({
    queryKey: alliedHealthKeys.dashboard(),
    queryFn: () => alliedHealthApi.getDashboardStats(),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Hook for fetching today's sessions across all modules
 */
export function useTodaysSessions() {
  return useQuery({
    queryKey: alliedHealthKeys.todaysSessions(),
    queryFn: () => alliedHealthApi.getTodaysSessions(),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
