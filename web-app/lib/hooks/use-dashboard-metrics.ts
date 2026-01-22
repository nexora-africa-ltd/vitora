/**
 * React hooks for dashboard metrics and reporting data.
 *
 * Uses real API endpoints for all dashboard data:
 * - /api/core/dashboard/stats/ - KPIs and real-time statistics
 * - /api/core/dashboard/patient-volume/ - Historical patient/encounter data
 * - /api/core/dashboard/revenue-breakdown/ - Revenue by category
 * - /api/core/dashboard/activity-feed/ - Recent activity feed
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  DashboardMetrics,
  DateRangeFilter,
  KPIMetric,
  PatientVolumeData,
  RevenueData,
  RecentActivity,
  PatientVolumeResponse,
  RevenueBreakdownResponse,
  ActivityFeedResponse,
} from '@/lib/types/dashboard';
import type { DashboardStats } from '@/lib/types/dashboard-stats';
import { subDays, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

// Helper to get date range based on preset
function getDateRange(filter?: DateRangeFilter): { start: string; end: string } {
  const today = new Date();
  const formatStr = 'yyyy-MM-dd';

  if (!filter || filter.preset === 'last7days') {
    return {
      start: format(subDays(today, 7), formatStr),
      end: format(today, formatStr),
    };
  }

  switch (filter.preset) {
    case 'today':
      return {
        start: format(today, formatStr),
        end: format(today, formatStr),
      };
    case 'yesterday': {
      const yesterday = subDays(today, 1);
      return {
        start: format(yesterday, formatStr),
        end: format(yesterday, formatStr),
      };
    }
    case 'last30days':
      return {
        start: format(subDays(today, 30), formatStr),
        end: format(today, formatStr),
      };
    case 'thisMonth':
      return {
        start: format(startOfMonth(today), formatStr),
        end: format(today, formatStr),
      };
    case 'lastMonth': {
      const lastMonth = subMonths(today, 1);
      return {
        start: format(startOfMonth(lastMonth), formatStr),
        end: format(endOfMonth(lastMonth), formatStr),
      };
    }
    case 'custom':
      return {
        start: filter.start,
        end: filter.end,
      };
    default:
      return {
        start: format(subDays(today, 7), formatStr),
        end: format(today, formatStr),
      };
  }
}

// Format currency for display
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Build KPIs from dashboard stats
function buildKPIsFromStats(stats: DashboardStats | null): KPIMetric[] {
  return [
    {
      id: 'patients',
      title: 'Total Patients',
      value: stats?.patients.total ?? 0,
      change: stats?.patients.today ?? 0,
      changeType: 'increase',
      trend: 'up',
      href: '/patients',
      description: `+${stats?.patients.today ?? 0} today`,
    },
    {
      id: 'encounters-today',
      title: 'Encounters Today',
      value: stats?.encounters.today ?? 0,
      change: stats?.encounters.in_progress ?? 0,
      changeType: 'increase',
      trend: 'up',
      href: '/encounters',
      description: `${stats?.encounters.in_progress ?? 0} in progress`,
    },
    {
      id: 'avg-wait-time',
      title: 'Avg Wait Time',
      value: String(stats?.triage.avg_wait_time_minutes ?? 0),
      unit: 'min',
      change: 0,
      changeType: 'decrease',
      trend: 'down',
      variant: 'success',
      description: `${stats?.triage.waiting ?? 0} waiting`,
    },
    {
      id: 'lab-pending',
      title: 'Pending Lab Tests',
      value: stats?.laboratory.pending_tests ?? 0,
      change: stats?.laboratory.critical_results ?? 0,
      changeType: 'increase',
      trend: (stats?.laboratory.critical_results ?? 0) > 0 ? 'up' : 'stable',
      variant: (stats?.laboratory.critical_results ?? 0) > 0 ? 'warning' : 'default',
      href: '/laboratory',
      description: `${stats?.laboratory.critical_results ?? 0} critical`,
    },
    {
      id: 'pharmacy-stock',
      title: 'Low Stock Items',
      value: stats?.pharmacy.low_stock_items ?? 0,
      variant: (stats?.pharmacy.low_stock_items ?? 0) > 5 ? 'warning' : 'default',
      href: '/pharmacy',
      description: `${stats?.pharmacy.expiring_soon ?? 0} expiring soon`,
    },
    {
      id: 'revenue-today',
      title: 'Revenue Today',
      value: formatCurrency(stats?.billing.revenue_today ?? 0),
      change: 0,
      changeType: 'increase',
      trend: 'up',
      variant: 'success',
      description: `${formatCurrency(stats?.billing.pending_payments ?? 0)} pending`,
    },
  ];
}

// Transform patient volume response to frontend format
function transformPatientVolume(response: PatientVolumeResponse): PatientVolumeData[] {
  return response.data.map((item) => {
    // Backend returns by_type as nested object with uppercase keys
    const byType = (item as unknown as { by_type?: Record<string, number> }).by_type || {};
    
    return {
      date: item.date,
      registrations: item.registrations,
      encounters: item.encounters,
      // Extract from by_type (uppercase) or fallback to direct fields (lowercase)
      opd: byType.OPD ?? item.opd ?? 0,
      ipd: byType.IPD ?? item.ipd ?? 0,
      emergency: byType.EMERGENCY ?? item.emergency ?? 0,
      anc: byType.ANC ?? item.anc,
      paediatric: byType.PAEDIATRIC ?? item.paediatric,
      dialysis: byType.DIALYSIS ?? item.dialysis,
      oncology: byType.ONCOLOGY ?? item.oncology,
      scheduled_opd: byType.SCHEDULED_OPD ?? item.scheduled_opd,
      follow_up: byType.FOLLOW_UP ?? item.follow_up,
      consultant_review: byType.CONSULTANT_REVIEW ?? item.consultant_review,
      chronic_stable: byType.CHRONIC_STABLE ?? item.chronic_stable,
      specialist_clinic: byType.SPECIALIST_CLINIC ?? item.specialist_clinic,
      procedure: byType.PROCEDURE ?? item.procedure,
      day_case: byType.DAY_CASE ?? item.day_case,
      ward_round: byType.WARD_ROUND ?? item.ward_round,
      discharge_review: byType.DISCHARGE_REVIEW ?? item.discharge_review,
    };
  });
}

// Transform revenue breakdown response to frontend format
function transformRevenueBreakdown(response: RevenueBreakdownResponse): RevenueData[] {
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  return response.breakdown.map((item, index) => ({
    department: item.name,
    amount: item.amount,
    percentage: item.percentage,
    transaction_count: item.transaction_count,
    color: colors[index % colors.length],
  }));
}

// Fetch dashboard metrics using real API endpoints
async function fetchDashboardMetrics(filter?: DateRangeFilter): Promise<DashboardMetrics> {
  const dateRange = getDateRange(filter);

  // Fetch all data in parallel for performance
  const [statsRes, volumeRes, revenueRes, activityRes] = await Promise.allSettled([
    apiClient.get<DashboardStats>('/api/core/dashboard/stats/'),
    apiClient.get<PatientVolumeResponse>('/api/core/dashboard/patient-volume/', {
      params: { start_date: dateRange.start, end_date: dateRange.end },
    }),
    apiClient.get<RevenueBreakdownResponse>('/api/core/dashboard/revenue-breakdown/', {
      params: { start_date: dateRange.start, end_date: dateRange.end },
    }),
    apiClient.get<ActivityFeedResponse>('/api/core/dashboard/activity-feed/', {
      params: { limit: 10 },
    }),
  ]);

  // Extract data with fallbacks for failed requests
  const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : null;
  const patientVolume = volumeRes.status === 'fulfilled'
    ? transformPatientVolume(volumeRes.value.data)
    : [];
  const revenueBreakdown = revenueRes.status === 'fulfilled'
    ? transformRevenueBreakdown(revenueRes.value.data)
    : [];
  const recentActivity = activityRes.status === 'fulfilled'
    ? activityRes.value.data.results
    : [];

  // Log any failures for debugging
  if (statsRes.status === 'rejected') {
    console.warn('Failed to fetch dashboard stats:', statsRes.reason);
  }
  if (volumeRes.status === 'rejected') {
    console.warn('Failed to fetch patient volume:', volumeRes.reason);
  }
  if (revenueRes.status === 'rejected') {
    console.warn('Failed to fetch revenue breakdown:', revenueRes.reason);
  }
  if (activityRes.status === 'rejected') {
    console.warn('Failed to fetch activity feed:', activityRes.reason);
  }

  return {
    kpis: buildKPIsFromStats(stats),
    patientVolume,
    revenueBreakdown,
    departmentStats: [],
    recentActivity,
    dateRange,
  };
}

/**
 * Hook for fetching dashboard metrics.
 */
export function useDashboardMetrics(filter?: DateRangeFilter) {
  return useQuery({
    queryKey: ['dashboard-metrics', filter],
    queryFn: () => fetchDashboardMetrics(filter),
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // 5 minutes
  });
}

/**
 * Hook for fetching KPIs only (uses stats endpoint directly).
 */
export function useDashboardKPIs(filter?: DateRangeFilter) {
  return useQuery({
    queryKey: ['dashboard-kpis', filter],
    queryFn: async () => {
      const response = await apiClient.get<DashboardStats>('/api/core/dashboard/stats/');
      return buildKPIsFromStats(response.data);
    },
    staleTime: 60000,
    refetchInterval: 300000,
  });
}

/**
 * Hook for fetching patient volume chart data (uses patient-volume endpoint directly).
 */
export function usePatientVolumeChart(filter?: DateRangeFilter) {
  const dateRange = getDateRange(filter);

  return useQuery({
    queryKey: ['patient-volume-chart', dateRange],
    queryFn: async () => {
      const response = await apiClient.get<PatientVolumeResponse>(
        '/api/core/dashboard/patient-volume/',
        { params: { start_date: dateRange.start, end_date: dateRange.end } }
      );
      return transformPatientVolume(response.data);
    },
    staleTime: 300000, // 5 minutes (historical data changes slowly)
  });
}

/**
 * Hook for fetching revenue breakdown (uses revenue-breakdown endpoint directly).
 */
export function useRevenueBreakdown(filter?: DateRangeFilter) {
  const dateRange = getDateRange(filter);

  return useQuery({
    queryKey: ['revenue-breakdown', dateRange],
    queryFn: async () => {
      const response = await apiClient.get<RevenueBreakdownResponse>(
        '/api/core/dashboard/revenue-breakdown/',
        { params: { start_date: dateRange.start, end_date: dateRange.end } }
      );
      return transformRevenueBreakdown(response.data);
    },
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Hook for fetching recent activity feed (uses activity-feed endpoint directly).
 */
export function useRecentActivity(limit = 10) {
  return useQuery({
    queryKey: ['recent-activity', limit],
    queryFn: async () => {
      const response = await apiClient.get<ActivityFeedResponse>(
        '/api/core/dashboard/activity-feed/',
        { params: { limit } }
      );
      return response.data.results;
    },
    staleTime: 30000, // 30 seconds (activity changes frequently)
    refetchInterval: 60000, // 1 minute
  });
}

/**
 * Hook for fetching paginated activity feed with filtering.
 */
export function useActivityFeed(options?: {
  limit?: number;
  offset?: number;
  types?: string[];
}) {
  const { limit = 20, offset = 0, types } = options ?? {};

  return useQuery({
    queryKey: ['activity-feed', { limit, offset, types }],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit, offset };
      if (types && types.length > 0) {
        params.types = types.join(',');
      }
      const response = await apiClient.get<ActivityFeedResponse>(
        '/api/core/dashboard/activity-feed/',
        { params }
      );
      return response.data;
    },
    staleTime: 30000,
  });
}
