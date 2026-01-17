/**
 * Dashboard Statistics Types
 *
 * Types for the /api/core/dashboard/stats/ endpoint response.
 */

export interface PatientStats {
  total: number;
  today: number;
  this_week: number;
  this_month: number;
}

export interface EncounterStats {
  total: number;
  today: number;
  in_progress: number;
  completed_today: number;
}

export interface PharmacyStats {
  prescriptions_today: number;
  pending_dispensing: number;
  low_stock_items: number;
  expiring_soon: number;
}

export interface LaboratoryStats {
  pending_tests: number;
  completed_today: number;
  critical_results: number;
}

export interface TriageStats {
  waiting: number;
  avg_wait_time_minutes: number;
  emergency_count: number;
}

export interface BillingStats {
  revenue_today: number;
  pending_payments: number;
  sha_claims_pending: number;
}

export interface AlertStats {
  critical: number;
  high: number;
  medium: number;
  total_unresolved: number;
}

export interface DashboardStats {
  timestamp: string;
  cache_ttl: number;
  patients: PatientStats;
  encounters: EncounterStats;
  pharmacy: PharmacyStats;
  laboratory: LaboratoryStats;
  triage: TriageStats;
  billing: BillingStats;
  alerts: AlertStats;
}
