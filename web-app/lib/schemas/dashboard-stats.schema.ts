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
});