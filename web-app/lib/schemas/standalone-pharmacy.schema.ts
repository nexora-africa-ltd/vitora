/**
 * Zod schemas for standalone Pharmacy API responses.
 */

import { z } from 'zod';

export const WalkInCustomerSchema = z.object({
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

export const WalkInCustomerListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WalkInCustomerSchema),
});

export const ExternalPrescriptionRequestSchema = z.object({
  id: z.number(),
  message_control_id: z.string(),
  sending_application: z.string(),
  sending_facility: z.string(),
  prescriber_name: z.string(),
  prescriber_license: z.string(),
  external_patient_id: z.string(),
  patient_name: z.string(),
  patient_dob: z.string().nullable(),
  patient_gender: z.string(),
  patient_phone: z.string(),
  patient_id_number: z.string(),
  external_prescription_number: z.string(),
  priority: z.string(),
  clinical_info: z.string(),
  requested_items: z.array(
    z.object({
      drug_code: z.string().optional(),
      drug_name: z.string().optional(),
      dose: z.string().optional(),
      frequency: z.string().optional(),
      duration: z.string().optional(),
      quantity: z.number().optional(),
    })
  ),
  status: z.enum(['RECEIVED', 'ACCEPTED', 'REJECTED', 'PROCESSING', 'COMPLETED']),
  rejection_reason: z.string(),
  walkin_customer: z.number().nullable(),
  prescription: z.number().nullable(),
  processed_by: z.number().nullable(),
  processed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ExternalPrescriptionListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ExternalPrescriptionRequestSchema),
});
