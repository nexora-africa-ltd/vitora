/**
 * React hooks for dashboard metrics and reporting data.
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

// Generate mock dashboard metrics
// In production, this would call /api/reports/dashboard/
async function fetchDashboardMetrics(filter?: DateRangeFilter): Promise<DashboardMetrics> {
  const dateRange = getDateRange(filter);
  
  // Fetch real counts from API
  let patientCount = 0;
  let encounterCount = 0;
  
  try {
    const [patientsRes, encountersRes] = await Promise.all([
      apiClient.get('/api/patients/', { params: { page_size: 1 } }),
      apiClient.get('/api/encounters/', { params: { page_size: 1 } }),
    ]);
    patientCount = patientsRes.data?.count || 0;
    encounterCount = encountersRes.data?.count || 0;
  } catch {
    // Use mock data if API fails
  }

  // KPIs with real data where available, mock data otherwise
  const kpis: KPIMetric[] = [
    {
      id: 'patients',
      title: 'Total Patients',
      value: patientCount || 1247,
      change: 12.5,
      changeType: 'increase',
      trend: 'up',
      href: '/patients',
      description: 'Total registered patients',
    },
    {
      id: 'encounters-today',
      title: 'Encounters Today',
      value: Math.floor(Math.random() * 30) + 20,
      change: 8.2,
      changeType: 'increase',
      trend: 'up',
      href: '/encounters',
    },
    {
      id: 'avg-wait-time',
      title: 'Avg Wait Time',
      value: '24',
      unit: 'min',
      change: -15.3,
      changeType: 'decrease',
      trend: 'down',
      variant: 'success',
    },
    {
      id: 'lab-pending',
      title: 'Pending Lab Tests',
      value: 18,
      change: 5,
      changeType: 'increase',
      trend: 'up',
      variant: 'warning',
      href: '/laboratory',
    },
    {
      id: 'pharmacy-stock',
      title: 'Low Stock Items',
      value: 7,
      variant: patientCount > 5 ? 'warning' : 'default',
      href: '/pharmacy/inventory',
    },
    {
      id: 'revenue-today',
      title: 'Revenue Today',
      value: 'KES 145,200',
      change: 22.1,
      changeType: 'increase',
      trend: 'up',
      variant: 'success',
    },
  ];

  // Patient volume over time (last 7 days mock data)
  const patientVolume: PatientVolumeData[] = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    return {
      date: format(date, 'yyyy-MM-dd'),
      registrations: Math.floor(Math.random() * 15) + 5,
      encounters: Math.floor(Math.random() * 40) + 20,
      opd: Math.floor(Math.random() * 30) + 15,
      ipd: Math.floor(Math.random() * 8) + 2,
      emergency: Math.floor(Math.random() * 5) + 1,
    };
  });

  // Revenue breakdown by department
  const revenueBreakdown: RevenueData[] = [
    { department: 'Consultation', amount: 45000, percentage: 31, color: '#0088FE' },
    { department: 'Laboratory', amount: 35000, percentage: 24, color: '#00C49F' },
    { department: 'Pharmacy', amount: 42000, percentage: 29, color: '#FFBB28' },
    { department: 'Procedures', amount: 23200, percentage: 16, color: '#FF8042' },
  ];

  // Recent activity
  const recentActivity: RecentActivity[] = [
    {
      id: '1',
      type: 'patient',
      title: 'New patient registered',
      description: 'John Kamau - MRN-20260102-0045',
      timestamp: new Date().toISOString(),
      user: 'Reception',
      href: '/patients',
    },
    {
      id: '2',
      type: 'encounter',
      title: 'OPD visit completed',
      description: 'Mary Wanjiku - Follow-up consultation',
      timestamp: subDays(new Date(), 0.1).toISOString(),
      href: '/encounters',
    },
    {
      id: '3',
      type: 'lab',
      title: 'Lab results ready',
      description: 'CBC & Malaria RDT - Peter Ochieng',
      timestamp: subDays(new Date(), 0.2).toISOString(),
      href: '/laboratory',
    },
    {
      id: '4',
      type: 'pharmacy',
      title: 'Prescription dispensed',
      description: '5 items dispensed to Jane Achieng',
      timestamp: subDays(new Date(), 0.3).toISOString(),
      href: '/pharmacy',
    },
    {
      id: '5',
      type: 'billing',
      title: 'Payment received',
      description: 'KES 3,500 - Cash payment',
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
