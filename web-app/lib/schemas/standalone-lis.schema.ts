/**
 * Zod schemas for standalone LIS API responses.
 */

import { z } from 'zod';

export const WalkInPatientSchema = z.object({
  id: z.number(),
  registration_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
  date_of_birth: z.string().nullable(),
  gender: z.enum(['', 'M', 'F', 'O']).catch(''),
  phone_number: z.string(),
  email: z.string(),
  national_id: z.string(),
  id_type: z.string(),
  referring_facility: z.string(),
  referring_clinician: z.string(),
  linked_patient: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const WalkInPatientListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WalkInPatientSchema),
});

export const ExternalOrderRequestSchema = z.object({
  id: z.number(),
  trace_id: z.string().uuid().optional(),
  message_control_id: z.string(),
  sending_application: z.string(),
  sending_facility: z.string(),
  external_patient_id: z.string(),
  patient_name: z.string(),
  patient_dob: z.string().nullable(),
  patient_gender: z.string(),
  patient_id_number: z.string(),
  placer_order_number: z.string(),
  order_priority: z.string(),
  clinical_info: z.string(),
  requested_tests: z.array(z.object({ code: z.string(), name: z.string().optional() })),
  status: z.enum(['RECEIVED', 'ACCEPTED', 'REJECTED', 'PROCESSING', 'COMPLETED']),
  rejection_reason: z.string(),
  walkin_patient: z.number().nullable(),
  lab_order: z.number().nullable(),
  processed_by: z.number().nullable(),
  processed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ExternalOrderListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ExternalOrderRequestSchema),
});

export const InboundIngestionEventSchema = z.object({
  id: z.number(),
  trace_id: z.string().uuid(),
  source_system: z.string(),
  channel: z.string(),
  idempotency_key: z.string(),
  status: z.enum(['RECEIVED', 'MAPPED', 'FAILED', 'REPLAYED']),
  error_message: z.string(),
  replay_count: z.number(),
  last_replayed_at: z.string().nullable(),
  processed_at: z.string().nullable(),
  external_order: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const InboundIngestionEventListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(InboundIngestionEventSchema),
});

export const CrosswalkEntrySchema = z.object({
  id: z.number(),
  source_system: z.string(),
  external_patient_id: z.string(),
  external_member_id: z.string(),
  patient_name_snapshot: z.string(),
  walkin_patient: z.number().nullable(),
  patient: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CrosswalkEntryListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CrosswalkEntrySchema),
});

export const ResultDeliveryLogSchema = z.object({
  id: z.number(),
  trace_id: z.string().uuid(),
  channel: z.enum(['WEBHOOK', 'PDF_PACKAGE', 'HL7_FHIR']),
  status: z.enum(['PENDING', 'DELIVERED', 'FAILED']),
  destination: z.string(),
  external_order: z.number().nullable(),
  lab_order: z.number(),
  requested_by: z.number().nullable(),
  response_status_code: z.number().nullable(),
  response_body: z.string(),
  error_message: z.string(),
  attempt_count: z.number(),
  delivered_at: z.string().nullable(),
  pdf_filename: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ResultDeliveryLogListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ResultDeliveryLogSchema),
});

export const InboundIngestResponseSchema = z.object({
  trace_id: z.string().uuid(),
  event_id: z.number(),
  external_order: ExternalOrderRequestSchema,
});

export const MessageMappingConfigSchema = z.object({
  id: z.number(),
  code_system: z.string(),
  external_code: z.string(),
  external_display: z.string(),
  relationship: z.enum(['EQUIVALENT', 'BROADER', 'NARROWER', 'RELATED']),
  is_active: z.boolean(),
  notes: z.string(),
  test_id: z.number(),
  test_code: z.string(),
  test_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const MessageMappingConfigListSchema = z.array(MessageMappingConfigSchema);

export const MessageMappingValidationRowSchema = z.object({
  external_code: z.string(),
  mapped: z.boolean(),
  mapping_source: z.enum(['none', 'external_code_mapping', 'direct_catalog']),
  test_code: z.string().nullable(),
  test_name: z.string().nullable(),
  reason: z.string(),
});

export const MessageMappingValidationResultSchema = z.object({
  source_system: z.string(),
  total_codes: z.number(),
  mapped_count: z.number(),
  unmapped_count: z.number(),
  mappings: z.array(MessageMappingValidationRowSchema),
});

export const LISOnboardingStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  done: z.boolean(),
  required: z.boolean(),
});

export const LISOnboardingStatusSchema = z.object({
  complete: z.boolean(),
  steps: z.array(LISOnboardingStepSchema),
  completed_at: z.string().nullable(),
});

export const LISOnboardingSeedResultSchema = z.object({
  archetype: z.enum(['small', 'medium', 'reference']),
  created_tests: z.number(),
  created_instruments: z.number(),
  created_channels: z.number(),
});

export const LISOnboardingImportErrorSchema = z.object({
  row: z.number(),
  error: z.string(),
});

export const LISOnboardingImportResultSchema = z.object({
  created: z.number(),
  updated: z.number(),
  errors: z.array(LISOnboardingImportErrorSchema),
  error_count: z.number(),
});

export const LISOnboardingWorkflowImportResultSchema = z.object({
  updated: z.number(),
  errors: z.array(LISOnboardingImportErrorSchema),
  error_count: z.number(),
});

export const LISOnboardingAnalyzerImportResultSchema = z.object({
  created_instruments: z.number(),
  created_channels: z.number(),
  updated_channels: z.number(),
  errors: z.array(LISOnboardingImportErrorSchema),
  error_count: z.number(),
});

export const LISOnboardingReferenceRangeImportResultSchema = z.object({
  updated: z.number(),
  errors: z.array(LISOnboardingImportErrorSchema),
  error_count: z.number(),
});
