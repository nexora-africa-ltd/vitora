// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Zod schemas for browser-safe DHA SHR consent lifecycle API responses. */

import { z } from 'zod';

export const SHRConsentVisitSchema = z.object({
  id: z.number(), patient: z.number(), encounter: z.number().nullable(), consent_id: z.string(), visit_id: z.string(),
  visit_type: z.enum(['OP', 'IP']), request_kind: z.enum(['STANDARD', 'EMERGENCY', 'DEPENDANT']),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CLOSURE_PENDING', 'CLOSED', 'FAILED']),
  otp_record: z.string(), requested_by: z.string(), practitioner_id: z.string(), representative_cr_id: z.string(),
  representative_relationship: z.string(), patient_capable: z.boolean(), emergency: z.boolean(),
  incapacity_reason: z.string(), start_date: z.string(), end_date: z.string().nullable(),
  approved_at: z.string().nullable(), closed_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});

export const SHRConsentVisitListSchema = z.array(SHRConsentVisitSchema);
