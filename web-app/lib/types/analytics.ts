/**
 * Analytics TypeScript types.
 *
 * Mirror the backend analytics serializers.
 */

// ---------------------------------------------------------------------------
// Facility Daily Summary
// ---------------------------------------------------------------------------

export interface FacilityDailySummary {
  id: number;
  facility: number;
  facility_name: string;
  date: string;
  // Patients
  new_patients: number;
  total_patients: number;
  // Encounters
  encounters_opd: number;
  encounters_ipd: number;
  encounters_emergency: number;
  encounters_other: number;
  encounters_total: number;
  // Revenue (KES)
  revenue_total: number;
  revenue_cash: number;
  revenue_mpesa: number;
  revenue_insurance: number;
  // Billing
  invoices_created: number;
  outstanding_balance: number;
  // Lab
  lab_orders_placed: number;
  lab_orders_completed: number;
  lab_critical_results: number;
  // Pharmacy
  prescriptions_dispensed: number;
  low_stock_alerts: number;
  // Triage
  triage_assessments: number;
  triage_emergency_count: number;
  avg_wait_time_minutes: number;
  // Inpatient
  current_admissions: number;
  new_admissions: number;
  discharges: number;
  bed_occupancy_rate: number;
  // Patient flow KPIs
  return_patients: number;
  walk_ins: number;
  referral_ins: number;
  clinic_referrals: number;
  follow_up_encounters: number;
  // Meta
  created_at: string;
}

// ---------------------------------------------------------------------------
// Department Monthly Summary
// ---------------------------------------------------------------------------

export type DepartmentCode =
  | 'OPD'
  | 'IPD'
  | 'EMERGENCY'
  | 'PHARMACY'
  | 'LABORATORY'
  | 'IMAGING'
  | 'MCH'
  | 'THEATRE';

export interface TopDiagnosis {
  code: string;
  name: string;
  count: number;
}

export interface DepartmentMonthlySummary {
  id: number;
  facility: number;
  facility_name: string;
  year: number;
  month: number;
  department: DepartmentCode;
  department_display: string;
  visit_count: number;
  unique_patients: number;
  revenue: number;
  top_diagnoses: TopDiagnosis[];
  avg_length_of_stay_days: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Diagnosis Trend
// ---------------------------------------------------------------------------

export type DiagnosisGranularity = 'WEEKLY' | 'MONTHLY';

export interface DiagnosisTrend {
  id: number;
  facility: number;
  icd10_code: string;
  icd10_name: string;
  granularity: DiagnosisGranularity;
  period_start: string;
  period_end: string;
  case_count: number;
  age_band_breakdown: Record<string, number>;
  gender_breakdown: Record<string, number>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Patient Demographic Snapshot
// ---------------------------------------------------------------------------

export interface CountyDistribution {
  county: string;
  count: number;
}

export interface PatientDemographicSnapshot {
  id: number;
  facility: number;
  facility_name: string;
  snapshot_date: string;
  total_patients: number;
  age_distribution: Record<string, number>;
  gender_distribution: Record<string, number>;
  county_distribution: CountyDistribution[];
  referral_source_distribution: Record<string, number>;
  new_vs_return: Record<string, number>;
  insurance_coverage: Record<string, number>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API params
// ---------------------------------------------------------------------------

export interface FacilitySummaryParams {
  date_from?: string;
  date_to?: string;
  page?: number;
}

export interface DepartmentPerformanceParams {
  year?: number;
  month?: number;
  department?: DepartmentCode;
  page?: number;
}

export interface DiagnosisTrendParams {
  icd10_code?: string;
  granularity?: DiagnosisGranularity;
  date_from?: string;
  date_to?: string;
  top_n?: number;
  page?: number;
}

// ---------------------------------------------------------------------------
// Metabase Embedding
// ---------------------------------------------------------------------------

export type MetabaseResourceType = 'dashboard' | 'question';

export interface MetabaseEmbedResponse {
  embed_url: string;
  token: string;
  instance_url: string;
}

export interface MetabaseDashboardInfo {
  id: number;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Room Utilization
// ---------------------------------------------------------------------------

export interface RoomUtilizationRow {
  facility_id: number;
  room_id: number;
  room_name: string | null;
  clinic_id: number | null;
  clinic_name: string | null;
  stat_date: string;
  staffed_minutes: number;
  consultation_minutes: number;
  utilization_rate: number;
  visits_completed: number;
  no_show_count: number;
  avg_wait_to_room_minutes: number;
  avg_consultation_minutes: number;
  active_clinicians_count: number;
  last_updated: string;
}

export interface RoomUtilizationSummary {
  total_rooms: number;
  staffed_rooms: number;
  active_rooms: number;
  idle_rooms: number;
  overloaded_rooms: number;
  total_visits_completed: number;
  avg_utilization_rate: number;
  avg_wait_to_room_minutes: number;
}

export interface RoomUtilizationParams {
  date?: string;
  room_id?: number;
  clinic_id?: number;
  facility_id?: number;
}

// ---------------------------------------------------------------------------
// Projection Stats
// ---------------------------------------------------------------------------

export interface ClinicQueueProjectionRow {
  facility_id: number;
  clinic_id: number;
  waiting_count: number;
  in_consultation_count: number;
  completed_today: number;
  no_show_today: number;
  avg_wait_seconds: number;
  longest_wait_seconds: number;
  last_updated: string;
}

export interface WardOccupancyProjectionRow {
  facility_id: number;
  ward_id: number;
  total_beds: number;
  occupied_beds: number;
  available_beds: number;
  occupancy_rate: number;
  admissions_today: number;
  discharges_today: number;
  last_updated: string;
}

export interface PharmacyQueueProjectionRow {
  facility_id: number;
  pending_prescriptions: number;
  dispensed_today: number;
  critical_stock_count: number;
  low_stock_count: number;
  last_updated: string;
}

export interface ClinicQueueProjectionParams {
  clinic_id: number;
  facility_id?: number;
}

export interface WardOccupancyProjectionParams {
  ward_id?: number;
  facility_id?: number;
}

export interface PharmacyQueueProjectionParams {
  facility_id?: number;
}
