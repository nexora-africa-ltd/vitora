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
}
