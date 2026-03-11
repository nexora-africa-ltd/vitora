import { z } from 'zod';

export const CheckInVisitTypeSchema = z.enum(['NEW', 'RETURN', 'FOLLOW_UP', 'EMERGENCY', 'SCHEDULED']);
export const CheckInVisitReasonSchema = z.enum([
  'NEW_COMPLAINT',
  'FOLLOW_UP',
  'CHRONIC_CARE',
  'PROCEDURE_REVIEW',
  'REFILL_ONLY',
  'LAB_REVIEW',
  'REFERRAL_VISIT',
  'OTHER',
]);
export const CheckInStatusSchema = z.enum(['WAITING', 'IN_TRIAGE', 'TRIAGED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);

export const ClinicalSnapshotSchema = z.object({
  allergies: z.array(z.string()),
  active_conditions: z.array(z.string()),
  current_medications: z.array(z.string()),
  last_visit_date: z.string().optional().nullable(),
  last_visit_clinic: z.string().optional().nullable(),
  pending_results: z.array(z.record(z.string(), z.unknown())),
  alerts: z.array(z.string()),
});

export const CheckInPatientSearchResultSchema = z.object({
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
  county: z.number(),
  sub_county: z.number(),
  last_visit_date: z.string().optional().nullable(),
});

export const CheckInPatientLookupSchema = CheckInPatientSearchResultSchema.extend({
  ward: z.number().optional().nullable(),
  clinical_snapshot: ClinicalSnapshotSchema,
  suggested_visit_type: CheckInVisitTypeSchema.optional().nullable(),
  suggested_visit_reason: CheckInVisitReasonSchema.optional().nullable(),
  last_encounter_date: z.string().optional().nullable(),
  linkable_encounter_id: z.number().optional().nullable(),
});

export const CheckInResponseSchema = z.object({
  checkin_id: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  destination: z.string(),
  destination_clinic_id: z.number().optional().nullable(),
  destination_clinic_name: z.string().optional().nullable(),
  visit_type: CheckInVisitTypeSchema,
  visit_reason: CheckInVisitReasonSchema,
  skip_triage: z.boolean(),
  status: CheckInStatusSchema,
  queue_position: z.number(),
  estimated_wait_minutes: z.number(),
  checked_in_at: z.string(),
  encounter_id: z.number().optional().nullable(),
  linked_encounter_id: z.number().optional().nullable(),
  clinic_visit_id: z.number().optional().nullable(),
  warning: z.string().optional().nullable(),
});

export const CheckInPatientSearchResultsSchema = z.object({
  count: z.number(),
  results: z.array(CheckInPatientSearchResultSchema),
});