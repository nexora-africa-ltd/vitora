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
]);

export const ClaimItemStatusSchema = z.enum(['pending', 'approved', 'rejected', 'adjusted']);

export const MembershipTypeSchema = z.enum(['PRINCIPAL', 'SPOUSE', 'CHILD', 'PARENT', 'OTHER']);

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
const SHAGenderSchema = z.enum(['M', 'F', 'O']);

// =============================================================================
// CLIENT REGISTRY SCHEMAS
// =============================================================================

export const ClientRegistryClientSchema = z.object({
  client_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  middle_name: z.string().optional(),
  date_of_birth: z.string(),
  gender: SHAGenderSchema,
  national_id: z.string().optional(),
  huduma_number: z.string().optional(),
  passport_number: z.string().optional(),
  alien_id: z.string().optional(),
  kra_pin: z.string().optional(),
  mandate_number: z.string().optional(),
  phone_number: z.string().optional(),
  email: z.string().optional(),
  county: z.string().optional(),
  sub_county: z.string().optional(),
  ward: z.string().optional(),
  address: z.string().optional(),
  citizenship: z.string().optional(),
  place_of_birth: z.string().optional(),
  is_person_with_disability: z.boolean().optional(),
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
  sha_member_number: z.string(),
  sha_number: z.string().optional(),
  scheme_category: SchemeCategorySchema,
  coverage_start_date: z.string(),
  coverage_end_date: z.string().optional(),
  is_active: z.boolean(),
  membership_type: MembershipTypeSchema.optional(),
  principal_sha_number: z.string().optional(),
  status: MemberStatusSchema.optional(),
  national_id: z.string().optional(),
  eligibility_display: z.string().optional(),
  eligibility_valid_until: z.string().optional().nullable(),
  last_eligibility_check: z.string().optional().nullable(),
  is_pfms_eligible: z.boolean(),
  pfms_category: PFMSCategorySchema.optional(),
  pfms_category_display: z.string().optional(),
  pfms_verified: z.boolean(),
  pfms_verified_at: z.string().optional(),
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
  id: z.number(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string(),
  price: z.number(),
  currency: z.string(),
  facility_level: z.number(),
  requires_preauthorization: z.boolean(),
  is_active: z.boolean(),
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
  success: z.boolean(),
  sha_reference: z.string().optional(),
  tracking_number: z.string().optional(),
  message: z.string().optional(),
  errors: z.array(z.string()).optional(),
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
  status: z.string(),
  salutation: z.string(),
  full_name: z.string(),
  gender: z.string(),
  first_name: z.string(),
  middle_name: z.string(),
  last_name: z.string(),
  registration_id: z.string(),
  external_reference_id: z.string(),
  licensing_body: z.string(),
  specialty: z.string(),
  is_active: z.number(),
  is_withdrawn: z.number(),
  withdrawal_reason: z.string(),
  withdrawal_date: z.string(),
  license_expires_in_days: z.number(),
});

export const DHAPractitionerLicenseSchema = z.object({
  id: z.string(),
  external_reference_id: z.string(),
  license_type: z.string(),
  license_start: z.string(),
  license_end: z.string(),
});

export const DHAPractitionerProfessionalDetailsSchema = z.object({
  professional_cadre: z.string(),
  practice_type: z.string(),
  specialty: z.string(),
  subspecialty: z.string(),
  discipline_name: z.string(),
  educational_qualifications: z.string(),
});

export const DHAPractitionerContactsSchema = z.object({
  phone: z.string(),
  email: z.string(),
  postal_address: z.string(),
});

export const DHAPractitionerIdentifiersSchema = z.object({
  identification_type: z.string(),
  identification_number: z.string(),
  client_registry_id: z.string(),
  student_id: z.string(),
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

export const PaginatedSHAInterventionsSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
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
});

export type SendOTPResponseSchemaType = z.infer<typeof SendOTPResponseSchema>;

export const ValidateOTPResponseSchema = z.object({
  consent_id: z.number(),
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
  preauth_id: z.number(),
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
  otp: z.string().min(1),
  patient_id: z.string().min(1),
  intervention_codes: z.array(z.string().min(1)),
  service_type: z.enum(['OUTPATIENT', 'INPATIENT']).default('OUTPATIENT'),
  admission_date: z.string().optional(),
  estimated_days_of_admission: z.number().int().nonnegative().optional(),
});

export type IlmStartVisitRequest = z.infer<typeof IlmStartVisitRequestSchema>;

export const IlmInterventionRequestSchema = z.object({
  intervention_code: z.string().min(1),
});
export type IlmInterventionRequest = z.infer<typeof IlmInterventionRequestSchema>;

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
