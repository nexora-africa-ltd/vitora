/**
 * Zod schemas for Check-in API responses
 *
 * Sprint: Returning Patient Workflow - Sprint 1
 */

import { z } from 'zod';

/**
 * Schema for pending lab result
 */
export const PendingResultSchema = z.object({
  test_name: z.string(),
  ordered_date: z.string().nullable(),
  status: z.string(),
});

/**
 * Schema for clinical snapshot
 */
export const ClinicalSnapshotSchema = z.object({
  allergies: z.array(z.string()),
  active_conditions: z.array(z.string()),
  current_medications: z.array(z.string()),
  last_visit_date: z.string().nullable(),
  last_visit_clinic: z.string().nullable(),
  pending_results: z.array(PendingResultSchema),
  alerts: z.array(z.string()),
});

/**
 * Visit type enum schema
 */
export const VisitTypeSchema = z.enum([
  'NEW',
  'RETURN',
  'FOLLOW_UP',
  'EMERGENCY',
  'SCHEDULED',
]);

/**
 * Visit reason enum schema
 */
export const VisitReasonSchema = z.enum([
  'NEW_COMPLAINT',
  'FOLLOW_UP',
  'CHRONIC_CARE',
  'PROCEDURE_REVIEW',
  'REFILL_ONLY',
  'LAB_REVIEW',
  'REFERRAL_VISIT',
  'OTHER',
]);

/**
 * Schema for patient lookup response
 */
export const PatientLookupResponseSchema = z.object({
  id: z.number(),
  mrn: z.string(),
  first_name: z.string(),
  middle_name: z.string().optional().nullable(),
  last_name: z.string(),
  full_name: z.string(),
  date_of_birth: z.string(),
  age: z.number(),
  gender: z.string(),
  phone_number: z.string().optional().nullable(),
  identification_type: z.string().optional().nullable(),
  identification_number: z.string().optional().nullable(),
  county: z.number().optional().nullable(),
  sub_county: z.number().optional().nullable(),
  ward: z.number().optional().nullable(),
  clinical_snapshot: ClinicalSnapshotSchema,
  suggested_visit_type: VisitTypeSchema,
  suggested_visit_reason: VisitReasonSchema,
  last_encounter_date: z.string().nullable(),
});

/**
 * Schema for check-in response
 */
export const CheckInResponseSchema = z.object({
  checkin_id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  destination: z.string(),
  destination_clinic_id: z.number().nullable(),
  destination_clinic_name: z.string().nullable(),
  visit_type: VisitTypeSchema,
  visit_reason: VisitReasonSchema,
  skip_triage: z.boolean(),
  status: z.string(),
  queue_position: z.number(),
  estimated_wait_minutes: z.number(),
  checked_in_at: z.string(),
  encounter_id: z.number().nullable(),
  linked_encounter_id: z.number().nullable(),
  clinic_visit_id: z.number().nullable(),
  warning: z.string().optional().nullable(),
});

/**
 * Schema for today's check-in list item
 */
export const TodayCheckinSchema = z.object({
  id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  destination: z.string(),
  destination_clinic_id: z.number().nullable(),
  visit_type: VisitTypeSchema,
  visit_reason: VisitReasonSchema,
  status: z.string(),
  checked_in_at: z.string(),
  checked_in_by_name: z.string().nullable(),
  skip_triage: z.boolean(),
});

/**
 * Schema for paginated today's check-ins response
 */
export const TodayCheckinsResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TodayCheckinSchema),
});
