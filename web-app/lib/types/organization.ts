export type SubscriptionTier = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface OrganizationListItem {
  id: number;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  subscription_plan: number | null;
  plan_name: string | null;
  is_active: boolean;
  county_name: string | null;
  facility_count: number;
  staff_count: number;
}

export interface OrganizationDetail extends OrganizationListItem {
  logo: string | null;
  contact_email: string;
  contact_phone: string;
  address: string;
  county: number | null;
  sub_county: number | null;
  sub_county_name: string | null;
  plan_features: Record<string, boolean>;
  max_facilities: number | null;
  max_users: number | null;
  max_patients: number | null;
  can_add_facility: boolean;
  can_add_user: boolean;
  can_add_patient: boolean;
  // Subscription validity
  subscription_status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED';
  subscription_valid_until: string | null;
  is_subscription_expired: boolean;
  // AI token usage
  monthly_ai_tokens: number | null;
  ai_tokens_used: number;
  ai_tokens_remaining: number | null;
  ai_tokens_reset_at: string | null;
  data_retention_years: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreateData {
  name: string;
  slug?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  county?: number | null;
  sub_county?: number | null;
  subscription_plan?: number | null;
}

export interface OrganizationUpdateData extends Partial<OrganizationCreateData> {
  is_active?: boolean;
  data_retention_years?: number;
  settings?: Record<string, unknown>;
  subscription_plan?: number | null;
}

export interface FacilityTokenUsage {
  id: number;
  name: string;
  tokens_used: number;
}

export interface OrgTokenUsage {
  monthly_ai_tokens: number | null;
  ai_tokens_used: number;
  ai_tokens_remaining: number | null;
  ai_tokens_reset_at: string | null;
  facilities: FacilityTokenUsage[];
}
