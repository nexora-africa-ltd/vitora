/**
 * Analytics Zod schemas.
 *
 * Validates API responses from /api/analytics/ endpoints.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Facility Daily Summary
// ---------------------------------------------------------------------------

export const FacilityDailySummarySchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  date: z.string(),
  new_patients: z.number(),
  total_patients: z.number(),
  encounters_opd: z.number(),
  encounters_ipd: z.number(),
  encounters_emergency: z.number(),
  encounters_other: z.number(),
  encounters_total: z.number(),
  revenue_total: z.union([z.number(), z.string()]).transform(Number),
  revenue_cash: z.union([z.number(), z.string()]).transform(Number),
  revenue_mpesa: z.union([z.number(), z.string()]).transform(Number),
  revenue_insurance: z.union([z.number(), z.string()]).transform(Number),
  invoices_created: z.number(),
  outstanding_balance: z.union([z.number(), z.string()]).transform(Number),
  lab_orders_placed: z.number(),
  lab_orders_completed: z.number(),
  lab_critical_results: z.number(),
  prescriptions_dispensed: z.number(),
  low_stock_alerts: z.number(),
  triage_assessments: z.number(),
  triage_emergency_count: z.number(),
  avg_wait_time_minutes: z.union([z.number(), z.string()]).transform(Number),
  current_admissions: z.number(),
  new_admissions: z.number(),
  discharges: z.number(),
  bed_occupancy_rate: z.union([z.number(), z.string()]).transform(Number),
  return_patients: z.number(),
  walk_ins: z.number(),
  referral_ins: z.number(),
  clinic_referrals: z.number(),
  follow_up_encounters: z.number(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Department Monthly Summary
// ---------------------------------------------------------------------------

export const TopDiagnosisSchema = z.object({
  code: z.string(),
  name: z.string(),
  count: z.number(),
});

export const DepartmentMonthlySummarySchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  year: z.number(),
  month: z.number(),
  department: z.enum(['OPD', 'IPD', 'EMERGENCY', 'PHARMACY', 'LABORATORY', 'IMAGING', 'MCH', 'THEATRE']),
  department_display: z.string(),
  visit_count: z.number(),
  unique_patients: z.number(),
  revenue: z.union([z.number(), z.string()]).transform(Number),
  top_diagnoses: z.array(TopDiagnosisSchema),
  avg_length_of_stay_days: z.union([z.number(), z.string()]).transform(Number).nullable(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Diagnosis Trend
// ---------------------------------------------------------------------------

export const DiagnosisTrendSchema = z.object({
  id: z.number(),
  facility: z.number(),
  icd10_code: z.string(),
  icd10_name: z.string(),
  granularity: z.enum(['WEEKLY', 'MONTHLY']),
  period_start: z.string(),
  period_end: z.string(),
  case_count: z.number(),
  age_band_breakdown: z.record(z.string(), z.number()),
  gender_breakdown: z.record(z.string(), z.number()),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Patient Demographic Snapshot
// ---------------------------------------------------------------------------

export const CountyDistributionSchema = z.object({
  county: z.string(),
  count: z.number(),
});

export const PatientDemographicSnapshotSchema = z.object({
  id: z.number(),
  facility: z.number(),
  facility_name: z.string(),
  snapshot_date: z.string(),
  total_patients: z.number(),
  age_distribution: z.record(z.string(), z.number()),
  gender_distribution: z.record(z.string(), z.number()),
  county_distribution: z.array(CountyDistributionSchema),
  referral_source_distribution: z.record(z.string(), z.number()),
  new_vs_return: z.record(z.string(), z.number()),
  insurance_coverage: z.record(z.string(), z.number()),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Paginated responses
// ---------------------------------------------------------------------------

const paginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const PaginatedFacilitySummarySchema = paginatedResponse(FacilityDailySummarySchema);
export const PaginatedDepartmentSummarySchema = paginatedResponse(DepartmentMonthlySummarySchema);
export const PaginatedDiagnosisTrendSchema = paginatedResponse(DiagnosisTrendSchema);
export const PaginatedDemographicSnapshotSchema = paginatedResponse(PatientDemographicSnapshotSchema);

// ---------------------------------------------------------------------------
// Metabase Embedding
// ---------------------------------------------------------------------------

export const MetabaseEmbedResponseSchema = z.object({
  embed_url: z.string(),
  token: z.string(),
  instance_url: z.string(),
});

// ---------------------------------------------------------------------------
// Room Utilization
// ---------------------------------------------------------------------------

export const RoomUtilizationRowSchema = z.object({
  facility_id: z.number(),
  room_id: z.number(),
  room_name: z.string().nullable(),
  clinic_id: z.number().nullable(),
  clinic_name: z.string().nullable(),
  stat_date: z.string(),
  staffed_minutes: z.number(),
  consultation_minutes: z.number(),
  utilization_rate: z.union([z.number(), z.string()]).transform(Number),
  visits_completed: z.number(),
  no_show_count: z.number(),
  avg_wait_to_room_minutes: z.union([z.number(), z.string()]).transform(Number),
  avg_consultation_minutes: z.union([z.number(), z.string()]).transform(Number),
  active_clinicians_count: z.number(),
  last_updated: z.string(),
});

export const RoomUtilizationArraySchema = z.array(RoomUtilizationRowSchema);

export const RoomUtilizationSummarySchema = z.object({
  total_rooms: z.number(),
  staffed_rooms: z.number(),
  active_rooms: z.number(),
  idle_rooms: z.number(),
  overloaded_rooms: z.number(),
  total_visits_completed: z.number(),
  avg_utilization_rate: z.union([z.number(), z.string()]).transform(Number),
  avg_wait_to_room_minutes: z.union([z.number(), z.string()]).transform(Number),
});

export const ClinicQueueProjectionRowSchema = z.object({
  facility_id: z.number(),
  clinic_id: z.number(),
  waiting_count: z.number(),
  in_consultation_count: z.number(),
  completed_today: z.number(),
  no_show_today: z.number(),
  avg_wait_seconds: z.union([z.number(), z.string()]).transform(Number),
  longest_wait_seconds: z.union([z.number(), z.string()]).transform(Number),
  last_updated: z.string(),
});

export const ClinicQueueProjectionArraySchema = z.array(ClinicQueueProjectionRowSchema);

export const WardOccupancyProjectionRowSchema = z.object({
  facility_id: z.number(),
  ward_id: z.number(),
  total_beds: z.number(),
  occupied_beds: z.number(),
  available_beds: z.number(),
  occupancy_rate: z.union([z.number(), z.string()]).transform(Number),
  admissions_today: z.number(),
  discharges_today: z.number(),
  last_updated: z.string(),
});

export const WardOccupancyProjectionArraySchema = z.array(WardOccupancyProjectionRowSchema);

export const PharmacyQueueProjectionRowSchema = z.object({
  facility_id: z.number(),
  pending_prescriptions: z.number(),
  dispensed_today: z.number(),
  critical_stock_count: z.number(),
  low_stock_count: z.number(),
  last_updated: z.string(),
});

export const PharmacyQueueProjectionArraySchema = z.array(PharmacyQueueProjectionRowSchema);
