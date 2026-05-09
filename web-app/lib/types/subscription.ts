export type TierCode = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';

/**
 * Canonical feature keys and human-readable labels.
 * Must stay in sync with backend SubscriptionPlan.FEATURE_REGISTRY.
 */
export const FEATURE_LABELS: Record<string, string> = {
  // Module features
  outpatient: 'Outpatient (OPD)',
  inpatient: 'Inpatient (IPD)',
  emergency: 'Emergency / Casualty',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  imaging: 'Imaging / Radiology',
  theatre: 'Surgical Theatre',
  dialysis: 'Renal Dialysis',
  icu: 'ICU',
  maternity: 'Maternity / Obstetrics',
  mortuary: 'Mortuary',
  blood_bank: 'Blood Bank',
  inventory: 'Inventory / Supply Chain',
  billing: 'Billing & Invoicing',
  scheduling: 'Staff Rostering & Scheduling',
  // Platform features
  ai_assistant: 'AI Assistant (TibaBot)',
  sha_claims: 'SHA Claims Integration',
  dhis2_reporting: 'DHIS2 / KHIS Reporting',
  api_access: 'API Access',
  custom_reports: 'Custom Reports',
  offline_sync: 'Offline Sync',
  sms_notifications: 'SMS & WhatsApp Notifications',
};

export interface SubscriptionPlanListItem {
  id: number;
  code: TierCode;
  code_display: string;
  name: string;
  monthly_price: string;
  annual_price: string;
  max_facilities: number | null;
  max_users: number | null;
  monthly_ai_tokens: number | null;
  is_active: boolean;
  sort_order: number;
  has_trial: boolean;
}

export interface SubscriptionPlanDetail extends SubscriptionPlanListItem {
  description: string;
  annual_savings: string;
  max_patients: number | null;
  monthly_ai_tokens: number | null;
  features: Record<string, boolean>;
  trial_period_days: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlanCreateData {
  code: TierCode;
  name: string;
  description?: string;
  monthly_price?: string;
  annual_price?: string;
  max_facilities?: number | null;
  max_users?: number | null;
  max_patients?: number | null;
  monthly_ai_tokens?: number | null;
  features?: Record<string, boolean>;
  is_active?: boolean;
  sort_order?: number;
  trial_period_days?: number;
}

export type SubscriptionPlanUpdateData = Partial<Omit<SubscriptionPlanCreateData, 'code'>>;
