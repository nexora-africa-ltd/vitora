import { z } from 'zod';

export const ConditionStatusSchema = z.enum(['ACTIVE', 'REMISSION', 'RESOLVED', 'UNKNOWN']);

export const ChronicConditionSchema = z.object({
  id: z.number(),
  patient: z.number(),
  encounter: z.number().nullable(),
  condition_name: z.string(),
  icd10_code: z.string().default(''),
  status: ConditionStatusSchema,
  status_display: z.string(),
  onset_date: z.string().nullable(),
  notes: z.string().default(''),
  recorded_by: z.number().nullable(),
  recorded_by_username: z.string().nullable(),
  patient_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
