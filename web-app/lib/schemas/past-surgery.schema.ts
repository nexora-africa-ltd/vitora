import { z } from 'zod';

export const SurgeryOutcomeSchema = z.enum(['SUCCESSFUL', 'COMPLICATED', 'UNKNOWN']);

export const PastSurgerySchema = z.object({
  id: z.number(),
  patient: z.number(),
  encounter: z.number().nullable(),
  procedure_name: z.string(),
  procedure_date: z.string().nullable(),
  outcome: SurgeryOutcomeSchema,
  outcome_display: z.string(),
  notes: z.string().default(''),
  recorded_by: z.number().nullable(),
  recorded_by_username: z.string().nullable(),
  patient_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
