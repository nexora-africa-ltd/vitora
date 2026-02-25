/**
 * Shared Allied Health Zod Schemas
 * Common validation schemas used across all Allied Health modules
 */

import { z } from 'zod';

// =============================================================================
// STATUS ENUMS
// =============================================================================

export const AlliedHealthOrderStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
]);

export const AlliedHealthSessionStatusSchema = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'RESCHEDULED',
]);

export const AlliedHealthPrioritySchema = z.enum(['EMERGENCY', 'URGENT', 'ROUTINE']);

export const SessionOutcomeSchema = z.enum([
  'IMPROVED',
  'MAINTAINED',
  'DECLINED',
  'UNABLE_TO_ASSESS',
  'NOT_APPLICABLE',
]);

// =============================================================================
// BASE SCHEMAS
// =============================================================================

export const PatientReferenceSchema = z.object({
  id: z.number(),
  mrn: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
  date_of_birth: z.string(),
  gender: z.enum(['M', 'F', 'O']),
});

export const StaffReferenceSchema = z.object({
  id: z.number(),
  username: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
});

export const BaseAlliedHealthOrderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  patient: PatientReferenceSchema,
  patient_id: z.number(),
  encounter_id: z.number().nullable(),
  clinic_visit_id: z.number().nullable(),
  ordered_by: StaffReferenceSchema,
  ordered_by_id: z.number(),
  status: AlliedHealthOrderStatusSchema,
  priority: AlliedHealthPrioritySchema,
  clinical_notes: z.string(),
  is_sensitive: z.boolean(),
  sha_code: z.string().nullable(),
  sha_claimable: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const BaseAlliedHealthSessionSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullable(),
  actual_start_time: z.string().nullable(),
  actual_end_time: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  status: AlliedHealthSessionStatusSchema,
  therapist: StaffReferenceSchema.nullable(),
  therapist_id: z.number().nullable(),
  notes: z.string(),
  outcome: SessionOutcomeSchema.nullable(),
  invoice_item_id: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// PAGINATED RESPONSE
// =============================================================================

export function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

export const AlliedHealthModuleStatsSchema = z.object({
  pending_count: z.number(),
  in_progress_count: z.number(),
  today_sessions_count: z.number(),
  completed_today_count: z.number(),
});

export const TodaySessionSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  scheduled_time: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  module: z.enum(['PHYSIO', 'NUTRITION', 'OT', 'SOCIAL_WORK', 'COUNSELLING']),
  treatment_type: z.string(),
  status: AlliedHealthSessionStatusSchema,
});

export const AlliedHealthDashboardStatsSchema = z.object({
  physiotherapy: AlliedHealthModuleStatsSchema,
  nutrition: AlliedHealthModuleStatsSchema.extend({
    consultations_count: z.number(),
  }),
  occupational_therapy: AlliedHealthModuleStatsSchema,
  social_work: z.object({
    open_cases_count: z.number(),
    urgent_count: z.number(),
    this_week_count: z.number(),
  }),
  counselling: AlliedHealthModuleStatsSchema.extend({
    follow_ups_count: z.number(),
  }),
  todays_sessions: z.array(TodaySessionSchema),
});
