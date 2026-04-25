/**
 * Zod schemas for Social History Observation API response validation.
 *
 * See lib/types/social-history.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const ObservationTypeSchema = z.enum([
  'ALCOHOL_USE',
  'TOBACCO_USE',
  'OCCUPATION',
  'LIFESTYLE',
]);

export const UsageStatusSchema = z.enum(['CURRENT', 'FORMER', 'NEVER', 'UNKNOWN']);

// =============================================================================
// SOCIAL HISTORY OBSERVATION SCHEMA
// =============================================================================

export const SocialHistoryObservationSchema = z.object({
  id: z.number(),
  patient: z.number(),
  encounter: z.number().nullable(),
  observation_type: ObservationTypeSchema,
  observation_type_display: z.string(),
  status: UsageStatusSchema,
  status_display: z.string(),
  value_text: z.string().default(''),
  effective_date: z.string(),
  recorded_by: z.number().nullable(),
  recorded_by_username: z.string().nullable(),
  patient_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SocialHistoryObservationListSchema = SocialHistoryObservationSchema;
