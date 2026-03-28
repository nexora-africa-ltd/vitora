/**
 * Zod schemas for Death Record (Last Office) API response validation
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const DeathRecordStatusSchema = z.enum([
  'PENDING_CERTIFICATION',
  'CERTIFIED',
  'REPORTED_TO_CIVIL_REGISTRY',
  'RELEASED_TO_FAMILY',
  'VOIDED',
]);

export const MannerOfDeathSchema = z.enum([
  'NATURAL',
  'ACCIDENT',
  'SUICIDE',
  'HOMICIDE',
  'UNDETERMINED',
  'PENDING_INVESTIGATION',
]);

export const PlaceOfDeathSchema = z.enum([
  'INPATIENT',
  'EMERGENCY',
  'THEATRE',
  'ICU',
  'BROUGHT_IN_DEAD',
  'OTHER',
]);

export const NotificationSourceSchema = z.enum([
  'INPATIENT_DISCHARGE',
  'EMERGENCY',
  'MANUAL_ENTRY',
  'CLIENT_REGISTRY',
]);

export const BodyStatusSchema = z.enum([
  'IN_MORGUE',
  'RELEASED',
  'TRANSFERRED',
  'PENDING_COLLECTION',
]);

// =============================================================================
// LIST ITEM SCHEMA
// =============================================================================

export const DeathRecordListItemSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_mrn: z.string(),
  patient_name: z.string(),
  date_of_death: z.string(),
  time_of_death: z.string().nullable(),
  manner_of_death: MannerOfDeathSchema,
  manner_of_death_display: z.string(),
  place_of_death: PlaceOfDeathSchema,
  status: DeathRecordStatusSchema,
  status_display: z.string(),
  body_status: BodyStatusSchema,
  body_status_display: z.string(),
  is_voided: z.boolean(),
  is_certified: z.boolean(),
  recorded_by_username: z.string(),
  created_at: z.string(),
});

// =============================================================================
// DETAIL SCHEMA
// =============================================================================

export const DeathRecordSchema = z.object({
  id: z.number(),
  // Patient
  patient: z.number(),
  patient_mrn: z.string(),
  patient_name: z.string(),
  patient_date_of_birth: z.string(),
  patient_gender: z.string(),
  // Status
  status: DeathRecordStatusSchema,
  status_display: z.string(),
  // Death details
  date_of_death: z.string(),
  time_of_death: z.string().nullable(),
  manner_of_death: MannerOfDeathSchema,
  manner_of_death_display: z.string(),
  place_of_death: PlaceOfDeathSchema,
  place_of_death_display: z.string(),
  place_of_death_detail: z.string(),
  notification_source: NotificationSourceSchema,
  notification_source_display: z.string(),
  // Cause of death
  primary_cause: z.string(),
  primary_cause_icd10: z.number().nullable(),
  primary_cause_icd10_code: z.string().nullable(),
  primary_cause_icd10_description: z.string().nullable(),
  antecedent_cause: z.string(),
  antecedent_cause_icd10: z.number().nullable(),
  antecedent_cause_icd10_code: z.string().nullable(),
  antecedent_cause_icd10_description: z.string().nullable(),
  underlying_cause: z.string(),
  underlying_cause_icd10: z.number().nullable(),
  underlying_cause_icd10_code: z.string().nullable(),
  underlying_cause_icd10_description: z.string().nullable(),
  contributing_conditions: z.string(),
  // Certification
  certified_by: z.number().nullable(),
  certified_by_username: z.string().nullable(),
  certified_at: z.string().nullable(),
  death_certificate_number: z.string(),
  // Morgue
  body_status: BodyStatusSchema,
  body_status_display: z.string(),
  morgue_admission_date: z.string().nullable(),
  morgue_compartment: z.string(),
  released_to: z.string(),
  released_to_id_number: z.string(),
  released_to_relationship: z.string(),
  release_date: z.string().nullable(),
  burial_permit_number: z.string(),
  // Linked records
  admission: z.number().nullable(),
  encounter: z.number().nullable(),
  // Audit
  recorded_by: z.number(),
  recorded_by_username: z.string(),
  notes: z.string(),
  voided_by: z.number().nullable(),
  voided_by_username: z.string().nullable(),
  voided_at: z.string().nullable(),
  void_reason: z.string(),
  // Computed
  is_voided: z.boolean(),
  is_certified: z.boolean(),
  is_released: z.boolean(),
  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
});

// =============================================================================
// PAGINATED RESPONSE
// =============================================================================

export const PaginatedDeathRecordSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DeathRecordListItemSchema),
});
