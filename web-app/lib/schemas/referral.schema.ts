/**
 * Zod schemas for Referrals module.
 * Validates API responses to prevent runtime TypeErrors.
 */

import { z } from 'zod';

// =============================================================================
// Enum Schemas
// =============================================================================

export const ReferralTypeSchema = z.enum([
  'ALLIED_HEALTH',
  'SPECIALTY_CLINIC',
  'ADMISSION',
  'EXTERNAL',
]);

export const ReferralTargetServiceSchema = z.enum([
  'PHYSIOTHERAPY', 'NUTRITION', 'OCCUPATIONAL_THERAPY', 'COUNSELLING', 'SOCIAL_WORK',
  'DENTAL', 'EYE', 'ENT', 'SURGICAL', 'ORTHO', 'DERM', 'CARDIOLOGY', 'ONCOLOGY',
  'MENTAL_HEALTH', 'DIALYSIS',
  'ANC', 'PNC', 'FP', 'CWC',
  'CCC', 'TB', 'DIABETIC', 'HYPERTENSION',
  'GENERAL_WARD', 'MEDICAL_WARD', 'SURGICAL_WARD', 'MATERNITY_WARD', 'PEDIATRIC_WARD',
  'ICU', 'HDU',
  'PROCEDURE_ROOM', 'OTHER',
]);

export const ReferralPrioritySchema = z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']);

export const ReferralStatusSchema = z.enum([
  'DRAFT', 'PENDING', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS',
  'COMPLETED', 'CANCELLED', 'EXPIRED',
]);

// =============================================================================
// Object Schemas
// =============================================================================

export const ReferralDiagnosisSnapshotSchema = z.object({
  code: z.string(),
  description: z.string(),
  diagnosis_type: z.string(),
});

export const ReferralVitalsSnapshotSchema = z.record(z.string(), z.string()).default({});

export const ClinicalReferralSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  referral_type: ReferralTypeSchema,
  referral_type_display: z.string(),
  target_service: ReferralTargetServiceSchema,
  target_service_display: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number(),
  reason: z.string(),
  clinical_notes: z.string().default(''),
  priority: ReferralPrioritySchema,
  priority_display: z.string(),
  relevant_diagnoses: z.array(ReferralDiagnosisSnapshotSchema).default([]),
  relevant_vitals: ReferralVitalsSnapshotSchema,
  provisional_diagnosis: z.string().default(''),
  provisional_diagnosis_text: z.string().default(''),
  preferred_ward_type: z.string().default(''),
  external_facility_name: z.string().default(''),
  external_facility_code: z.string().default(''),
  referral_letter: z.string().default(''),
  status: ReferralStatusSchema,
  status_display: z.string(),
  referred_by: z.number(),
  referred_by_name: z.string(),
  accepted_by: z.number().nullable(),
  accepted_by_name: z.string().default(''),
  declined_by: z.number().nullable(),
  declined_by_name: z.string().default(''),
  decline_reason: z.string().default(''),
  accepted_at: z.string().nullable(),
  declined_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  expires_at: z.string(),
  linked_module: z.string().default(''),
  linked_model: z.string().default(''),
  linked_object_id: z.number().nullable(),
  clinic_visit: z.number().nullable(),
  is_sensitive: z.boolean(),
  is_active: z.boolean(),
  is_terminal: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ClinicalReferralListItemSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  referral_type: ReferralTypeSchema,
  referral_type_display: z.string(),
  target_service: ReferralTargetServiceSchema,
  target_service_display: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number(),
  priority: ReferralPrioritySchema,
  priority_display: z.string(),
  status: ReferralStatusSchema,
  status_display: z.string(),
  referred_by: z.number(),
  referred_by_name: z.string(),
  is_sensitive: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const EncounterReferralItemSchema = z.object({
  id: z.number(),
  referral_number: z.string(),
  referral_type: ReferralTypeSchema,
  referral_type_display: z.string(),
  target_service: ReferralTargetServiceSchema,
  target_service_display: z.string(),
  reason: z.string(),
  priority: ReferralPrioritySchema,
  priority_display: z.string(),
  status: ReferralStatusSchema,
  status_display: z.string(),
  referred_by_name: z.string(),
  is_sensitive: z.boolean(),
  created_at: z.string(),
});

export const PaginatedReferralListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ClinicalReferralListItemSchema),
});

export const ReferralStatsSchema = z.object({
  total: z.number(),
  by_status: z.record(z.string(), z.number()),
  by_type: z.record(z.string(), z.number()),
  by_priority: z.record(z.string(), z.number()),
});
