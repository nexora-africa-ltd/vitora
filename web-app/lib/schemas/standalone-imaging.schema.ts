/**
 * Zod schemas for standalone Imaging API responses.
 */

import { z } from 'zod';

export const WalkInImagingPatientSchema = z.object({
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

export const WalkInImagingPatientListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WalkInImagingPatientSchema),
});

export const ExternalImagingOrderRequestSchema = z.object({
  id: z.number(),
  message_control_id: z.string(),
  sending_application: z.string(),
  sending_facility: z.string(),
  referring_clinician: z.string(),
  referring_clinician_license: z.string(),
  external_patient_id: z.string(),
  patient_name: z.string(),
  patient_dob: z.string().nullable(),
  patient_gender: z.string(),
  patient_phone: z.string(),
  patient_id_number: z.string(),
  placer_order_number: z.string(),
  priority: z.string(),
  clinical_indication: z.string(),
  relevant_clinical_history: z.string(),
  requested_procedures: z.array(
    z.object({
      code: z.string(),
      name: z.string().optional(),
      laterality: z.string().optional(),
      modality: z.string().optional(),
    })
  ),
  status: z.enum(['RECEIVED', 'ACCEPTED', 'REJECTED', 'PROCESSING', 'COMPLETED']),
  rejection_reason: z.string(),
  walkin_patient: z.number().nullable(),
  imaging_order: z.number().nullable(),
  processed_by: z.number().nullable(),
  processed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ExternalImagingOrderListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ExternalImagingOrderRequestSchema),
});
