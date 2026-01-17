/**
 * React hooks for dashboard metrics and reporting data.
 *
 * Uses the /api/core/dashboard/stats/ endpoint for real-time statistics.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { 
  DashboardMetrics, 
  DateRangeFilter, 
  KPIMetric,
  PatientVolumeData,
  RevenueData,
  RecentActivity 
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
    case 'yesterday':
      const yesterday = subDays(today, 1);
      return {
        start: format(yesterday, formatStr),
        end: format(yesterday, formatStr),
      };
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
    case 'lastMonth':
      const lastMonth = subMonths(today, 1);
      return {
        start: format(startOfMonth(lastMonth), formatStr),
        end: format(endOfMonth(lastMonth), formatStr),
      };
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

// Fetch dashboard metrics using the real stats API
async function fetchDashboardMetrics(filter?: DateRangeFilter): Promise<DashboardMetrics> {
  const dateRange = getDateRange(filter);
  
  // Fetch real statistics from the dashboard stats API
  let stats: DashboardStats | null = null;
  
  try {
    const response = await apiClient.get<DashboardStats>('/api/core/dashboard/stats/');
    stats = response.data;
  } catch {
    // Fallback to empty stats if API fails
    console.warn('Failed to fetch dashboard stats, using fallback values');
  }

  // Build KPIs from real API data
  const kpis: KPIMetric[] = [
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

  // Patient volume over time (still mock data - needs historical API)
  // TODO: Replace with /api/dashboard/history/ endpoint when implemented
  const patientVolume: PatientVolumeData[] = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const baseEncounters = Math.floor((stats?.encounters.today ?? 30) * (0.8 + Math.random() * 0.4));
    return {
      date: format(date, 'yyyy-MM-dd'),
      registrations: Math.floor((stats?.patients.today ?? 5) * (0.5 + Math.random())),
      encounters: baseEncounters,
      opd: Math.floor(baseEncounters * 0.7),
      ipd: Math.floor(baseEncounters * 0.2),
      emergency: Math.floor(baseEncounters * 0.1),
    };
  });

  // Revenue breakdown by department (still mock ratios - needs billing breakdown API)
  const totalRevenue = stats?.billing.revenue_today ?? 145200;
  const revenueBreakdown: RevenueData[] = [
    { department: 'Consultation', amount: Math.floor(totalRevenue * 0.31), percentage: 31, color: '#0088FE' },
    { department: 'Laboratory', amount: Math.floor(totalRevenue * 0.24), percentage: 24, color: '#00C49F' },
    { department: 'Pharmacy', amount: Math.floor(totalRevenue * 0.29), percentage: 29, color: '#FFBB28' },
    { department: 'Procedures', amount: Math.floor(totalRevenue * 0.16), percentage: 16, color: '#FF8042' },
  ];

  // Recent activity (mock data - needs activity feed API)
  const recentActivity: RecentActivity[] = [
    {
      id: '1',
      type: 'patient',
      title: 'New patient registered',
      description: `${stats?.patients.today ?? 0} patients today`,
      timestamp: new Date().toISOString(),
      user: 'Reception',
      href: '/patients',
    },
    {
      id: '2',
      type: 'encounter',
      title: 'OPD visits today',
      description: `${stats?.encounters.today ?? 0} encounters`,
      timestamp: subDays(new Date(), 0.1).toISOString(),
      href: '/encounters',
    },
    {
      id: '3',
      type: 'lab',
      title: 'Lab tests pending',
      description: `${stats?.laboratory.pending_tests ?? 0} awaiting results`,
      timestamp: subDays(new Date(), 0.2).toISOString(),
      href: '/laboratory',
    },
    {
      id: '4',
      type: 'pharmacy',
      title: 'Prescriptions today',
      description: `${stats?.pharmacy.prescriptions_today ?? 0} dispensed`,
      timestamp: subDays(new Date(), 0.3).toISOString(),
      href: '/pharmacy',
    },
    {
      id: '5',
      type: 'billing',
      title: 'Revenue collected',
      description: formatCurrency(stats?.billing.revenue_today ?? 0),
      timestamp: subDays(new Date(), 0.4).toISOString(),
    },
  ];

  return {
    kpis,
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
 * Hook for fetching KPIs only.
 */
export function useDashboardKPIs(filter?: DateRangeFilter) {
  return useQuery({
    queryKey: ['dashboard-kpis', filter],
    queryFn: async () => {
      const metrics = await fetchDashboardMetrics(filter);
      return metrics.kpis;
    },
    staleTime: 60000,
  });
}

/**
 * Hook for fetching patient volume chart data.
 */
export function usePatientVolumeChart(filter?: DateRangeFilter) {
  return useQuery({
    queryKey: ['patient-volume-chart', filter],
    queryFn: async () => {
      const metrics = await fetchDashboardMetrics(filter);
      return metrics.patientVolume;
    },
    staleTime: 60000,
  });
}

/**
 * Hook for fetching revenue breakdown.
 */
export function useRevenueBreakdown(filter?: DateRangeFilter) {
  return useQuery({
    queryKey: ['revenue-breakdown', filter],
    queryFn: async () => {
      const metrics = await fetchDashboardMetrics(filter);
      return metrics.revenueBreakdown;
    },
    staleTime: 60000,
  });
}

/**
 * Hook for fetching recent activity feed.
 */
export function useRecentActivity(limit = 10) {
  return useQuery({
    queryKey: ['recent-activity', limit],
    queryFn: async () => {
      const metrics = await fetchDashboardMetrics();
      return metrics.recentActivity.slice(0, limit);
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });
}
