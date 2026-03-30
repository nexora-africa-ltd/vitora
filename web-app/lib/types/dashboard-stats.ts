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

export interface CheckinStats {
  checked_in_today: number;
  waiting: number;
  completed_today: number;
}

export interface InpatientStats {
  current_admissions: number;
  available_beds: number;
  discharged_today: number;
  occupancy_rate: number;
}

export interface ImagingStats {
  pending_orders: number;
  completed_today: number;
  urgent_orders: number;
}

export interface EmergencyStats {
  active_overrides: number;
  pending_review: number;
}

export interface MCHStats {
  active_registrations: number;
  high_risk: number;
  deliveries_today: number;
}

export interface TheatreStats {
  scheduled_today: number;
  in_progress: number;
  completed_today: number;
}

export interface AlliedHealthStats {
  pending_referrals: number;
  sessions_today: number;
  open_cases: number;
}

export interface ProceduresStats {
  scheduled_today: number;
  pending_consent: number;
  in_progress: number;
  completed_today: number;
}

export interface OrgAdminStats {
  total_facilities: number;
  active_facilities: number;
  total_staff: number;
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
  checkin: CheckinStats;
  inpatient: InpatientStats;
  imaging: ImagingStats;
  emergency: EmergencyStats;
  mch: MCHStats;
  theatre: TheatreStats;
  allied_health: AlliedHealthStats;
  procedures: ProceduresStats;
  org_admin?: OrgAdminStats;
}
