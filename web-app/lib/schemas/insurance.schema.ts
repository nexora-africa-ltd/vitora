/**
 * Zod schemas for Insurance module API responses.
 *
 * Validates all shapes returned by the backend insurance endpoints.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const InsuranceProviderTypeSchema = z.enum([
  'private',
  'corporate',
  'community',
  'micro',
  'other',
]);

export const InsuranceProviderStatusSchema = z.enum([
  'active',
  'suspended',
  'inactive',
]);

export const InsurancePlanTypeSchema = z.enum([
  'individual',
  'family',
  'group',
  'corporate',
]);

export const InsuranceCoverageTypeSchema = z.enum([
  'inpatient',
  'outpatient',
  'comprehensive',
  'dental',
  'optical',
  'maternity',
]);

export const InsurancePlanStatusSchema = z.enum(['active', 'discontinued']);

export const PatientInsuranceMemberTypeSchema = z.enum([
  'principal',
  'spouse',
  'child',
  'dependent',
  'other',
]);

export const PatientInsuranceStatusSchema = z.enum([
  'active',
  'expired',
  'suspended',
  'cancelled',
  'pending_verification',
]);

export const InsuranceClaimStatusSchema = z.enum([
  'draft',
  'pending_preauth',
  'preauth_approved',
  'preauth_denied',
  'submitted',
  'acknowledged',
  'under_review',
  'query',
  'approved',
  'partially_approved',
  'rejected',
  'paid',
  'partially_paid',
  'appealed',
  'written_off',
  'cancelled',
]);

export const InsuranceClaimTypeSchema = z.enum([
  'outpatient',
  'inpatient',
  'dental',
  'optical',
  'maternity',
  'emergency',
]);

export const InsuranceClaimItemStatusSchema = z.enum([
  'pending',
  'approved',
  'partially_approved',
  'rejected',
]);

export const InsurancePreauthStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'denied',
  'expired',
  'cancelled',
]);

export const InsurancePreauthTypeSchema = z.enum([
  'admission',
  'surgery',
  'procedure',
  'investigation',
  'medication',
  'other',
]);

export const InsuranceRemittanceStatusSchema = z.enum([
  'received',
  'reconciled',
  'partial',
  'disputed',
]);

export const AccreditationStatusSchema = z.enum([
  'accredited',
  'pending',
  'expired',
  'not_accredited',
]);

export const SubmissionFormatSchema = z.enum([
  'api',
  'csv',
  'excel',
  'pdf',
  'manual',
]);

export const ApiAuthTypeSchema = z.enum([
  'none',
  'basic',
  'bearer',
  'oauth2',
  'api_key',
  'custom',
]);

// ---------------------------------------------------------------------------
// Model schemas
// ---------------------------------------------------------------------------

export const InsuranceProviderSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  provider_type: InsuranceProviderTypeSchema,
  status: InsuranceProviderStatusSchema,
  contact_email: z.string(),
  contact_phone: z.string(),
  contact_person: z.string(),
  address: z.string(),
  website: z.string(),
  api_integration_enabled: z.boolean(),
  logo: z.string().nullable(),
  notes: z.string(),
  plans_count: z.number(),
  active_enrollments_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const InsurancePlanSchema = z.object({
  id: z.number(),
  provider: z.number(),
  provider_name: z.string(),
  name: z.string(),
  code: z.string(),
  plan_type: InsurancePlanTypeSchema,
  coverage_type: InsuranceCoverageTypeSchema,
  default_copay_percent: z.string(),
  annual_limit: z.string().nullable(),
  per_visit_limit: z.string().nullable(),
  preauth_required: z.boolean(),
  preauth_threshold: z.string().nullable(),
  waiting_period_days: z.number(),
  exclusions: z.array(z.string()),
  status: InsurancePlanStatusSchema,
  effective_from: z.string().nullable(),
  effective_to: z.string().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PatientInsuranceSchema = z.object({
  id: z.number(),
  patient: z.number(),
  plan: z.number(),
  plan_name: z.string(),
  provider: z.number(),
  provider_name: z.string(),
  patient_name: z.string(),
  member_number: z.string(),
  policy_number: z.string(),
  member_type: PatientInsuranceMemberTypeSchema,
  principal_member: z.number().nullable(),
  principal_name: z.string(),
  employer: z.string(),
  status: PatientInsuranceStatusSchema,
  valid_from: z.string(),
  valid_to: z.string(),
  copay_override: z.string().nullable(),
  annual_balance: z.string().nullable(),
  is_primary: z.boolean(),
  is_valid: z.boolean(),
  copay_percent: z.string(),
  days_until_expiry: z.number(),
  verified_at: z.string().nullable(),
  verified_by: z.number().nullable(),
  notes: z.string(),
  card_image_front: z.string().nullable(),
  card_image_back: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const InsuranceProviderConfigSchema = z.object({
  id: z.number(),
  provider: z.number(),
  provider_name: z.string(),
  facility_name: z.string(),
  contract_number: z.string(),
  contract_start: z.string().nullable(),
  contract_end: z.string().nullable(),
  accreditation_status: AccreditationStatusSchema,
  accreditation_number: z.string(),
  api_base_url: z.string(),
  api_auth_type: ApiAuthTypeSchema,
  api_enabled: z.boolean(),
  max_claim_amount: z.string().nullable(),
  submission_format: SubmissionFormatSchema,
  is_contract_active: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const InsuranceClaimItemSchema = z.object({
  id: z.number(),
  claim: z.number(),
  invoice_item: z.number().nullable(),
  service_description: z.string(),
  service_code: z.string(),
  quantity: z.number(),
  unit_price: z.string(),
  claimed_amount: z.string(),
  approved_amount: z.string(),
  rejection_reason: z.string(),
  tariff_code: z.string(),
  status: InsuranceClaimItemStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const InsuranceClaimSchema = z.object({
  id: z.number(),
  claim_number: z.string(),
  invoice: z.number().nullable(),
  patient_insurance: z.number(),
  provider: z.number(),
  provider_name: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  member_number: z.string(),
  plan_name: z.string(),
  encounter: z.number().nullable(),
  preauth: z.number().nullable(),
  status: InsuranceClaimStatusSchema,
  claim_type: InsuranceClaimTypeSchema,
  diagnosis_codes: z.array(z.string()),
  service_date: z.string(),
  admission_date: z.string().nullable(),
  discharge_date: z.string().nullable(),
  submission_date: z.string().nullable(),
  total_amount: z.string(),
  approved_amount: z.string(),
  copay_amount: z.string(),
  paid_amount: z.string(),
  external_claim_id: z.string(),
  external_preauth_id: z.string(),
  rejection_reason: z.string(),
  query_details: z.string(),
  query_response: z.string(),
  submitted_by: z.number().nullable(),
  reviewed_by: z.number().nullable(),
  notes: z.string(),
  attachments_meta: z.array(z.object({
    filename: z.string(),
    url: z.string(),
    content_type: z.string().optional(),
    uploaded_at: z.string().optional(),
  })),
  days_since_submission: z.number().nullable(),
  is_overdue: z.boolean(),
  is_appealable: z.boolean(),
  items: z.array(InsuranceClaimItemSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const InsurancePreauthSchema = z.object({
  id: z.number(),
  preauth_number: z.string(),
  patient_insurance: z.number(),
  provider: z.number(),
  provider_name: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  member_number: z.string(),
  status: InsurancePreauthStatusSchema,
  preauth_type: InsurancePreauthTypeSchema,
  diagnosis_codes: z.array(z.string()),
  requested_services: z.array(
    z.object({
      description: z.string(),
      code: z.string().optional(),
      quantity: z.number().optional(),
      estimated_cost: z.string().optional(),
    })
  ),
  estimated_cost: z.string(),
  approved_amount: z.string().nullable(),
  validity_period_days: z.number().nullable(),
  approved_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  external_preauth_id: z.string(),
  clinical_notes: z.string(),
  rejection_reason: z.string(),
  submitted_by: z.number().nullable(),
  reviewed_by: z.number().nullable(),
  notes: z.string(),
  is_expired: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const InsuranceRemittanceLineSchema = z.object({
  id: z.number(),
  remittance: z.number(),
  claim: z.number().nullable(),
  claim_number: z.string(),
  member_number: z.string(),
  paid_amount: z.string(),
  deductions: z.string(),
  net_amount: z.string(),
  notes: z.string(),
  created_at: z.string(),
});

export const InsuranceRemittanceSchema = z.object({
  id: z.number(),
  provider: z.number(),
  provider_name: z.string(),
  remittance_number: z.string(),
  remittance_date: z.string(),
  total_amount: z.string(),
  reconciled_amount: z.string(),
  status: InsuranceRemittanceStatusSchema,
  payment_method: z.string(),
  payment_reference: z.string(),
  bank_reference: z.string(),
  received_at: z.string().nullable(),
  reconciled_at: z.string().nullable(),
  notes: z.string(),
  lines: z.array(InsuranceRemittanceLineSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PayerTariffSchema = z.object({
  id: z.number(),
  provider: z.number(),
  provider_name: z.string(),
  plan: z.number().nullable(),
  plan_name: z.string().nullable(),
  service: z.number().nullable(),
  service_name: z.string().nullable(),
  service_code: z.string(),
  payer_code: z.string(),
  payer_description: z.string(),
  tariff_amount: z.string(),
  facility_charge: z.string().nullable(),
  requires_preauth: z.boolean(),
  effective_from: z.string(),
  effective_to: z.string().nullable(),
  is_active: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ---------------------------------------------------------------------------
// Paginated wrappers
// ---------------------------------------------------------------------------

function paginated<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(schema),
  });
}

export const PaginatedInsuranceProvidersSchema = paginated(InsuranceProviderSchema);
export const PaginatedInsurancePlansSchema = paginated(InsurancePlanSchema);
export const PaginatedPatientInsurancesSchema = paginated(PatientInsuranceSchema);
export const PaginatedInsuranceClaimsSchema = paginated(InsuranceClaimSchema);
export const PaginatedInsurancePreauthsSchema = paginated(InsurancePreauthSchema);
export const PaginatedInsuranceRemittancesSchema = paginated(InsuranceRemittanceSchema);
export const PaginatedPayerTariffsSchema = paginated(PayerTariffSchema);
export const PaginatedProviderConfigsSchema = paginated(InsuranceProviderConfigSchema);
