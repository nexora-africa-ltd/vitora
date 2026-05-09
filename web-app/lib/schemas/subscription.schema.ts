import { z } from 'zod';

export const TierCodeSchema = z.enum(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']);

export const SubscriptionPlanListItemSchema = z.object({
  id: z.number(),
  code: TierCodeSchema,
  code_display: z.string(),
  name: z.string(),
  monthly_price: z.string(),
  annual_price: z.string(),
  max_facilities: z.number().nullable(),
  max_users: z.number().nullable(),
  is_active: z.boolean(),
  sort_order: z.number(),
  has_trial: z.boolean(),
});

export const SubscriptionPlanDetailSchema = SubscriptionPlanListItemSchema.extend({
  description: z.string(),
  annual_savings: z.string(),
  max_patients: z.number().nullable(),
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
