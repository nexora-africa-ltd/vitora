/**
 * Dashboard and reporting types
 */

import type { ReactNode } from 'react';

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
  description?: ReactNode;
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
  // Extended encounter types from backend
  anc?: number;
  paediatric?: number;
  dialysis?: number;
  oncology?: number;
  scheduled_opd?: number;
  follow_up?: number;
  consultant_review?: number;
  chronic_stable?: number;
  specialist_clinic?: number;
  procedure?: number;
  day_case?: number;
  ward_round?: number;
  discharge_review?: number;
}

export interface RevenueData {
  department: string;
  amount: number;
  percentage: number;
  color?: string;
  transaction_count?: number;
}

export interface DepartmentStats {
  department: string;
  patientCount: number;
  encounterCount: number;
  revenue: number;
  avgWaitTime: number;
}

// Activity types matching backend ActivityFeed model
export type ActivityType = 
  | 'patient' 
  | 'encounter' 
  | 'lab' 
  | 'pharmacy' 
  | 'billing' 
  | 'triage'
  | 'appointment'
  | 'inventory'
  | 'user'
  | 'system';

export interface RecentActivity {
  id: string;
  type: ActivityType;
  action: string;
  title: string;
  description: string;
  timestamp: string;
  user?: {
    id: number;
    name: string;
  } | string; // Support both new and legacy format
  resource?: {
    type: string;
    id: number;
    href: string;
  };
  href?: string; // Legacy support
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

// =============================================================================
// API Response Types (matching backend endpoints)
// =============================================================================

/**
 * Response from GET /api/core/dashboard/patient-volume/
 */
export interface PatientVolumeResponse {
  date_range: { start: string; end: string };
  granularity: 'day' | 'week' | 'month';
  data: PatientVolumeData[];
}

/**
 * Response from GET /api/core/dashboard/revenue-breakdown/
 */
export interface RevenueBreakdownResponse {
  date_range: { start: string; end: string };
  total_revenue: number;
  currency: string;
  breakdown: Array<{
    name: string;
    amount: number;
    percentage: number;
    transaction_count: number;
  }>;
}

/**
 * Response from GET /api/core/dashboard/activity-feed/
 */
export interface ActivityFeedResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RecentActivity[];
}
