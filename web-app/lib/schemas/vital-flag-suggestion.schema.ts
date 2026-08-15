/**
 * Zod schemas for vitals-derived flag suggestions API responses.
 *
 * Purpose:
 * - Runtime-validate /api/patients/{patientId}/vital-flag-suggestions payloads.
 *
 * Usage:
 * - Imported by lib/api/vital-flag-suggestions.ts via parseResponse().
 *
 * Inputs:
 * - Suggestion list/detail response objects and action responses.
 */

import { z } from 'zod';

export const VitalFlagSourceTypeSchema = z.enum(['TRIAGE', 'ENCOUNTER', 'BACKGROUND_RULE']);
export const VitalFlagSeveritySchema = z.enum(['INFO', 'WARNING', 'CRITICAL']);
export const VitalFlagStatusSchema = z.enum([
  'NEW',
  'ACKNOWLEDGED',
  'MAPPED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
]);
export const VitalFlagMappingStatusSchema = z.enum([
  'UNMAPPED',
  'AUTO_MAPPED',
  'NEEDS_REVIEW',
  'CONFIRMED',
]);
export const VitalFlagResolutionActionSchema = z.enum([
  'CREATE_DIAGNOSIS_PROVISIONAL',
  'CREATE_DIAGNOSIS_CONFIRMED',
  'ADD_CHRONIC_CONDITION',
  'NOTE_ONLY',
  'NO_ACTION',
]);

export const VitalFlagSuggestionActionSchema = z.object({
  id: z.number(),
  action_type: z.string(),
  from_status: z.string().default(''),
  to_status: z.string().default(''),
  actor: z.number().nullable(),
  actor_username: z.string().nullable(),
  payload_json: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
});

export const VitalFlagSuggestionSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  encounter: z.number().nullable(),
  triage_assessment: z.number().nullable(),
  source_type: VitalFlagSourceTypeSchema,
  flag_key: z.string(),
  clinical_domain: z.string().default(''),
  severity: VitalFlagSeveritySchema,
  severity_display: z.string(),
  status: VitalFlagStatusSchema,
  status_display: z.string(),
  detected_at: z.string(),
  acknowledged_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  rule_id: z.string().default(''),
  rule_version: z.string().default(''),
  evidence_json: z.record(z.string(), z.unknown()).default({}),
  mapping_status: VitalFlagMappingStatusSchema,
  mapping_status_display: z.string(),
  suggested_icd10: z.number().nullable(),
  suggested_icd10_code: z.string().nullable(),
  suggested_icd11_code: z.string().default(''),
  suggested_icd11_title: z.string().default(''),
  selected_icd10: z.number().nullable(),
  selected_icd10_code: z.string().nullable(),
  selected_icd11_code: z.string().default(''),
  selected_icd11_title: z.string().default(''),
  resolution_action: z.union([VitalFlagResolutionActionSchema, z.literal('')]),
  resolution_note: z.string().default(''),
  resolved_by: z.number().nullable(),
  resolved_by_username: z.string().nullable(),
  linked_diagnosis: z.number().nullable(),
  linked_chronic_condition: z.number().nullable(),
  actions: z.array(VitalFlagSuggestionActionSchema).default([]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const VitalFlagSuggestionListSchema = z.array(VitalFlagSuggestionSchema);
