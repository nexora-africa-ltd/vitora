export type SubscriptionTier = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface OrganizationListItem {
  id: number;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
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
  max_facilities: number | null;
  max_users: number | null;
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
  subscription_tier?: SubscriptionTier;
  max_facilities?: number;
  max_users?: number;
}

export interface OrganizationUpdateData extends Partial<OrganizationCreateData> {
  is_active?: boolean;
  data_retention_years?: number;
  settings?: Record<string, unknown>;
}
