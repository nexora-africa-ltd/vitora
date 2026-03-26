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

export const DirectEligibilityCheckResponseSchema = z.object({
  is_eligible: z.boolean(),
  sha_number: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  coverage_end_date: z.string().nullable().optional(),
  copay_percentage: z.number(),
  reason: z.string().optional(),
  possible_solution: z.string().optional(),
  is_employed: z.boolean().optional(),
  employment_type: z.string().nullable().optional(),
  employer_name: z.string().nullable().optional(),
  nhif_transition_status: z.string().nullable().optional(),
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
// ARRAY RESPONSES
// =============================================================================

export const ClaimItemArraySchema = z.array(ClaimItemSchema);

// Legacy aliases for backwards compatibility
export const SHAMemberSearchResultSchema = SHAMemberSchema;
export const SHAClaimSchema = ClaimSchema;
export const SHAClaimItemSchema = ClaimItemSchema;
export const SHAPreauthorizationSchema = z.object({}).passthrough(); // TODO: implement when needed
export const PaginatedSHAClaimSchema = PaginatedClaimsSchema;
export const SHAClaimItemArrayResponseSchema = z.object({
  results: ClaimItemArraySchema,
});
