import { z } from 'zod';

export const TierCodeSchema = z.enum([
  'FREE',
  'BASIC',
  'PROFESSIONAL',
  'ENTERPRISE',
  'LIS_STANDALONE',
  'PHARMACY_STANDALONE',
  'IMAGING_STANDALONE',
  'DIAGNOSTIC_STANDALONE',
]);

export const SubscriptionPlanListItemSchema = z.object({
  id: z.number(),
  code: TierCodeSchema,
  code_display: z.string(),
  name: z.string(),
  monthly_price: z.string(),
  annual_price: z.string(),
  max_facilities: z.number().nullable(),
  max_users: z.number().nullable(),
  monthly_ai_tokens: z.number().nullable(),
  is_active: z.boolean(),
  sort_order: z.number(),
  has_trial: z.boolean(),
});

export const SubscriptionPlanDetailSchema = SubscriptionPlanListItemSchema.extend({
  description: z.string(),
  annual_savings: z.string(),
  max_patients: z.number().nullable(),
  monthly_ai_tokens: z.number().nullable(),
  features: z.record(z.boolean()),
  trial_period_days: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedSubscriptionPlanListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SubscriptionPlanListItemSchema),
});

export const SubscriptionPeriodSchema = z.object({
  id: z.number(),
  organization: z.number(),
  plan: z.number(),
  billing_interval: z.enum(['MONTHLY', 'ANNUAL']),
  amount: z.string(),
  currency: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  status: z.enum(['PENDING', 'PAID', 'VOID']),
  payment_reference: z.string(),
  confirmed_at: z.string().nullable(),
  confirmed_by: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedSubscriptionPeriodSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SubscriptionPeriodSchema),
});
