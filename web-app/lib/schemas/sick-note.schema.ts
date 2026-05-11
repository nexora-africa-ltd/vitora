/**
 * Zod schemas for Sick Note API responses.
 */

import { z } from 'zod';

export const SickNoteListItemSchema = z.object({
  id: z.number(),
  note_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number(),
  status: z.string(),
  status_display: z.string(),
  diagnosis_text: z.string(),
  leave_start_date: z.string(),
  leave_end_date: z.string(),
  leave_days: z.number(),
  issued_by: z.number(),
  issued_by_name: z.string(),
  issued_at: z.string().nullable(),
  created_at: z.string(),
});

export const SickNoteSchema = z.object({
  id: z.number(),
  note_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number(),
  issued_by: z.number(),
  issued_by_name: z.string(),
  leave_start_date: z.string(),
  leave_end_date: z.string(),
  leave_days: z.number(),
  diagnosis_text: z.string(),
  diagnosis_code: z.string(),
  employer_name: z.string(),
  employer_contact: z.string(),
  recommendations: z.string(),
  notes: z.string(),
  status: z.string(),
  status_display: z.string(),
  is_active: z.boolean(),
  issued_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  revoked_by: z.number().nullable(),
  revoked_by_name: z.string(),
  revoke_reason: z.string(),
  cancelled_at: z.string().nullable(),
  cancelled_by: z.number().nullable(),
  cancelled_by_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedSickNoteListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SickNoteListItemSchema),
});

export const SickNoteStatsSchema = z.object({
  total: z.number(),
  draft: z.number(),
  issued: z.number(),
  cancelled: z.number(),
  revoked: z.number(),
});
