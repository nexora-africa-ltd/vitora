/**
 * TypeScript types for the Insurance module.
 *
 * Covers: providers, plans, patient enrollments, claims, preauths,
 * remittances, tariffs, and provider configs.
 */

// ---------------------------------------------------------------------------
// Enums / Status unions
// ---------------------------------------------------------------------------

export type InsuranceProviderType =
  | 'private'
  | 'corporate'
  | 'community'
  | 'micro'
  | 'other';

export type InsuranceProviderStatus = 'active' | 'suspended' | 'inactive';

export type InsurancePlanType = 'individual' | 'family' | 'group' | 'corporate';

export type InsuranceCoverageType =
  | 'inpatient'
  | 'outpatient'
  | 'comprehensive'
  | 'dental'
  | 'optical'
  | 'maternity';

export type InsurancePlanStatus = 'active' | 'discontinued';

export type PatientInsuranceMemberType =
  | 'principal'
  | 'spouse'
  | 'child'
  | 'dependent'
  | 'other';

export type PatientInsuranceStatus =
  | 'active'
  | 'expired'
  | 'suspended'
  | 'cancelled'
  | 'pending_verification';

export type InsuranceClaimStatus =
  | 'draft'
  | 'pending_preauth'
  | 'preauth_approved'
  | 'preauth_denied'
  | 'submitted'
  | 'acknowledged'
  | 'under_review'
  | 'query'
  | 'approved'
  | 'partially_approved'
  | 'rejected'
  | 'paid'
  | 'partially_paid'
  | 'appealed'
  | 'written_off'
  | 'cancelled';

export type InsuranceClaimType =
  | 'outpatient'
  | 'inpatient'
  | 'dental'
  | 'optical'
  | 'maternity'
  | 'emergency';

export type InsuranceClaimItemStatus =
  | 'pending'
  | 'approved'
  | 'partially_approved'
  | 'rejected';

export type InsurancePreauthStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'cancelled';

export type InsurancePreauthType =
  | 'admission'
  | 'surgery'
  | 'procedure'
  | 'investigation'
  | 'medication'
  | 'other';

export type InsuranceRemittanceStatus =
  | 'received'
  | 'reconciled'
  | 'partial'
  | 'disputed';

export type AccreditationStatus =
  | 'accredited'
  | 'pending'
  | 'expired'
  | 'not_accredited';

export type SubmissionFormat = 'api' | 'csv' | 'excel' | 'pdf' | 'manual';

export type ApiAuthType =
  | 'none'
  | 'basic'
  | 'bearer'
  | 'oauth2'
  | 'api_key'
  | 'custom';

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

export const PROVIDER_TYPE_LABELS: Record<InsuranceProviderType, string> = {
  private: 'Private',
  corporate: 'Corporate',
  community: 'Community-Based',
  micro: 'Micro-Insurance',
  other: 'Other',
};

export const CLAIM_STATUS_LABELS: Record<InsuranceClaimStatus, string> = {
  draft: 'Draft',
  pending_preauth: 'Pending Pre-auth',
  preauth_approved: 'Pre-auth Approved',
  preauth_denied: 'Pre-auth Denied',
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  under_review: 'Under Review',
  query: 'Query',
  approved: 'Approved',
  partially_approved: 'Partially Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  partially_paid: 'Partially Paid',
  appealed: 'Appealed',
  written_off: 'Written Off',
  cancelled: 'Cancelled',
};

export const PREAUTH_STATUS_LABELS: Record<InsurancePreauthStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface InsuranceProvider {
  id: number;
  name: string;
  code: string;
  provider_type: InsuranceProviderType;
  status: InsuranceProviderStatus;
  contact_email: string;
  contact_phone: string;
  contact_person: string;
  address: string;
  website: string;
  api_integration_enabled: boolean;
  logo: string | null;
  notes: string;
  plans_count: number;
  active_enrollments_count: number;
  created_at: string;
  updated_at: string;
}

export interface InsuranceProviderCreateInput {
  name: string;
  code: string;
  provider_type?: InsuranceProviderType;
  status?: InsuranceProviderStatus;
  contact_email?: string;
  contact_phone?: string;
  contact_person?: string;
  address?: string;
  website?: string;
  api_integration_enabled?: boolean;
  notes?: string;
}

export interface InsurancePlan {
  id: number;
  provider: number;
  provider_name: string;
  name: string;
  code: string;
  plan_type: InsurancePlanType;
  coverage_type: InsuranceCoverageType;
  default_copay_percent: string;
  annual_limit: string | null;
  per_visit_limit: string | null;
  preauth_required: boolean;
  preauth_threshold: string | null;
  waiting_period_days: number;
  exclusions: string[];
  status: InsurancePlanStatus;
  effective_from: string | null;
  effective_to: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InsurancePlanCreateInput {
  provider: number;
  name: string;
  code: string;
  plan_type?: InsurancePlanType;
  coverage_type?: InsuranceCoverageType;
  default_copay_percent?: string;
  annual_limit?: string | null;
  per_visit_limit?: string | null;
  preauth_required?: boolean;
  preauth_threshold?: string | null;
  waiting_period_days?: number;
  exclusions?: string[];
  status?: InsurancePlanStatus;
  effective_from?: string | null;
  effective_to?: string | null;
  notes?: string;
}

export interface PatientInsurance {
  id: number;
  patient: number;
  plan: number;
  plan_name: string;
  provider: number;
  provider_name: string;
  patient_name: string;
  member_number: string;
  policy_number: string;
  member_type: PatientInsuranceMemberType;
  principal_member: number | null;
  principal_name: string;
  employer: string;
  status: PatientInsuranceStatus;
  valid_from: string;
  valid_to: string;
  copay_override: string | null;
  annual_balance: string | null;
  is_primary: boolean;
  is_valid: boolean;
  copay_percent: string;
  days_until_expiry: number;
  verified_at: string | null;
  verified_by: number | null;
  last_eligibility_checked_at: string | null;
  last_eligibility_eligible: boolean | null;
  last_eligibility_status: string;
  last_eligibility_payload: Record<string, unknown>;
  notes: string;
  card_image_front: string | null;
  card_image_back: string | null;
  has_card_image_front?: boolean;
  has_card_image_back?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientInsuranceCreateInput {
  patient: number;
  plan: number;
  member_number: string;
  policy_number?: string;
  member_type?: PatientInsuranceMemberType;
  principal_member?: number | null;
  principal_name?: string;
  employer?: string;
  status?: PatientInsuranceStatus;
  valid_from: string;
  valid_to: string;
  copay_override?: string | null;
  annual_balance?: string | null;
  is_primary?: boolean;
  card_image_front?: string | File | null;
  card_image_back?: string | File | null;
  remove_card_image_front?: boolean;
  remove_card_image_back?: boolean;
  notes?: string;
}

export interface InsuranceProviderConfig {
  id: number;
  provider: number;
  provider_name: string;
  facility_name: string;
  contract_number: string;
  contract_start: string | null;
  contract_end: string | null;
  accreditation_status: AccreditationStatus;
  accreditation_number: string;
  api_base_url: string;
  auth_base_url: string;
  provider_edi_base_url: string;
  provider_is_base_url: string;
  health_crm_base_url: string;
  api_auth_type: ApiAuthType;
  api_enabled: boolean;
  healthcloud_enabled: boolean;
  payer_slade_code: number | null;
  require_visit_authorization: boolean;
  require_balance_reservation: boolean;
  max_claim_amount: string | null;
  submission_format: SubmissionFormat;
  is_contract_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InsuranceProviderConfigCreateInput {
  provider: number;
  contract_number?: string;
  contract_start?: string | null;
  contract_end?: string | null;
  accreditation_status?: AccreditationStatus;
  accreditation_number?: string;
  api_base_url?: string;
  api_auth_type?: ApiAuthType;
  api_key?: string;
  api_secret?: string;
  api_username?: string;
  api_password?: string;
  api_token?: string;
  api_enabled?: boolean;
  auth_base_url?: string;
  provider_edi_base_url?: string;
  provider_is_base_url?: string;
  health_crm_base_url?: string;
  healthcloud_enabled?: boolean;
  payer_slade_code?: number | null;
  require_visit_authorization?: boolean;
  require_balance_reservation?: boolean;
  max_claim_amount?: string | null;
  submission_format?: SubmissionFormat;
  notes?: string;
}

export type InsuranceVisitAuthorizationStatus =
  | 'pending'
  | 'otp_requested'
  | 'authorized'
  | 'validated'
  | 'failed'
  | 'expired';

export interface InsuranceVisitAuthorization {
  id: number;
  enrollment: number;
  provider_config: number;
  patient: number;
  patient_name: string;
  encounter: number | null;
  member_number: string;
  payer_slade_code: number | null;
  benefit_type: string;
  benefit_code: string;
  policy_number: string;
  beneficiary_id: number | null;
  beneficiary_contact_id: number | null;
  beneficiary_contact_value: string;
  selected_beneficiary_contact_id: number | null;
  selected_beneficiary_contact_value: string;
  selected_benefit_type: string;
  selected_benefit_code: string;
  factors: string[];
  eligibility_payload: Record<string, unknown>;
  workflow_step: string;
  status: InsuranceVisitAuthorizationStatus;
  auth_token: string;
  authorization_guid: string;
  authorization_date: string | null;
  auth_expiry: string | null;
  auth_status: string;
  last_error: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RequestOTPInput {
  contact_id: number;
}

export interface StartVisitInput {
  beneficiary_id: number;
  benefit_type: string;
  benefit_code: string;
  policy_number: string;
  policy_effective_date: string;
  otp?: string;
  beneficiary_contact: number;
  factors?: string[];
  scheme_name?: string;
  scheme_code?: string;
  encounter?: number;
}

export interface ValidateAuthorizationInput {
  first_name: string;
  last_name: string;
  other_names?: string;
  member_number: string;
  auth_token: string;
  visit_type?: 'OUTPATIENT' | 'INPATIENT';
  scheme_code?: string;
  scheme_name?: string;
  payer_code?: string;
}

export interface ReserveBalanceInput {
  authorization_id: number;
  amount: string;
  invoice_number: string;
}

export interface SubmitInvoiceInput {
  claim?: string;
  invoice_number: string;
  invoice_date?: string;
  copays?: Array<Record<string, unknown>>;
  lines?: Array<Record<string, unknown>>;
}

export interface SubmitCreditNoteInput {
  claim?: string;
  invoice_number: string;
  invoice_date: string;
  lines: Array<Record<string, unknown>>;
}

export interface UploadClaimAttachmentInput {
  claim?: string;
  attachment: string;
  attachment_type: string;
  description?: string;
}

export interface UploadClaimAttachmentFileInput {
  attachment_type?: string;
  description?: string;
}

export interface UploadClaimAttachmentFileResult {
  attachment_ref: string;
  upload: Record<string, unknown>;
  attachment: Record<string, unknown>;
}

export interface VerifyViaHealthcloudResult {
  eligible: boolean;
  status: string;
  plan_name: string;
  member_number: string;
  annual_balance: string | null;
  copay_percent: string | null;
  message: string;
  raw_response: Record<string, unknown>;
  resolved_plan_id?: number | null;
  resolved_plan_name?: string;
  resolved_plan_code?: string;
}

export interface HealthcloudSessionStartResult {
  session: InsuranceVisitAuthorization;
  eligibility: VerifyViaHealthcloudResult;
}

export interface HealthcloudPostProfileInput {
  profile_id?: string;
  first_name?: string;
  last_name?: string;
  other_name?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  date_of_birth?: string;
  enrolment_date?: string;
  slade_code?: string;
  service_name?: string;
  contacts?: Array<Record<string, unknown>>;
  identifiers?: Array<Record<string, unknown>>;
}

export interface HealthcloudGetHealthIdInput {
  profile_id?: string;
}

export interface HealthcloudIdentityWorkflowResult {
  enrollment: PatientInsurance;
  identity: Record<string, unknown>;
}

export interface HealthcloudSessionRequestOTPInput {
  session_id: number;
  contact_id: number;
}

export interface HealthcloudSessionStartVisitInput extends StartVisitInput {
  session_id: number;
}

export interface VerifyEnrollmentPreviewInput {
  plan?: number;
  provider?: number;
  member_number: string;
  policy_number?: string;
}

export interface SladeDefaultsSeedResult {
  created_providers: number;
  updated_providers: number;
  created_configs: number;
  updated_configs: number;
}

export interface HealthcloudReserveBalanceResult {
  id: number;
  reservation_guid: string;
  status: string;
  invoice_number: string;
  amount: string;
}

export interface HealthcloudSyncStatus {
  facility_id: number;
  sync: {
    pending: number;
    failed: number;
    success: number;
    total: number;
  };
  remittances: {
    total: number;
    received: number;
    partial: number;
    reconciled: number;
    disputed: number;
  };
  failed_items?: Array<{
    id: number;
    operation: string;
    status: string;
    attempt_count: number;
    claim_id: number | null;
    claim_number: string;
    preauth_id: number | null;
    authorization_id: number | null;
    correlation_id: string;
    error: string;
    bucket: {
      code: string;
      label: string;
    };
    created_at: string;
    updated_at: string;
  }>;
  failure_buckets?: Array<{
    code: string;
    label: string;
    count: number;
  }>;
  sync_items?: Array<{
    id: number;
    operation: string;
    status: string;
    attempt_count: number;
    claim_id: number | null;
    claim_number: string;
    preauth_id: number | null;
    authorization_id: number | null;
    correlation_id: string;
    error: string;
    bucket: {
      code: string;
      label: string;
    };
    created_at: string;
    updated_at: string;
  }>;
  remittance_items?: Array<{
    id: number;
    remittance_number: string;
    provider_id: number;
    provider_name: string;
    status: string;
    total_amount: string;
    reconciled_amount: string;
    payment_reference: string;
    bank_reference: string;
    remittance_date: string;
    updated_at: string;
  }>;
}

export interface InsuranceClaimItem {
  id: number;
  claim: number;
  invoice_item: number | null;
  service_description: string;
  service_code: string;
  quantity: number;
  unit_price: string;
  claimed_amount: string;
  approved_amount: string;
  rejection_reason: string;
  tariff_code: string;
  status: InsuranceClaimItemStatus;
  created_at: string;
  updated_at: string;
}

export interface InsuranceClaim {
  id: number;
  claim_number: string;
  invoice: number | null;
  patient_insurance: number;
  provider: number;
  provider_name: string;
  patient: number;
  patient_name: string;
  member_number: string;
  plan_name: string;
  encounter: number | null;
  preauth: number | null;
  status: InsuranceClaimStatus;
  claim_type: InsuranceClaimType;
  diagnosis_codes: string[];
  service_date: string;
  admission_date: string | null;
  discharge_date: string | null;
  submission_date: string | null;
  total_amount: string;
  approved_amount: string;
  copay_amount: string;
  paid_amount: string;
  external_claim_id: string;
  external_preauth_id: string;
  rejection_reason: string;
  query_details: string;
  query_response: string;
  submitted_by: number | null;
  reviewed_by: number | null;
  notes: string;
  attachments_meta: Array<{
    filename: string;
    url: string;
    content_type?: string;
    uploaded_at?: string;
  }>;
  days_since_submission: number | null;
  is_overdue: boolean;
  is_appealable: boolean;
  is_healthcloud_enabled: boolean;
  latest_balance_reservation: {
    id: number;
    reservation_guid: string;
    status: string;
    invoice_number: string;
    amount: string;
    created_at: string;
  } | null;
  latest_submit_claim_external: Record<string, unknown> | null;
  items: InsuranceClaimItem[];
  created_at: string;
  updated_at: string;
}

export interface InsuranceClaimCreateInput {
  invoice?: number | null;
  patient_insurance: number;
  patient: number;
  encounter?: number | null;
  preauth?: number | null;
  claim_type?: InsuranceClaimType;
  diagnosis_codes?: string[];
  service_date?: string;
  admission_date?: string | null;
  discharge_date?: string | null;
  total_amount: string;
  copay_amount?: string;
  notes?: string;
  items?: Array<{
    service_description: string;
    service_code?: string;
    quantity?: number;
    unit_price: string;
    claimed_amount: string;
    tariff_code?: string;
  }>;
}

export interface InsurancePreauth {
  id: number;
  preauth_number: string;
  patient_insurance: number;
  provider: number;
  provider_name: string;
  patient: number;
  patient_name: string;
  member_number: string;
  status: InsurancePreauthStatus;
  preauth_type: InsurancePreauthType;
  diagnosis_codes: string[];
  requested_services: Array<{
    description: string;
    code?: string;
    quantity?: number;
    estimated_cost?: string;
  }>;
  estimated_cost: string;
  approved_amount: string | null;
  validity_period_days: number | null;
  approved_at: string | null;
  expires_at: string | null;
  external_preauth_id: string;
  clinical_notes: string;
  rejection_reason: string;
  submitted_by: number | null;
  reviewed_by: number | null;
  notes: string;
  is_expired: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InsurancePreauthCreateInput {
  patient_insurance: number;
  patient: number;
  preauth_type?: InsurancePreauthType;
  diagnosis_codes?: string[];
  requested_services?: Array<{
    description: string;
    code?: string;
    quantity?: number;
    estimated_cost?: string;
  }>;
  estimated_cost?: string;
  clinical_notes?: string;
  notes?: string;
}

export interface InsuranceRemittanceLine {
  id: number;
  remittance: number;
  claim: number | null;
  claim_number: string;
  member_number: string;
  paid_amount: string;
  deductions: string;
  net_amount: string;
  notes: string;
  created_at: string;
}

export interface InsuranceRemittance {
  id: number;
  provider: number;
  provider_name: string;
  remittance_number: string;
  remittance_date: string;
  total_amount: string;
  reconciled_amount: string;
  status: InsuranceRemittanceStatus;
  payment_method: string;
  payment_reference: string;
  bank_reference: string;
  received_at: string | null;
  reconciled_at: string | null;
  notes: string;
  lines: InsuranceRemittanceLine[];
  created_at: string;
  updated_at: string;
}

export interface InsuranceRemittanceCreateInput {
  provider: number;
  remittance_number: string;
  remittance_date: string;
  total_amount: string;
  payment_method?: string;
  payment_reference?: string;
  bank_reference?: string;
  received_at?: string | null;
  notes?: string;
}

export interface RemittanceDrilldownClaim {
  claim_id?: string | number;
  claim_number?: string;
  provider_invoice_no?: string;
  proposed_amount?: string | number;
  approved_amount?: string | number;
  balanced_paid_amount?: string | number;
  balance_invoiced_amount?: string | number;
  copay_amount?: string | number;
  [key: string]: unknown;
}

export interface InsuranceRemittanceClaimsDrilldown {
  remittance: InsuranceRemittance;
  drilldown: {
    remittance_reference: string;
    claims: RemittanceDrilldownClaim[];
    processed: number;
    local_lines: number;
  };
}

export interface PayerTariff {
  id: number;
  provider: number;
  provider_name: string;
  plan: number | null;
  plan_name: string | null;
  service: number | null;
  service_name: string | null;
  service_code: string;
  payer_code: string;
  payer_description: string;
  tariff_amount: string;
  facility_charge: string | null;
  requires_preauth: boolean;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PayerTariffCreateInput {
  provider: number;
  plan?: number | null;
  service?: number | null;
  service_code: string;
  payer_code: string;
  payer_description?: string;
  tariff_amount: string;
  facility_charge?: string | null;
  requires_preauth?: boolean;
  effective_from: string;
  effective_to?: string | null;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Paginated response
// ---------------------------------------------------------------------------

export interface PaginatedInsuranceResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface InsuranceClaimFilters {
  search?: string;
  status?: InsuranceClaimStatus;
  provider?: number;
  patient?: number;
  claim_type?: InsuranceClaimType;
  service_date_after?: string;
  service_date_before?: string;
  page?: number;
}

export interface InsurancePreauthFilters {
  search?: string;
  status?: InsurancePreauthStatus;
  provider?: number;
  patient?: number;
  preauth_type?: InsurancePreauthType;
  page?: number;
}
