import { z } from 'zod';

function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

export const ScreeningPhotoAttachmentSchema = z.object({
  uri: z.string(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  captured_at: z.string(),
});

export const ScreeningLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullable().optional(),
  captured_at: z.string(),
});

export const CommunityScreeningSchema = z.object({
  id: z.number(),
  patient: z.number().nullable(),
  patient_name: z.string().nullable(),
  patient_mrn: z.string().nullable(),
  screening_type: z.enum(['MALNUTRITION', 'TB_CONTACT', 'MALARIA_RDT']),
  screening_date: z.string(),
  chu_name: z.string(),
  territory: z.string(),
  result_summary: z.string(),
  notes: z.string(),
  muac_mm: z.number().nullable(),
  edema_present: z.boolean().nullable(),
  fever_present: z.boolean().nullable(),
  cough_duration_days: z.number().nullable(),
  household_contact_name: z.string(),
  malaria_rdt_result: z.enum(['positive', 'negative', 'invalid', 'not_done']).nullable(),
  malaria_treatment_referred: z.boolean().nullable(),
  tb_referral_made: z.boolean().nullable(),
  location: ScreeningLocationSchema.nullable(),
  photo: ScreeningPhotoAttachmentSchema.nullable(),
  captured_by: z.number().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedCommunityScreeningSchema = createPaginatedSchema(CommunityScreeningSchema);
