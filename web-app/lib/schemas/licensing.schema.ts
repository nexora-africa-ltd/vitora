import { z } from 'zod';

export const LicenseStatusSchema = z.object({
  valid: z.boolean(),
  tier: z.string(),
  features: z.record(z.string(), z.boolean()),
  org_name: z.string(),
  subscription_status: z.string(),
  expires_at: z.number().nullable(),
  check_in_by: z.number().nullable(),
  check_in_overdue: z.boolean(),
  error: z.string(),
});

export const ActivationResponseSchema = z.object({
  license_token: z.string(),
  installation_id: z.string(),
  org_name: z.string(),
  tier: z.string(),
  features: z.record(z.string(), z.boolean()),
  expires_at: z.number(),
  check_in_by: z.number(),
});
