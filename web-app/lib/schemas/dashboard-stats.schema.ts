import { z } from 'zod';

export const PatientStatsSchema = z.object({
  total: z.number(),
  today: z.number(),
  this_week: z.number(),
  this_month: z.number(),
});

export const EncounterStatsSchema = z.object({
  total: z.number(),
  today: z.number(),
  in_progress: z.number(),
  completed_today: z.number(),
});

export const PharmacyStatsSchema = z.object({
  prescriptions_today: z.number(),
  pending_dispensing: z.number(),
  low_stock_items: z.number(),
  expiring_soon: z.number(),
});

export const LaboratoryStatsSchema = z.object({
  pending_tests: z.number(),
  completed_today: z.number(),
  critical_results: z.number(),
});

export const TriageStatsSchema = z.object({
  waiting: z.number(),
  avg_wait_time_minutes: z.number(),
  emergency_count: z.number(),
});

export const BillingStatsSchema = z.object({
  revenue_today: z.number(),
  pending_payments: z.number(),
  sha_claims_pending: z.number(),
});

export const AlertStatsSchema = z.object({
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  total_unresolved: z.number(),
});

export const CheckinStatsSchema = z.object({
  checked_in_today: z.number(),
  waiting: z.number(),
  completed_today: z.number(),
});

export const InpatientStatsSchema = z.object({
  current_admissions: z.number(),
  available_beds: z.number(),
  discharged_today: z.number(),
  occupancy_rate: z.number(),
});

export const ImagingStatsSchema = z.object({
  pending_orders: z.number(),
  completed_today: z.number(),
  urgent_orders: z.number(),
});

export const EmergencyStatsSchema = z.object({
  active_overrides: z.number(),
  pending_review: z.number(),
});

export const MCHStatsSchema = z.object({
  active_registrations: z.number(),
  high_risk: z.number(),
  deliveries_today: z.number(),
});

export const TheatreStatsSchema = z.object({
  scheduled_today: z.number(),
  in_progress: z.number(),
  completed_today: z.number(),
});

export const AlliedHealthStatsSchema = z.object({
  pending_referrals: z.number(),
  sessions_today: z.number(),
  open_cases: z.number(),
});

export const ProceduresStatsSchema = z.object({
  scheduled_today: z.number(),
  pending_consent: z.number(),
  in_progress: z.number(),
  completed_today: z.number(),
});

export const OrgAdminStatsSchema = z.object({
  total_facilities: z.number(),
  active_facilities: z.number(),
  total_staff: z.number(),
});

export const DashboardStatsSchema = z.object({
  timestamp: z.string(),
  cache_ttl: z.number(),
  patients: PatientStatsSchema,
  encounters: EncounterStatsSchema,
  pharmacy: PharmacyStatsSchema,
  laboratory: LaboratoryStatsSchema,
  triage: TriageStatsSchema,
  billing: BillingStatsSchema,
  alerts: AlertStatsSchema,
  checkin: CheckinStatsSchema,
  inpatient: InpatientStatsSchema,
  imaging: ImagingStatsSchema,
  emergency: EmergencyStatsSchema,
  mch: MCHStatsSchema,
  theatre: TheatreStatsSchema,
  allied_health: AlliedHealthStatsSchema,
  procedures: ProceduresStatsSchema,
  org_admin: OrgAdminStatsSchema.optional(),
});