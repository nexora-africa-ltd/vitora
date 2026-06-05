/**
 * Zod schemas for SHA (Social Health Authority) API response validation
 *
 * Implements validation for all SHA-related API responses including:
 * - Client Registry lookups
 * - Eligibility verification
 * - SHA Members
 * - Terminology (ICD-11, ICHI, LOINC, Drugs)
 * - Claims management
 * - Facility/Practitioner validation
 *
 * See lib/types/sha.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const SchemeCategorySchema = z.enum([
  'SHIF_EMPLOYED',
  'SHIF_SELF_EMPLOYED',
  'SHIF_INDIGENT',
  'SHIF_ELDERLY',
  'SHIF_PWD',
  'SHIF_STUDENT',
  'NHIF_LEGACY',
  'UNKNOWN',
]);

export const PFMSCategorySchema = z.enum([
  'vulnerable',
  'elderly',
  'disabled',
  'orphan',
  'indigent',
]);

export const CoverageTypeSchema = z.enum(['sha', 'pfms', 'both']);

export const ClaimStatusSchema = z.enum([
  'draft',
  'validated',
  'pending_submission',
  'pending',
  'submitted',
  'acknowledged',
  'under_review',
  'processing',
  'query',
  'approved',
  'partial',
  'partial_approved',
  'rejected',
  'appealed',
  'paid',
  'written_off',
  'cancelled',
]);

export const ClaimItemStatusSchema = z.enum(['pending', 'approved', 'rejected', 'adjusted']);

export const MembershipTypeSchema = z.enum(['PRINCIPAL', 'SPOUSE', 'CHILD', 'PARENT', 'OTHER', 'principal', 'spouse', 'child', 'parent', 'other']);

export const MemberStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'PENDING_VERIFICATION',
  'SUSPENDED',
  'EXPIRED',
  'active',
  'inactive',
  'pending_verification',
  'suspended',
  'expired',
]);

// Use SHAGenderSchema internally to avoid conflict with patient.schema GenderSchema
const SHAGenderSchema = z.string();

// =============================================================================
// CLIENT REGISTRY SCHEMAS
// =============================================================================

// Nested: other identification documents (SHA Number, Household Number, etc.)
export const CROtherIdentificationSchema = z.object({
  identification_type: z.string(),
  identification_number: z.string(),
});

// Nested: dependant record from CR
export const CRDependantPersonSchema = z.object({
  id: z.string().nullish(),
  resourceType: z.string().nullish(),
  first_name: z.string().nullish(),
  middle_name: z.string().nullish(),
  last_name: z.string().nullish(),
  gender: z.string().nullish(),
  date_of_birth: z.string().nullish(),
  place_of_birth: z.string().nullish(),
  citizenship: z.string().nullish(),
  employment_type: z.string().nullish(),
  civil_status: z.string().nullish(),
  identification_type: z.string().nullish(),
  identification_number: z.string().nullish(),
  other_identifications: z.array(CROtherIdentificationSchema).nullish(),
  phone: z.string().nullish(),
  country: z.string().nullish(),
  county: z.string().nullish(),
  sub_county: z.string().nullish(),
  ward: z.string().nullish(),
  village_estate: z.string().nullish(),
  province_state_country: z.string().nullish(),
  zip_code: z.string().nullish(),
  postal_address: z.string().nullish(),
  id_serial: z.string().nullish(),
});

export const CRDependantGroupSchema = z.object({
  relationship: z.string().nullish(),
  total: z.number().nullish(),
  date_added: z.string().nullish(),
  result: z.array(CRDependantPersonSchema).nullish(),
});

export const ClientRegistryClientSchema = z.object({
  client_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  middle_name: z.string().nullish(),
  date_of_birth: z.string(),
  gender: SHAGenderSchema,
  national_id: z.string().nullish(),
  huduma_number: z.string().nullish(),
  passport_number: z.string().nullish(),
  alien_id: z.string().nullish(),
  kra_pin: z.string().nullish(),
  mandate_number: z.string().nullish(),
  phone_number: z.string().nullish(),
  email: z.string().nullish(),
  county: z.string().nullish(),
  sub_county: z.string().nullish(),
  ward: z.string().nullish(),
  address: z.string().nullish(),
  citizenship: z.string().nullish(),
  place_of_birth: z.string().nullish(),
  is_person_with_disability: z.boolean().nullish(),
  // Optional extras surfaced via ILM /api/v1/patients
  civil_status: z.string().nullish(),
  employment_type: z.string().nullish(),
  village_estate: z.string().nullish(),
  country: z.string().nullish(),
  zip_code: z.string().nullish(),
  id_serial: z.string().nullish(),
  // Nested: other identifiers (SHA Number, Household Number, etc.)
  other_identifications: z.array(CROtherIdentificationSchema).nullish(),
  // Nested: dependants
  dependants: z.array(CRDependantGroupSchema).nullish(),
});

export type ClientRegistryClientSchemaType = z.infer<typeof ClientRegistryClientSchema>;

export const ClientRegistryFetchResponseSchema = z.object({
  found: z.boolean(),
  client: ClientRegistryClientSchema.optional(),
  message: z.string().optional(),
});

export type ClientRegistryFetchResponseSchemaType = z.infer<typeof ClientRegistryFetchResponseSchema>;

export const ClientRegistryRegisterResponseSchema = z.object({
  success: z.boolean(),
  client_number: z.string().optional(),
  message: z.string().optional(),
});

export type ClientRegistryRegisterResponseSchemaType = z.infer<typeof ClientRegistryRegisterResponseSchema>;

export const ClientRegistryUpdateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type ClientRegistryUpdateResponseSchemaType = z.infer<typeof ClientRegistryUpdateResponseSchema>;

// =============================================================================
// SHA MEMBER SCHEMAS
// =============================================================================

export const SHAMemberSchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string().optional(),
  patient_mrn: z.string().optional(),
  sha_member_number: z.string().optional(),
  sha_number: z.string().optional(),
  scheme_category: SchemeCategorySchema.optional(),
  coverage_start_date: z.string(),
  coverage_end_date: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  membership_type: MembershipTypeSchema.optional(),
  principal_sha_number: z.string().optional(),
  status: MemberStatusSchema.optional(),
  national_id: z.string().optional(),
  eligibility_display: z.string().optional(),
  eligibility_valid_until: z.string().optional().nullable(),
  last_eligibility_check: z.string().optional().nullable(),
  is_pfms_eligible: z.boolean(),
  pfms_category: z.union([PFMSCategorySchema, z.literal('')]).optional().nullable(),
  pfms_category_display: z.string().optional().nullable(),
  pfms_verified: z.boolean(),
  pfms_verified_at: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SHAMemberSchemaType = z.infer<typeof SHAMemberSchema>;

// =============================================================================
// ELIGIBILITY SCHEMAS
// =============================================================================

export const EligibilityCheckResponseSchema = z.object({
  is_eligible: z.boolean(),
  coverage_end_date: z.string().optional(),
  copay_percentage: z.number(),
  scheme_category: SchemeCategorySchema.optional(),
  verified_name: z.string().optional(),
  checked_at: z.string(),
  message: z.string().optional(),
  // Facility-aware coverage (DHA HIE).
  eligible_schemes: z.array(z.string()).optional(),
  billable_schemes: z.array(z.string()).optional(),
  coverage_caveat: z.string().optional(),
  coverage_blocked: z.boolean().optional(),
});

export type EligibilityCheckResponseSchemaType = z.infer<typeof EligibilityCheckResponseSchema>;

export const MeansTestingDetailsSchema = z.object({
  record_id: z.string().optional(),
  contribution: z.number().optional(),
  monthly_contribution: z.number().optional(),
  annual_contribution: z.number().optional(),
  mt_date: z.string().optional(),
  appeal_status: z.string().optional(),
  income_prediction_category: z.string().optional(),
  means_testing_done: z.number().optional(),
});

export const SHADependentSchema = z.object({
  name: z.string(),
  relationship: z.string().optional(),
  date_of_birth: z.string().optional(),
  age: z.number().optional(),
  sha_number: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const SHAEligibilitySchemePolicySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  number: z.string().optional(),
});

export const SHAEligibilitySchemeCoverageSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  message: z.string().optional(),
  reason: z.string().optional(),
  status: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
});

export const SHAEligibilityPrincipalContributorSchema = z.object({
  idNumber: z.string().optional(),
  idType: z.string().optional(),
  crNumber: z.string().optional(),
  name: z.string().optional(),
  relationship: z.string().optional(),
  employmentType: z.string().optional(),
  employerDetails: z.object({
    name: z.string().optional(),
  }).optional(),
});

export const SHAEligibilitySchemeSchema = z.object({
  schemeName: z.string().optional(),
  schemeId: z.number().optional(),
  memberType: z.string().optional(),
  policy: SHAEligibilitySchemePolicySchema.optional(),
  coverage: SHAEligibilitySchemeCoverageSchema.optional(),
  principalContributor: SHAEligibilityPrincipalContributorSchema.optional(),
});

export const DirectEligibilityCheckResponseSchema = z.object({
  is_eligible: z.boolean(),
  sha_number: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  coverage_end_date: z.string().nullable().optional(),
  copay_percentage: z.number(),
  reason: z.string().optional(),
  possible_solution: z.string().nullable().optional(),
  is_employed: z.boolean().optional(),
  employment_type: z.string().nullable().optional(),
  employer_name: z.string().nullable().optional(),
  nhif_transition_status: z.string().nullable().optional(),
  status_code: z.string().nullable().optional(),
  status_desc: z.string().nullable().optional(),
  member_cr_number: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  age: z.number().nullable().optional(),
  whitelisted_for_otp: z.boolean().optional(),
  schemes: z.array(SHAEligibilitySchemeSchema).optional(),
  means_testing: MeansTestingDetailsSchema.nullable().optional(),
  dependents: z.array(SHADependentSchema).optional(),
  dependents_covered: z.number().optional(),
  raw_response: z.record(z.unknown()).optional(),
  error: z.string().nullable().optional(),
});

export type DirectEligibilityCheckResponseSchemaType = z.infer<typeof DirectEligibilityCheckResponseSchema>;

// =============================================================================
// TERMINOLOGY SCHEMAS
// =============================================================================

export const ICD11CodeSchema = z.object({
  id: z.number(),
  code: z.string(),
  title: z.string(),
  description: z.string().optional(),
  chapter: z.string().optional(),
  block: z.string().optional(),
  is_active: z.boolean(),
});

export type ICD11CodeSchemaType = z.infer<typeof ICD11CodeSchema>;

export const SHAInterventionSchema = z.object({
  // `id` is the DB primary key for stored intervention records, but the
  // `/api/billing/terminology/interventions/` endpoint returns lightweight
  // dicts from the local JSONL fallback without an `id` — make it optional.
  id: z.number().optional(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional().default(''),
  // Backend may return Decimal-as-string, number, or null. Coerce to number,
  // treating null/missing as 0.
  price: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return Number.isNaN(n) ? 0 : n;
    }),
  currency: z.string().optional().default('KES'),
  // Some records have no minimum facility level — accept null.
  facility_level: z.number().nullable().optional(),
  requires_preauthorization: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  // DHA routing flags
  payment_mechanism: z.enum(['PER_DIEM', 'FEE_FOR_SERVICE', 'CAPITATION']).optional(),
  access_point: z.enum(['IP', 'OP', 'BOTH']).optional(),
  needs_preauth: z.boolean().optional(),
  needs_manual_preauth_approval: z.boolean().optional(),
  is_surgical_preauth: z.boolean().optional(),
  is_renal_preauth: z.boolean().optional(),
  is_oncology_preauth: z.boolean().optional(),
  is_imaging_preauth: z.boolean().optional(),
  is_optical_preauth: z.boolean().optional(),
  // Hospital Level Tariffs
  level2_tariff: z.union([z.number(), z.string(), z.null()]).optional(),
  level3_tariff: z.union([z.number(), z.string(), z.null()]).optional(),
  level4_tariff: z.union([z.number(), z.string(), z.null()]).optional(),
  level5_tariff: z.union([z.number(), z.string(), z.null()]).optional(),
  level6_tariff: z.union([z.number(), z.string(), z.null()]).optional(),
  // Local-fallback extras passed through from the JSONL `extras` blob.
  raw_data: z.record(z.unknown()).optional(),
  max_amount_per_test: z.union([z.string(), z.number(), z.null()]).optional(),
  quantity_per_year: z.union([z.string(), z.number(), z.null()]).optional(),
});

export type SHAInterventionSchemaType = z.infer<typeof SHAInterventionSchema>;

export const ICHICodeSchema = z.object({
  id: z.number(),
  code: z.string(),
  title: z.string(),
  description: z.string().optional(),
  block: z.string().optional(),
  chapter: z.string().optional(),
  is_active: z.boolean(),
});

export type ICHICodeSchemaType = z.infer<typeof ICHICodeSchema>;

/**
 * LOINC code schema matching backend RemoteLOINCCode dataclass.
 * Backend returns loinc_num instead of code, and status instead of is_active.
 */
export const LOINCCodeSchema = z.object({
  // Primary identifier - backend uses loinc_num
  loinc_num: z.string(),
  // What is measured
  component: z.string(),
  // Full descriptive name
  long_common_name: z.string().nullable().optional(),
  // Abbreviated name
  short_name: z.string().nullable().optional(),
  // Kind of property
  property: z.string().nullable().optional(),
  // Timing (Pt, 24H, etc.)
  time_aspect: z.string().nullable().optional(),
  // Body system/specimen
  system: z.string().nullable().optional(),
  // Scale (Qn, Ord, etc.)
  scale_type: z.string().nullable().optional(),
  // Method used
  method_type: z.string().nullable().optional(),
  // Status (ACTIVE, deprecated, etc.)
  status: z.string().default('ACTIVE'),
  // Original API response (optional)
  raw_data: z.record(z.any()).optional(),
});

export type LOINCCodeSchemaType = z.infer<typeof LOINCCodeSchema>;

export const DrugProductSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  generic_name: z.string().optional(),
  brand_name: z.string().optional(),
  dosage_form: z.string().optional(),
  strength: z.string().optional(),
  route_of_administration: z.string().optional(),
  manufacturer: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  is_controlled: z.boolean(),
  is_active: z.boolean(),
});

export type DrugProductSchemaType = z.infer<typeof DrugProductSchema>;

export const ActiveComponentSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  is_active: z.boolean(),
});

export type ActiveComponentSchemaType = z.infer<typeof ActiveComponentSchema>;

// =============================================================================
// CLAIM SCHEMAS
// =============================================================================

/**
 * ClaimSchema - Validates SHA claim responses from the backend.
 *
 * Note: Some fields have aliases for backward compatibility:
 * - total_amount (frontend) ↔ claimed_amount (backend)
 * - copay_amount (frontend) ↔ patient_copay (backend)
 * - sha_reference (frontend) ↔ sha_claim_reference (backend)
 * - invoice_id/encounter_id/patient_id (frontend) ↔ invoice/encounter/patient (backend)
 */
export const ClaimSchema = z.object({
  // Primary identifiers
  id: z.number(),
  claim_number: z.string().optional(),

  // Backend uses 'sha_claim_reference', frontend alias 'sha_reference'
  sha_claim_reference: z.string().nullable().optional(),
  sha_reference: z.string().nullable().optional(), // Backward compatibility alias

  // Foreign keys - backend uses plain names, frontend uses _id suffix
  patient: z.number().nullable().optional(),
  patient_id: z.number().nullable().optional(), // Backward compatibility alias
  sha_member: z.number().nullable().optional(),
  sha_member_number: z.string().nullable().optional(),
  encounter: z.number().nullable().optional(),
  encounter_id: z.number().nullable().optional(), // Backward compatibility alias
  invoice: z.number().nullable().optional(),
  invoice_id: z.number().nullable().optional(), // Backward compatibility alias

  // Display fields
  patient_name: z.string().nullable().optional(),
  patient_mrn: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  submitted_by_username: z.string().nullable().optional(),

  // Claim details
  claim_type: z.string().nullable().optional(),
  status: ClaimStatusSchema,

  // Clinical dates
  service_date: z.string().nullable().optional(),
  admission_date: z.string().nullable().optional(),
  discharge_date: z.string().nullable().optional(),

  // Diagnosis
  primary_diagnosis_code: z.string().nullable().optional(),
  primary_diagnosis_description: z.string().nullable().optional(),
  secondary_diagnosis_codes: z.union([z.array(z.string()), z.record(z.unknown())]).nullable().optional(),

  // Amounts - backend uses claimed_amount, frontend alias total_amount
  claimed_amount: z.string().nullable().optional(),
  total_amount: z.string().optional(), // Backward compatibility alias
  approved_amount: z.string().nullable().optional(),
  paid_amount: z.string().nullable().optional(),
  rejected_amount: z.string().nullable().optional(), // Frontend-specific, may not be in backend
  patient_copay: z.string().nullable().optional(),
  copay_amount: z.string().nullable().optional(), // Backward compatibility alias

  // Submission
  submission_method: z.string().nullable().optional(),
  submitted_at: z.string().nullable().optional(),
  submitted_by: z.number().nullable().optional(),

  // Adjudication
  adjudication_date: z.string().nullable().optional(),
  adjudication_notes: z.string().nullable().optional(),
  rejection_reason: z.string().nullable().optional(),
  rejection_code: z.string().nullable().optional(),
  rejection_codes: z.array(z.string()).nullable().optional(), // Frontend-specific array

  // Payment
  payment_date: z.string().nullable().optional(),
  payment_reference: z.string().nullable().optional(),

  // Preauthorization
  preauth_number: z.string().nullable().optional(),
  preauth_date: z.string().nullable().optional(),
  preauth_valid_until: z.string().nullable().optional(),

  // DHA HIE claim flow routing
  claim_flow: z.enum(['phc', 'shif', 'eccif']).or(z.literal('')).nullable().optional(),
  is_emergency_claim: z.boolean().optional(),

  // Facility
  facility_code: z.string().nullable().optional(),
  facility_level: z.string().nullable().optional(),

  // Versioning
  version: z.number().nullable().optional(),
  parent_claim: z.number().nullable().optional(),

  // Computed counts
  items_count: z.number().nullable().optional(),
  attachments_count: z.number().nullable().optional(),

  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  processed_at: z.string().nullable().optional(), // Frontend-specific

  // FHIR reference
  fhir_bundle_id: z.string().nullable().optional(),
  created_by: z.number().nullable().optional(),

  // DHA HIE ILM fields
  dha_external_id: z.string().nullable().optional(),
  dha_correlation_id: z.string().nullable().optional(),
  last_dha_status: z.string().nullable().optional(),
  last_dha_payload_at: z.string().nullable().optional(),
  dha_visit_started_at: z.string().nullable().optional(),

  // Intervention tracking & document-type enforcement (Phase 1.1)
  claim_interventions: z.array(z.object({
    id: z.number(),
    intervention_code: z.string(),
    intervention_name: z.string().optional().default(''),
    benefit_code: z.string().optional().default(''),
    status: z.enum(['active', 'retired']),
    required_document_types: z.array(z.string()),
    dha_intervention_id: z.string().optional().default(''),
    tariff_amount: z.string().nullable().optional(),
    // DHA routing flags
    payment_mechanism: z.enum(['PER_DIEM', 'FEE_FOR_SERVICE', 'CAPITATION']).optional(),
    access_point: z.enum(['IP', 'OP', 'BOTH']).optional(),
    needs_preauth: z.boolean().optional(),
    needs_manual_preauth_approval: z.boolean().optional(),
    is_surgical_preauth: z.boolean().optional(),
    is_renal_preauth: z.boolean().optional(),
    is_oncology_preauth: z.boolean().optional(),
    is_imaging_preauth: z.boolean().optional(),
    is_optical_preauth: z.boolean().optional(),
    level2_tariff: z.string().nullable().optional(),
    level3_tariff: z.string().nullable().optional(),
    level4_tariff: z.string().nullable().optional(),
    level5_tariff: z.string().nullable().optional(),
    level6_tariff: z.string().nullable().optional(),
    // Computed properties
    preauth_type: z.string().optional(),
    is_per_diem: z.boolean().optional(),
    is_elective_preauth: z.boolean().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })).optional().default([]),
  missing_document_types: z.array(z.object({
    intervention_code: z.string(),
    intervention_name: z.string().optional().default(''),
    missing: z.array(z.string()),
  })).optional().default([]),
});

export type ClaimSchemaType = z.infer<typeof ClaimSchema>;

export const ClaimItemSchema = z.object({
  id: z.number(),
  claim: z.number(),
  tariff: z.number().optional(),
  tariff_code: z.string().optional(),
  tariff_name: z.string().optional(),
  service: z.number().optional(),
  invoice_item: z.number().optional(),
  description: z.string(),
  service_date: z.string().optional(),
  quantity: z.union([z.string(), z.number()]),
  unit_price: z.string(),
  claimed_amount: z.string(),
  coverage_type: CoverageTypeSchema,
  coverage_type_display: z.string().optional(),
  status: ClaimItemStatusSchema,
  approved_quantity: z.union([z.string(), z.number()]).optional(),
  approved_amount: z.string().optional(),
  rejection_reason: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ClaimItemSchemaType = z.infer<typeof ClaimItemSchema>;

export const ClaimCreateResponseSchema = z.object({
  id: z.number(),
  claim_number: z.string(),
  status: ClaimStatusSchema,
});

export type ClaimCreateResponseSchemaType = z.infer<typeof ClaimCreateResponseSchema>;

export const ClaimSubmitResponseSchema = z.object({
  status: z.string(),
  claim_number: z.string(),
  submitted_at: z.string().nullable().optional(),
  sha_claim_reference: z.string().nullable().optional(),
  message: z.string().optional(),
  queue_entry_id: z.number().optional(),
});

export type ClaimSubmitResponseSchemaType = z.infer<typeof ClaimSubmitResponseSchema>;

// =============================================================================
// FACILITY VALIDATION SCHEMAS
// =============================================================================

export const FacilityInfoSchema = z.object({
  facility_code: z.string(),
  name: z.string(),
  level: z.number(),
  county: z.string(),
  sub_county: z.string().optional(),
  ward: z.string().optional(),
  operational_status: z.string(),
  sha_approved: z.boolean(),
  license_number: z.string().optional(),
  license_expiry: z.string().optional(),
  keph_level: z.string().optional(),
  facility_type: z.string().optional(),
  owner: z.string().optional(),
  beds: z.number().optional(),
});

export type FacilityInfoSchemaType = z.infer<typeof FacilityInfoSchema>;

export const FacilityValidationResponseSchema = z.object({
  valid: z.boolean(),
  facility: FacilityInfoSchema.optional(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

export type FacilityValidationResponseSchemaType = z.infer<typeof FacilityValidationResponseSchema>;

// =============================================================================
// DHA PRACTITIONER SCHEMAS
// =============================================================================

export const DHAPractitionerMembershipSchema = z.object({
  id: z.string(),
  status: z.string().default(''),
  salutation: z.string().default(''),
  full_name: z.string(),
  gender: z.string().default(''),
  first_name: z.string(),
  middle_name: z.string().default(''),
  last_name: z.string(),
  registration_id: z.string(),
  external_reference_id: z.string().default(''),
  licensing_body: z.string(),
  specialty: z.string().default(''),
  is_active: z.number(),
  is_withdrawn: z.number().default(0),
  withdrawal_reason: z.string().default(''),
  withdrawal_date: z.string().default(''),
  license_expires_in_days: z.number().default(0),
});

export const DHAPractitionerLicenseSchema = z.object({
  id: z.string(),
  external_reference_id: z.string(),
  license_type: z.string(),
  license_start: z.string(),
  license_end: z.string(),
});

export const DHAPractitionerProfessionalDetailsSchema = z.object({
  professional_cadre: z.string().default(''),
  practice_type: z.string().default(''),
  specialty: z.string().default(''),
  subspecialty: z.string().default(''),
  discipline_name: z.string().default(''),
  educational_qualifications: z.string().default(''),
});

export const DHAPractitionerContactsSchema = z.object({
  phone: z.string().default(''),
  email: z.string().default(''),
  postal_address: z.string().default(''),
});

export const DHAPractitionerIdentifiersSchema = z.object({
  identification_type: z.string(),
  identification_number: z.string(),
  client_registry_id: z.string().default(''),
  student_id: z.string().default(''),
});

export const DHAPractitionerSchema = z.object({
  membership: DHAPractitionerMembershipSchema,
  licenses: z.array(DHAPractitionerLicenseSchema),
  professional_details: DHAPractitionerProfessionalDetailsSchema,
  contacts: DHAPractitionerContactsSchema,
  identifiers: DHAPractitionerIdentifiersSchema,
});

export type DHAPractitionerSchemaType = z.infer<typeof DHAPractitionerSchema>;

export const DHAPractitionerSearchResponseSchema = z.object({
  message: DHAPractitionerSchema,
});

export type DHAPractitionerSearchResponseSchemaType = z.infer<typeof DHAPractitionerSearchResponseSchema>;

// Legacy practitioner validation
export const PractitionerInfoSchema = z.object({
  hwr_number: z.string(),
  name: z.string(),
  cadre: z.string(),
  specialization: z.string().optional(),
  license_status: z.string(),
  license_expiry: z.string().optional(),
  registration_board: z.string().optional(),
  facility_code: z.string().optional(),
});

export const PractitionerValidationResponseSchema = z.object({
  valid: z.boolean(),
  practitioner: PractitionerInfoSchema.optional(),
  errors: z.array(z.string()),
});

export type PractitionerValidationResponseSchemaType = z.infer<typeof PractitionerValidationResponseSchema>;

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedSHAMembersSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SHAMemberSchema),
});

export const PaginatedClaimsSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ClaimSchema),
});

export const PaginatedICD11CodesSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ICD11CodeSchema),
});

// Backend `/api/billing/terminology/interventions/` returns `{ results, count }`
// without DRF-style `next`/`previous` cursors (it uses limit/offset). Make those
// optional with sensible defaults so the schema works for both shapes.
export const PaginatedSHAInterventionsSchema = z.object({
  count: z.number().optional().default(0),
  next: z.string().nullable().optional().default(null),
  previous: z.string().nullable().optional().default(null),
  results: z.array(SHAInterventionSchema),
});

export const PaginatedICHICodesSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ICHICodeSchema),
});

/**
 * Response schema for terminology search endpoints.
 * Backend returns { results: [], count: N } without pagination links.
 */
export const PaginatedLOINCCodesSchema = z.object({
  count: z.number(),
  results: z.array(LOINCCodeSchema),
  // Source indicator (optional - indicates where data came from)
  source: z.string().optional(),
});

export const PaginatedDrugProductsSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DrugProductSchema),
});

export const PaginatedActiveComponentsSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ActiveComponentSchema),
});

// =============================================================================
// DHA HIE CONSENT SCHEMAS
// =============================================================================

export const ConsentStatusSchema = z.enum(['PENDING', 'VALIDATED', 'EXPIRED', 'FAILED']);
export const ConsentMethodSchema = z.enum(['OTP', 'BIOMETRIC']);

export const ConsentTokenSchema = z.object({
  id: z.number(),
  patient: z.number(),
  sha_member: z.number(),
  facility: z.number(),
  consent_method: ConsentMethodSchema,
  status: ConsentStatusSchema,
  otp_reference: z.string(),
  consent_token: z.string(),
  identification_type: z.string(),
  identification_number: z.string(),
  created_at: z.string(),
  validated_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  is_valid: z.boolean(),
});

export type ConsentTokenSchemaType = z.infer<typeof ConsentTokenSchema>;

export const SendOTPResponseSchema = z.object({
  consent_id: z.number(),
  otp_reference: z.string(),
  status: z.string(),
  message: z.string(),
  sandbox_otp: z.string().optional(),
});

export type SendOTPResponseSchemaType = z.infer<typeof SendOTPResponseSchema>;

export const ValidateOTPResponseSchema = z.object({
  id: z.number(),
  status: ConsentStatusSchema,
  consent_token: z.string(),
  expires_at: z.string(),
  message: z.string(),
});

export type ValidateOTPResponseSchemaType = z.infer<typeof ValidateOTPResponseSchema>;

export const StartVisitResponseSchema = z.object({
  id: z.number(),
  status: ConsentStatusSchema,
  consent_token: z.string(),
  expires_at: z.string().nullable(),
  visit_data: z.record(z.unknown()),
  message: z.string(),
});

export type StartVisitResponseSchemaType = z.infer<typeof StartVisitResponseSchema>;

// =============================================================================
// DHA HIE PRE-AUTHORIZATION SCHEMAS
// =============================================================================

export const PreauthDecisionSchema = z.enum(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED']);

export const PreauthRequestSchema = z.object({
  id: z.number(),
  claim: z.number(),
  patient: z.number(),
  sha_member: z.number(),
  consent_token: z.number(),
  facility: z.number(),
  preauth_reference: z.string(),
  procedure_code: z.string(),
  diagnosis_codes: z.array(z.string()),
  estimated_cost: z.string(),
  scheduled_date: z.string(),
  clinical_notes: z.string(),
  decision: PreauthDecisionSchema,
  approved_amount: z.string().nullable(),
  valid_until: z.string().nullable(),
  denial_reason: z.string(),
  poll_count: z.number(),
  last_polled_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  submitted_at: z.string().nullable(),
  is_valid: z.boolean(),
});

export type PreauthRequestSchemaType = z.infer<typeof PreauthRequestSchema>;

export const SubmitPreauthResponseSchema = z.object({
  id: z.number(),
  preauth_reference: z.string(),
  decision: PreauthDecisionSchema,
  message: z.string(),
});

export type SubmitPreauthResponseSchemaType = z.infer<typeof SubmitPreauthResponseSchema>;

export const PaginatedPreauthRequestsSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PreauthRequestSchema),
});

export type PaginatedPreauthRequestsSchemaType = z.infer<typeof PaginatedPreauthRequestsSchema>;

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const ClaimItemArraySchema = z.array(ClaimItemSchema);

// Legacy aliases for backwards compatibility
export const SHAMemberSearchResultSchema = SHAMemberSchema;
export const SHAClaimSchema = ClaimSchema;
export const SHAClaimItemSchema = ClaimItemSchema;
export const SHAPreauthorizationSchema = PreauthRequestSchema;
export const PaginatedSHAClaimSchema = PaginatedClaimsSchema;
export const SHAClaimItemArrayResponseSchema = z.object({
  results: ClaimItemArraySchema,
});


// =============================================================================
// DHA HIE Middleware (ILM) — per-action claim workflow
// =============================================================================

export const IlmCallResultSchema = z.object({
  status_code: z.number(),
  payload: z.unknown().optional(),
});

export type IlmCallResult = z.infer<typeof IlmCallResultSchema>;

export const IlmStartVisitRequestSchema = z.object({
  otp: z.string().optional(),
  auth_guid: z.string().optional(),
  patient_id: z.string().min(1),
  intervention_codes: z.array(z.string().min(1)),
  service_type: z.enum(['OUTPATIENT', 'INPATIENT']).default('OUTPATIENT'),
  admission_date: z.string().optional(),
  estimated_days_of_admission: z.number().int().nonnegative().optional(),
  // Practitioner (doctor) details — DHA 2026-06 requirement
  practitioner_identification_number: z.string().optional(),
  practitioner_identification_type: z.string().optional(),
  practitioner_regulation_body: z.string().optional(),
}).refine(
  (data) => (!!data.otp) !== (!!data.auth_guid),
  { message: 'Exactly one of otp or auth_guid must be provided', path: ['otp'] },
);

export type IlmStartVisitRequest = z.infer<typeof IlmStartVisitRequestSchema>;

export const IlmInterventionRequestSchema = z.object({
  intervention_code: z.string().min(1),
});
export type IlmInterventionRequest = z.infer<typeof IlmInterventionRequestSchema>;

/**
 * PHC virtual claim line — DHA HIE user-journey Scenario C.
 * Used by Level 2/3 facilities for capitation / basic FFS interventions.
 * Skips pre-authorization.
 */
export const IlmVirtualClaimLineRequestSchema = z.object({
  intervention_code: z.string().min(1),
  service_name: z.string().optional(),
  service_identifier: z.string().optional(),
  unit_price: z.string().optional(),
  quantity: z.string().optional(),
  scheme_code: z.string().optional(),
  extra: z.record(z.unknown()).optional(),
});
export type IlmVirtualClaimLineRequest = z.infer<typeof IlmVirtualClaimLineRequestSchema>;

export const IlmSwitchInterventionRequestSchema = z.object({
  existing_intervention_code: z.string().min(1),
  new_intervention_code: z.string().min(1),
  retain_bill_items: z.boolean().optional(),
  bill_from: z.string().optional(),
  bill_to: z.string().optional(),
});
export type IlmSwitchInterventionRequest = z.infer<typeof IlmSwitchInterventionRequestSchema>;

export const IlmAddDiagnosisRequestSchema = z.object({
  icd_code: z.string().min(1),
  intervention_code: z.string().min(1),
  // Practitioner (doctor) details — DHA 2026-06 fallback injection point
  practitioner_identification_number: z.string().optional(),
  practitioner_identification_type: z.string().optional(),
  practitioner_regulation_body: z.string().optional(),
});
export type IlmAddDiagnosisRequest = z.infer<typeof IlmAddDiagnosisRequestSchema>;

export const IlmRemoveDiagnosisRequestSchema = z.object({
  icd_code: z.string().min(1),
});
export type IlmRemoveDiagnosisRequest = z.infer<typeof IlmRemoveDiagnosisRequestSchema>;

export const IlmAddLineRequestSchema = z.object({
  intervention_code: z.string().min(1),
  service_name: z.string().min(1),
  service_identifier: z.string().min(1),
  unit_price: z.string().min(1),
  quantity: z.string().min(1),
  scheme_code: z.string().min(1),
  // Practitioner (doctor) details — DHA 2026-06 fallback injection point
  practitioner_identification_number: z.string().optional(),
  practitioner_identification_type: z.string().optional(),
  practitioner_regulation_body: z.string().optional(),
});
export type IlmAddLineRequest = z.infer<typeof IlmAddLineRequestSchema>;

export const IlmEditLineRequestSchema = z.object({
  claim_line_id: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_price: z.string().optional(),
  scheme_code: z.string().optional(),
});
export type IlmEditLineRequest = z.infer<typeof IlmEditLineRequestSchema>;

export const IlmRemoveLineRequestSchema = z.object({
  claim_line_id: z.string().min(1),
});
export type IlmRemoveLineRequest = z.infer<typeof IlmRemoveLineRequestSchema>;

export const IlmRemoveAttachmentRequestSchema = z.object({
  attachment_id: z.string().min(1),
});
export type IlmRemoveAttachmentRequest = z.infer<typeof IlmRemoveAttachmentRequestSchema>;

export const IlmSubmitRequestSchema = z.object({
  invoice_number: z.string().min(1),
  // Outpatient discharge consent — DHA 2026-06 requirement
  otp: z.string().optional(),
  discharge_auth_guid: z.string().optional(),
  discharge_reason: z.enum([
    'RECOVERED', 'REFERRED', 'ABSCONDED', 'OTHER',
  ]).optional(),
  notes: z.string().optional(),
  // Practitioner (doctor) details — fallback if not provided at start_visit
  practitioner_identification_number: z.string().optional(),
  practitioner_identification_type: z.string().optional(),
  practitioner_regulation_body: z.string().optional(),
});
export type IlmSubmitRequest = z.infer<typeof IlmSubmitRequestSchema>;

export const IlmCloseRequestSchema = z.object({
  cancel_reason_type: z.enum([
    'WRONG_PATIENT',
    'NO_SERVICE_GIVEN',
    'WRONG_BENEFIT',
    'EXPIRED_VISIT',
    'EXHAUSTED_BENEFIT',
    'TIME_BARRED',
    'OTHER_REASONS',
  ]),
  cancel_reason_text: z.string().optional(),
});
export type IlmCloseRequest = z.infer<typeof IlmCloseRequestSchema>;

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 2: pre-visit registries & eligibility
// ============================================================================

export const IlmRegistryResponseSchema = z.object({
  data: z.unknown(),
  http_status: z.number(),
  snapshot_id: z.number().nullable().optional(),
});
export type IlmRegistryResponse = z.infer<typeof IlmRegistryResponseSchema>;

// Loose schemas — DHA payloads are deeply nested and partly free-form, so we
// validate the envelope (data + http_status) and let UI consumers drill into
// `data` with their own narrow schemas as needed.
export const IlmFacilityResultSchema = z.object({
  fidCode: z.string().optional(),
  frCode: z.string().optional(),
  officialName: z.string().optional(),
  facilityType: z.string().optional(),
  kephLevel: z.string().optional(),
  shaContractStatus: z.string().optional(),
  shaContractedServices: z.array(z.string()).optional(),
}).passthrough();

export const IlmEligibilitySchemeSchema = z.object({
  schemeName: z.string().optional(),
  memberType: z.string().optional(),
  coverage: z.object({
    status: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }).partial().optional(),
}).passthrough();

export const IlmEligibilityResultSchema = z.object({
  fullName: z.string().optional(),
  memberCrNumber: z.string().optional(),
  age: z.number().optional(),
  gender: z.string().optional(),
  schemes: z.array(IlmEligibilitySchemeSchema).optional(),
  whitelistedForOTP: z.boolean().optional(),
}).passthrough();

export const PatientContactSchema = z.object({
  id: z.number(),
  patient: z.number(),
  sha_member: z.number().nullable().optional(),
  contact_type: z.string(),
  full_name: z.string(),
  relationship: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  identification_number: z.string().optional().default(''),
  identification_type: z.string().optional().default(''),
  is_otp_recipient: z.boolean(),
  dha_contact_id: z.string().optional().default(''),
  fetched_at: z.string().optional(),
});
export type PatientContact = z.infer<typeof PatientContactSchema>;

export const PatientContactListSchema = z.object({
  results: z.array(PatientContactSchema),
});
export type PatientContactList = z.infer<typeof PatientContactListSchema>;

export const PatientContactCreateSchema = z.object({
  patient_pk: z.number(),
  sha_member_id: z.number().optional(),
  contact_type: z.enum(['primary', 'next_of_kin', 'beneficiary', 'other']),
  full_name: z.string().min(1),
  relationship: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  identification_number: z.string().optional(),
  identification_type: z.string().optional(),
  is_otp_recipient: z.boolean().optional(),
  dha_contact_id: z.string().optional(),
});
export type PatientContactCreateInput = z.infer<typeof PatientContactCreateSchema>;

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 3: preauth, doctor consent & emergency
// ============================================================================

export const IlmPreauthResponseSchema = z.object({
  data: z.unknown(),
  http_status: z.number(),
  record_id: z.number().nullable().optional(),
  dha_external_id: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
});
export type IlmPreauthResponse = z.infer<typeof IlmPreauthResponseSchema>;

export const SHAPreauthSchema = z.object({
  id: z.number(),
  patient: z.number().nullable().optional(),
  facility: z.number().nullable().optional(),
  consent_token: z.string(),
  intervention_code: z.string(),
  status: z.enum(['draft', 'submitted', 'approved', 'denied', 'cancelled']),
  dha_external_id: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
  diagnoses: z.unknown().optional(),
  doctor_consent_state: z.string().optional().default(''),
  submitted_at: z.string().nullable().optional(),
  decided_at: z.string().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).passthrough();
export type SHAPreauth = z.infer<typeof SHAPreauthSchema>;

export const SHAPreauthListSchema = z.object({ results: z.array(SHAPreauthSchema) });

export const SHAEmergencyClaimSchema = z.object({
  id: z.number(),
  patient: z.number().nullable().optional(),
  facility: z.number().nullable().optional(),
  kind: z.enum(['emergency', 'emt']),
  status: z.enum(['open', 'submitted', 'authorized', 'cancelled']),
  consent_token: z.string().optional().default(''),
  reference_number: z.string().optional().default(''),
  case_number: z.string().optional().default(''),
  beneficiary_cr_id: z.string().optional().default(''),
  brought_by: z.string().optional().default(''),
  mode_of_arrival: z.string().optional().default(''),
  interventions: z.unknown().optional(),
  diagnoses: z.unknown().optional(),
  dha_external_id: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
  created_at: z.string().optional(),
}).passthrough();
export type SHAEmergencyClaim = z.infer<typeof SHAEmergencyClaimSchema>;

export const SHAEmergencyClaimListSchema = z.object({ results: z.array(SHAEmergencyClaimSchema) });

// --- Inputs -----------------------------------------------------------------

export const PreauthCreateInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
  patient_pk: z.number(),
  claim_pk: z.number().optional(),
  payload: z.record(z.unknown()).optional(),
});
export type PreauthCreateInput = z.infer<typeof PreauthCreateInputSchema>;

export const PreauthCancelInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
  reason: z.string().optional(),
});
export type PreauthCancelInput = z.infer<typeof PreauthCancelInputSchema>;

export const PreauthRemoveDiagnosisInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
});

export const PreauthRemoveDoctorInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
  practitioner_registration_number: z.string().min(1),
});

export const DoctorConsentInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
  practitioner_registration_number: z.string().min(1),
  identification_number: z.string().min(1),
  identification_type: z.string().optional(),
});

export const EmergencyOpenInputSchema = z.object({
  interventions: z.array(z.string()).min(1),
  diagnoses: z.array(z.string()).optional(),
  reference_number: z.string().optional(),
  beneficiary_cr_id: z.string().optional(),
  brought_by: z.string().optional(),
  mode_of_arrival: z.string().optional(),
  consent_token: z.string().optional(),
  patient_pk: z.number().optional(),
  claim_pk: z.number().optional(),
  payload: z.record(z.unknown()).optional(),
});

export const EmergencyProtocolApplyInputSchema = z.object({
  consent_token: z.string().min(1),
  protocol_code: z.string().min(1),
  intervention_code: z.string().min(1),
  unit_price: z.number(),
  quantity: z.number(),
  diagnoses: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

export const EmtCreateInputSchema = z.object({
  beneficiary_cr_id: z.string().min(1),
  case_number: z.string().min(1),
  consent_token: z.string().min(1),
  diagnoses: z.array(z.string()).min(1),
  interventions: z.array(z.string()).min(1),
  practitioner_reg_number: z.string().min(1),
  provider_registration_number: z.string().min(1),
  protocol_code: z.string().min(1),
  patient_pk: z.number().optional(),
  payload: z.record(z.unknown()).optional(),
});

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 4: lifecycle (OTP, discharge, NoK, uploads)
// ============================================================================

export const IlmLifecycleResponseSchema = z.object({
  data: z.unknown(),
  http_status: z.number(),
  record_id: z.number().nullable().optional(),
  dha_external_id: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
});
export type IlmLifecycleResponse = z.infer<typeof IlmLifecycleResponseSchema>;

export const SHAOtpRequestSchema = z.object({
  id: z.number(),
  patient: z.number().nullable().optional(),
  facility: z.number().nullable().optional(),
  kind: z.enum(['visit', 'discharge']),
  status: z.enum(['sent', 'verified', 'failed']),
  consent_token: z.string().optional().default(''),
  patient_cr_id: z.string().optional().default(''),
  intervention_codes: z.unknown().optional(),
  correlation_id: z.string().optional().default(''),
  sent_at: z.string().nullable().optional(),
  verified_at: z.string().nullable().optional(),
}).passthrough();
export type SHAOtpRequestRow = z.infer<typeof SHAOtpRequestSchema>;
export const SHAOtpRequestListSchema = z.object({ results: z.array(SHAOtpRequestSchema) });

export const SHAOtpWhitelistRowSchema = z.object({
  id: z.number(),
  patient: z.number().nullable().optional(),
  facility: z.number().nullable().optional(),
  status: z.enum(['requested', 'approved', 'rejected', 'failed']),
  beneficiary_cr_id: z.string().optional().default(''),
  reason_type: z.string().optional().default(''),
  reason: z.string().optional().default(''),
  biometric_attempts: z.number().nullable().optional(),
  dha_guid: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
  requested_at: z.string().nullable().optional(),
}).passthrough();
export type SHAOtpWhitelistRow = z.infer<typeof SHAOtpWhitelistRowSchema>;
export const SHAOtpWhitelistListSchema = z.object({ results: z.array(SHAOtpWhitelistRowSchema) });

export const SHAUploadSchema = z.object({
  id: z.number(),
  facility: z.number().nullable().optional(),
  filename: z.string(),
  content_type: z.string().optional().default(''),
  size_bytes: z.number().nullable().optional(),
  dha_file_id: z.string().optional().default(''),
  dha_file_path: z.string().optional().default(''),
  dha_download_url: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
  uploaded_at: z.string().nullable().optional(),
}).passthrough();
export type SHAUploadRow = z.infer<typeof SHAUploadSchema>;
export const SHAUploadListSchema = z.object({ results: z.array(SHAUploadSchema) });

// --- Inputs -----------------------------------------------------------------

export const IlmVisitOtpInputSchema = z.object({
  intervention_codes: z.array(z.string().min(1)).min(1),
  patient_id: z.string().min(1),
  beneficiary_contact_id: z.string().optional(),
});
export type IlmVisitOtpInput = z.infer<typeof IlmVisitOtpInputSchema>;

export const IlmDischargeOtpInputSchema = z.object({
  consent_token: z.string().min(1),
  patient_id: z.string().min(1),
  beneficiary_contact_id: z.string().optional(),
});
export type IlmDischargeOtpInput = z.infer<typeof IlmDischargeOtpInputSchema>;

export const IlmDischargeInputSchema = z.object({
  consent_token: z.string().min(1),
  discharge_date: z.string().min(1),
  discharge_reason: z.string().min(1),
  invoice_number: z.string().min(1),
  otp: z.string().min(1),
});
export type IlmDischargeInput = z.infer<typeof IlmDischargeInputSchema>;

export const IlmOtpWhitelistInputSchema = z.object({
  beneficiary_cr_id: z.string().min(1),
  facility_fr_code: z.string().optional(),
  reason_type: z.string().optional(),
  reason: z.string().optional(),
  biometric_attempts: z.number().int().nonnegative().optional(),
});
export type IlmOtpWhitelistInput = z.infer<typeof IlmOtpWhitelistInputSchema>;

export const IlmNextOfKinInputSchema = z.object({
  consent_token: z.string().min(1),
  contact_value: z.string().min(1),
  next_of_kin_full_name: z.string().min(1),
  next_of_kin_id_number: z.string().min(1),
  next_of_kin_id_number_type: z.string().optional(),
  contact_type: z.string().optional(),
});
export type IlmNextOfKinInput = z.infer<typeof IlmNextOfKinInputSchema>;

export const IlmEmergencyDoctorAddInputSchema = z.object({
  consent_token: z.string().min(1),
  identification_number: z.string().min(1),
  identification_type: z.string().optional(),
});
export type IlmEmergencyDoctorAddInput = z.infer<typeof IlmEmergencyDoctorAddInputSchema>;

export const IlmEmergencyDoctorRemoveInputSchema = z.object({
  consent_token: z.string().min(1),
});
export type IlmEmergencyDoctorRemoveInput = z.infer<typeof IlmEmergencyDoctorRemoveInputSchema>;

export const IlmPomsfBalanceInputSchema = z.object({
  patient_id: z.string().min(1),
  policy_year: z.string().optional(),
  principal_member_number: z.string().optional(),
  benefit_package_id: z.string().optional(),
});
export type IlmPomsfBalanceInput = z.infer<typeof IlmPomsfBalanceInputSchema>;

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 5: ePrescriptions
// ============================================================================

export const IlmPrescriptionResponseSchema = z.object({
  data: z.unknown(),
  http_status: z.number(),
  record_id: z.number().nullable().optional(),
  dha_external_id: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
});
export type IlmPrescriptionResponse = z.infer<typeof IlmPrescriptionResponseSchema>;

export const SHADhaPrescriptionSchema = z.object({
  id: z.number(),
  patient: z.number().nullable().optional(),
  encounter: z.number().nullable().optional(),
  claim: z.number().nullable().optional(),
  facility: z.number().nullable().optional(),
  status: z.enum(['draft', 'created', 'dispensed', 'cancelled', 'failed']),
  intervention_code: z.string().optional().default(''),
  identification_number: z.string().optional().default(''),
  identification_type: z.string().optional().default(''),
  regulation_body: z.string().optional().default(''),
  items: z.unknown().optional(),
  dha_external_id: z.string().optional().default(''),
  dha_guid: z.string().optional().default(''),
  correlation_id: z.string().optional().default(''),
  created_at: z.string().nullable().optional(),
  dispensed_at: z.string().nullable().optional(),
}).passthrough();
export type SHADhaPrescription = z.infer<typeof SHADhaPrescriptionSchema>;
export const SHADhaPrescriptionListSchema = z.object({
  results: z.array(SHADhaPrescriptionSchema),
});

// --- Inputs -----------------------------------------------------------------

export const PrescriptionItemInputSchema = z.object({
  generic_concept_code: z.string().min(1),
  dose_quantity: z.number(),
  dose_unit: z.string().min(1),
  frequency: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  duration_unit: z.string().min(1),
  period_unit: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().optional(),
  additional_instruction: z.string().optional(),
  patient_instruction: z.string().optional(),
  needs_refill: z.boolean().optional(),
  refill_count: z.number().int().nonnegative().optional(),
});
export type PrescriptionItemInput = z.infer<typeof PrescriptionItemInputSchema>;

export const IlmPrescriptionCreateInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
  identification_number: z.string().min(1),
  identification_type: z.string().optional(),
  regulation_body: z.string().optional(),
  items: z.array(PrescriptionItemInputSchema).min(1),
  patient_pk: z.number().optional(),
  encounter_pk: z.number().optional(),
});
export type IlmPrescriptionCreateInput = z.infer<typeof IlmPrescriptionCreateInputSchema>;

export const DispenseProductInputSchema = z.object({
  actual_product_code: z.string().min(1),
  medication_price: z.number(),
  total_quantity: z.number().int().nonnegative(),
});
export type DispenseProductInput = z.infer<typeof DispenseProductInputSchema>;

export const DispenseDoctorInputSchema = z.object({
  identification_number: z.string().min(1),
  identification_type: z.string().optional(),
});
export type DispenseDoctorInput = z.infer<typeof DispenseDoctorInputSchema>;

export const IlmPrescriptionDispenseInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
  actual_products: z.array(DispenseProductInputSchema).min(1),
  doctors: z.array(DispenseDoctorInputSchema).optional(),
  prescription_pk: z.number().optional(),
});
export type IlmPrescriptionDispenseInput = z.infer<typeof IlmPrescriptionDispenseInputSchema>;

export const IlmPrescriptionRemoveDoctorInputSchema = z.object({
  consent_token: z.string().min(1),
  intervention_code: z.string().min(1),
  practitioner_registration_number: z.string().min(1),
});
export type IlmPrescriptionRemoveDoctorInput = z.infer<
  typeof IlmPrescriptionRemoveDoctorInputSchema
>;

// =============================================================================
// SHA Remittance Schemas
// =============================================================================

export const SHARemittanceSchema = z.object({
  id: z.number(),
  bank_reference: z.string(),
  payment_date: z.string(),
  total_amount: z.string(),
  claims_count: z.number(),
  status: z.enum(['received', 'reconciling', 'reconciled', 'partial']),
  reconciled_amount: z.string(),
  unreconciled_amount: z.string(),
  fetched_at: z.string(),
  reconciled_at: z.string().nullable().optional(),
});
export type SHARemittance = z.infer<typeof SHARemittanceSchema>;

export const SHARemittanceLineSchema = z.object({
  id: z.number(),
  dha_claim_id: z.string(),
  paid_amount: z.string(),
  payment_status: z.string(),
  is_reconciled: z.boolean(),
  reconciled_at: z.string().nullable().optional(),
  claim: z.number().nullable().optional(),
  claim_number: z.string().nullable().optional(),
  claim_status: z.string().nullable().optional(),
});
export type SHARemittanceLine = z.infer<typeof SHARemittanceLineSchema>;

export const PaginatedRemittancesSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SHARemittanceSchema),
});
export type PaginatedRemittances = z.infer<typeof PaginatedRemittancesSchema>;
