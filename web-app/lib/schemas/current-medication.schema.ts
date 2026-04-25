import { z } from 'zod';

export const MedicationStatusSchema = z.enum(['ACTIVE', 'ON_HOLD', 'STOPPED', 'UNKNOWN']);

export const CurrentMedicationSchema = z.object({
  id: z.number(),
  patient: z.number(),
  encounter: z.number().nullable(),
  medication_name: z.string(),
  dosage: z.string().default(''),
  frequency: z.string().default(''),
  route: z.string().default(''),
  status: MedicationStatusSchema,
  status_display: z.string(),
  start_date: z.string().nullable(),
  notes: z.string().default(''),
  recorded_by: z.number().nullable(),
  recorded_by_username: z.string().nullable(),
  patient_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
