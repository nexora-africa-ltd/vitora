import { z } from 'zod';

const numberLike = z.union([z.number(), z.string()]).pipe(z.coerce.number());

export const CoverageStatusSchema = z.enum(['covered', 'not_covered', 'pending']);

export const SHAEligibilityResponseSchema = z.object({
  is_eligible: z.boolean(),
  result: z.string(),
  eligible_until: z.string().optional().nullable(),
  benefit_balance: numberLike.optional().nullable(),
  ineligibility_reason: z.string().optional().nullable(),
  sha_number: z.string().optional().nullable(),
  membership_type: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
});

export const PatientSHAEligibilitySchema = SHAEligibilityResponseSchema.extend({
  patient_id: z.number(),
  checked_at: z.string(),
  coverage_status: CoverageStatusSchema,
});

export const SHADirectEligibilityResponseSchema = z.object({
  is_eligible: z.boolean(),
  sha_number: z.string().optional().nullable(),
  full_name: z.string().optional().nullable(),
  coverage_end_date: z.string().optional().nullable(),
  copay_percentage: numberLike.optional(),
  reason: z.string().optional().nullable(),
  is_employed: z.boolean().optional(),
  error: z.string().optional().nullable(),
});
