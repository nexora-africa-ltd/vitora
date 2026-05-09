import { z } from 'zod';

export const SubscriptionTierSchema = z.enum(['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']);

export const OrganizationListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  subscription_tier: SubscriptionTierSchema,
  subscription_plan: z.number().nullable(),
  plan_name: z.string().nullable(),
  is_active: z.boolean(),
  county_name: z.string().nullable(),
  facility_count: z.number(),
  staff_count: z.number(),
});

export const OrganizationDetailSchema = OrganizationListItemSchema.extend({
  logo: z.string().nullable(),
  contact_email: z.string(),
  contact_phone: z.string(),
  address: z.string(),
  county: z.number().nullable(),
  sub_county: z.number().nullable(),
  sub_county_name: z.string().nullable(),
  plan_features: z.record(z.boolean()).default({}),
  max_facilities: z.number().nullable(),
  max_users: z.number().nullable(),
  max_patients: z.number().nullable(),
  can_add_facility: z.boolean(),
  can_add_user: z.boolean(),
  can_add_patient: z.boolean(),
  // Subscription validity
  subscription_status: z.enum(['ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED']),
  subscription_valid_until: z.string().nullable(),
  is_subscription_expired: z.boolean(),
  // AI token usage
  monthly_ai_tokens: z.number().nullable(),
  ai_tokens_used: z.number(),
  ai_tokens_remaining: z.number().nullable(),
  ai_tokens_reset_at: z.string().nullable(),
  data_retention_years: z.number(),
  settings: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedOrganizationListSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(OrganizationListItemSchema),
});

export const FacilityTokenUsageSchema = z.object({
  id: z.number(),
  name: z.string(),
  tokens_used: z.number(),
});

export const OrgTokenUsageSchema = z.object({
  monthly_ai_tokens: z.number().nullable(),
  ai_tokens_used: z.number(),
  ai_tokens_remaining: z.number().nullable(),
  ai_tokens_reset_at: z.string().nullable(),
  facilities: z.array(FacilityTokenUsageSchema),
});
