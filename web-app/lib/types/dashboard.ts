/**
 * Dashboard and reporting types
 */

export interface KPIMetric {
  id: string;
  title: string;
  value: number | string;
  unit?: string;
  change?: number;
  changeType?: 'increase' | 'decrease';
  trend?: 'up' | 'down' | 'stable';
  variant?: 'default' | 'success' | 'warning' | 'destructive';
  href?: string;
  description?: string;
}

export interface ChartDataPoint {
  date: string;
  label?: string;
  value: number;
  [key: string]: string | number | undefined;
}

export interface PatientVolumeData {
  date: string;
  registrations: number;
  encounters: number;
  opd: number;
  ipd: number;
  emergency: number;
}

export interface RevenueData {
  department: string;
  amount: number;
  percentage: number;
  color?: string;
}

export interface DepartmentStats {
  department: string;
  patientCount: number;
  encounterCount: number;
  revenue: number;
  avgWaitTime: number;
}

export interface RecentActivity {
  id: string;
  type: 'patient' | 'encounter' | 'lab' | 'pharmacy' | 'billing';
  title: string;
  description: string;
  timestamp: string;
  user?: string;
  href?: string;
}

export interface DashboardMetrics {
  kpis: KPIMetric[];
  patientVolume: PatientVolumeData[];
  revenueBreakdown: RevenueData[];
  departmentStats: DepartmentStats[];
  recentActivity: RecentActivity[];
  dateRange: {
    start: string;
    end: string;
  };
}

export interface DateRangeFilter {
  start: string;
  end: string;
  preset?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'custom';
}
