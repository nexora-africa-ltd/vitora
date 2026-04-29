/**
 * SHA (Social Health Authority) Type Definitions for Vitora HMIS
 * Based on DHA API integration and FHIR R4 standards
 *
 * @see docs/sha-frontend-integration-guide.md
 * @see docs/dha-api-usage-analysis.md
 */

// ============================================================================
// Client Registry Types
// ============================================================================

export interface ClientRegistryClient {
  client_number: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  national_id?: string;
  huduma_number?: string;
  passport_number?: string;
  alien_id?: string;
  kra_pin?: string;
  mandate_number?: string;
  phone_number?: string;
  email?: string;
  county?: string;
  sub_county?: string;
  ward?: string;
  address?: string;
  citizenship?: string;
  place_of_birth?: string;
  is_person_with_disability?: boolean;
}

export interface ClientRegistryFetchRequest {
  national_id?: string;
  huduma_number?: string;
  passport_number?: string;
  alien_id?: string;
  kra_pin?: string;
  mandate_number?: string;
  cr_number?: string;
  identification_type?: string;
  identification_number?: string;
}

export interface ClientRegistryFetchResponse {
  found: boolean;
  client?: ClientRegistryClient;
  message?: string;
}

export interface ClientRegistryRegisterRequest {
  patient_id: number;
}

export interface ClientRegistryRegisterResponse {
  success: boolean;
  client_number?: string;
  message?: string;
}

export interface ClientRegistryUpdateRequest {
  client_number: string;
  phone_number?: string;
  email?: string;
  county?: string;
  sub_county?: string;
}

export interface ClientRegistryUpdateResponse {
  success: boolean;
  message?: string;
}

// Client Registry lookup states for UI
export type CRLookupStatus = 'idle' | 'searching' | 'found' | 'not_found' | 'error';

// ============================================================================
// Eligibility Types
// ============================================================================

export type EligibilityStatus =
  | 'checking'
  | 'eligible'
  | 'ineligible'
  | 'expired'
  | 'pending'
  | 'error';

export type SchemeCategory =
  | 'SHIF_EMPLOYED'
  | 'SHIF_SELF_EMPLOYED'
  | 'SHIF_INDIGENT'
  | 'SHIF_ELDERLY'
  | 'SHIF_PWD'
  | 'SHIF_STUDENT'
  | 'NHIF_LEGACY'
  | 'UNKNOWN';

// PFMS (Public Finance Management System) Categories
// For vulnerable populations eligible for government subsidy
export type PFMSCategory =
  | 'vulnerable'
  | 'elderly'
  | 'disabled'
  | 'orphan'
  | 'indigent';

export const PFMS_CATEGORY_LABELS: Record<PFMSCategory, string> = {
  vulnerable: 'Vulnerable Population',
  elderly: 'Elderly (65+)',
  disabled: 'Persons with Disability',
  orphan: 'Orphan/Vulnerable Child',
  indigent: 'Indigent',
};

// Coverage type for claim items (SHA Integration Checklist #13)
export type CoverageType = 'sha' | 'pfms' | 'both';

export const COVERAGE_TYPE_LABELS: Record<CoverageType, string> = {
  sha: 'SHA Coverage',
  pfms: 'PFMS Coverage (Government Subsidy)',
  both: 'Split Between SHA and PFMS',
};

export interface SHAMember {
  id: number;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;
  sha_member_number: string;
  scheme_category: SchemeCategory;
  coverage_start_date: string;
  coverage_end_date?: string;
  is_active: boolean;
  // Membership type (for dependents tracking)
  membership_type?: 'PRINCIPAL' | 'SPOUSE' | 'CHILD' | 'PARENT' | 'OTHER';
  principal_sha_number?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'EXPIRED' | 'active' | 'inactive' | 'pending_verification' | 'suspended' | 'expired';
  // PFMS fields (SHA Integration Checklist #13)
  is_pfms_eligible: boolean;
  pfms_category?: PFMSCategory;
  pfms_category_display?: string;
  pfms_verified: boolean;
  pfms_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EligibilityCheckRequest {
  sha_member_id: number;
}

export interface EligibilityCheckResponse {
  is_eligible: boolean;
  coverage_end_date?: string;
  copay_percentage: number;
  scheme_category?: SchemeCategory;
  verified_name?: string;
  checked_at: string;
  message?: string;
}

// Direct eligibility check (without SHAMember record)
export interface DirectEligibilityCheckRequest {
  national_id?: string;
  sha_number?: string;
  identification_type?: string;
  identification_number?: string;
}

// Means testing details from SHA API
export interface MeansTestingDetails {
  record_id?: string;
  contribution?: number;
  monthly_contribution?: number;
  annual_contribution?: number;
  mt_date?: string;
  appeal_status?: string;
  income_prediction_category?: string;
  means_testing_done?: number;
}

// SHA Dependent information
export interface SHADependent {
  name: string;
  relationship?: string;
  date_of_birth?: string;
  age?: number;
  sha_number?: string;
  is_active?: boolean;
}

export interface SHAEligibilitySchemePolicy {
  startDate?: string;
  endDate?: string;
  number?: string;
}

export interface SHAEligibilitySchemeCoverage {
  startDate?: string;
  endDate?: string;
  message?: string;
  reason?: string;
  status?: string | number | boolean | null;
}

export interface SHAEligibilityPrincipalContributor {
  idNumber?: string;
  idType?: string;
  crNumber?: string;
  name?: string;
  relationship?: string;
  employmentType?: string;
  employerDetails?: {
    name?: string;
  };
}

export interface SHAEligibilityScheme {
  schemeName?: string;
  schemeId?: number;
  memberType?: string;
  policy?: SHAEligibilitySchemePolicy;
  coverage?: SHAEligibilitySchemeCoverage;
  principalContributor?: SHAEligibilityPrincipalContributor;
}

export interface SHAPayloadIdentifier {
  identification_type?: string;
  identification_number?: string;
}

export interface SHAPayloadPerson {
  source: 'principal' | 'dependent';
  relationship?: string;
  id?: string;
  resourceType?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  citizenship?: string;
  employment_type?: string;
  civil_status?: string;
  identification_type?: string;
  identification_number?: string;
  other_identifications?: SHAPayloadIdentifier[];
  phone?: string;
  country?: string;
  county?: string;
  sub_county?: string;
  ward?: string;
  village_estate?: string;
  province_state_country?: string;
  zip_code?: string;
  postal_address?: string;
  id_serial?: string;
  sha_number?: string;
  cr_number?: string;
  household_number?: string;
}

export interface DirectEligibilityCheckResponse {
  is_eligible: boolean;
  sha_number?: string | null;
  full_name?: string | null;
  coverage_end_date?: string | null;
  copay_percentage: number;
  reason?: string;
  possible_solution?: string | null;
  is_employed?: boolean;
  employment_type?: string | null;
  employer_name?: string | null;
  nhif_transition_status?: string | null;
  status_code?: string | null;
  status_desc?: string | null;
  member_cr_number?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  age?: number | null;
  whitelisted_for_otp?: boolean;
  schemes?: SHAEligibilityScheme[];
  means_testing?: MeansTestingDetails | null;
  dependents?: SHADependent[];
  dependents_covered?: number;
  raw_response?: Record<string, unknown>;
  error?: string | null;
}

export interface EligibilityState {
  status: EligibilityStatus;
  member?: SHAMember;
  coverageEndDate?: string;
  copayPercentage?: number;
  schemeCategory?: SchemeCategory;
  memberName?: string;
  checkedAt?: string;
  errorMessage?: string;
}

// ============================================================================
// SHA Terminology / Catalog Types
// ============================================================================

export interface ICD11Code {
  id: number;
  code: string;
  title: string;
  description?: string;
  chapter?: string;
  block?: string;
  is_active: boolean;
}

export interface SHAIntervention {
  id: number;
  code: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  currency: string;
  facility_level: number;
  requires_preauthorization: boolean;
  is_active: boolean;
}

export interface ICHICode {
  id: number;
  code: string;
  title: string;
  description?: string;
  block?: string;
  chapter?: string;
  is_active: boolean;
}

/**
 * LOINC code from terminology API.
 * Matches backend RemoteLOINCCode dataclass.
 */
export interface LOINCCode {
  /** LOINC code number (e.g., '2345-7') */
  loinc_num: string;
  /** What is measured */
  component: string;
  /** Full descriptive name */
  long_common_name?: string | null;
  /** Abbreviated name */
  short_name?: string | null;
  /** Kind of property */
  property?: string | null;
  /** Timing (Pt, 24H, etc.) */
  time_aspect?: string | null;
  /** Body system/specimen */
  system?: string | null;
  /** Scale (Qn, Ord, etc.) */
  scale_type?: string | null;
  /** Method used */
  method_type?: string | null;
  /** Status (ACTIVE, deprecated, etc.) */
  status?: string;
  /** Original API response */
  raw_data?: Record<string, unknown>;
}

export interface DrugProduct {
  id: number;
  code: string;
  name: string;
  generic_name?: string;
  brand_name?: string;
  dosage_form?: string;
  strength?: string;
  route_of_administration?: string;
  manufacturer?: string;
  price?: number;
  currency?: string;
  is_controlled: boolean;
  is_active: boolean;
}

export interface ActiveComponent {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
}

// ============================================================================
// Terminology Search Types
// ============================================================================

export interface TerminologySearchParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export interface InterventionSearchParams extends TerminologySearchParams {
  facility_level?: number;
  category?: string;
}

export interface DrugSearchParams extends TerminologySearchParams {
  dosage_form?: string;
  is_controlled?: boolean;
}

// ============================================================================
// Claim Types
// ============================================================================

export type ClaimStatus =
  | 'draft'
  | 'validated'
  | 'pending_submission'
  | 'pending'
  | 'submitted'
  | 'acknowledged'
  | 'under_review'
  | 'processing'
  | 'query'
  | 'approved'
  | 'partial'
  | 'partial_approved'
  | 'rejected'
  | 'appealed'
  | 'paid'
  | 'written_off';

/**
 * SHA Claim interface - matches backend SHAClaimSerializer.
 *
 * Note: Some fields have aliases for backward compatibility:
 * - total_amount (frontend) ↔ claimed_amount (backend)
 * - copay_amount (frontend) ↔ patient_copay (backend)
 * - sha_reference (frontend) ↔ sha_claim_reference (backend)
 * - invoice_id/encounter_id/patient_id (frontend) ↔ invoice/encounter/patient (backend)
 */
export interface Claim {
  // Primary identifiers
  id: number;
  claim_number?: string;

  // Backend uses 'sha_claim_reference', frontend alias 'sha_reference'
  sha_claim_reference?: string | null;
  sha_reference?: string | null; // Backward compatibility alias

  // Foreign keys - backend uses plain names, frontend uses _id suffix
  patient?: number | null;
  patient_id?: number | null; // Backward compatibility alias
  sha_member?: number | null;
  sha_member_number?: string | null;
  encounter?: number | null;
  encounter_id?: number | null; // Backward compatibility alias
  invoice?: number | null;
  invoice_id?: number | null; // Backward compatibility alias

  // Display fields
  patient_name?: string | null;
  patient_mrn?: string | null;
  invoice_number?: string | null;
  submitted_by_username?: string | null;

  // Claim details
  claim_type?: string | null;
  status: ClaimStatus;

  // Clinical dates
  service_date?: string | null;
  admission_date?: string | null;
  discharge_date?: string | null;

  // Diagnosis
  primary_diagnosis_code?: string | null;
  primary_diagnosis_description?: string | null;
  secondary_diagnosis_codes?: string[] | Record<string, unknown> | null;

  // Amounts - backend uses claimed_amount, frontend alias total_amount
  claimed_amount?: string | null;
  total_amount?: string; // Backward compatibility alias
  approved_amount?: string | null;
  paid_amount?: string | null;
  rejected_amount?: string | null; // Frontend-specific, may not be in backend
  patient_copay?: string | null;
  copay_amount?: string | null; // Backward compatibility alias

  // Submission
  submission_method?: string | null;
  submitted_at?: string | null;
  submitted_by?: number | null;

  // Adjudication
  adjudication_date?: string | null;
  adjudication_notes?: string | null;
  rejection_reason?: string | null;
  rejection_code?: string | null;
  rejection_codes?: string[] | null; // Frontend-specific array

  // Payment
  payment_date?: string | null;
  payment_reference?: string | null;

  // Preauthorization
  preauth_number?: string | null;
  preauth_date?: string | null;
  preauth_valid_until?: string | null;

  // Facility
  facility_code?: string | null;
  facility_level?: string | null;

  // Versioning
  version?: number | null;
  parent_claim?: number | null;

  // Computed counts
  items_count?: number | null;
  attachments_count?: number | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  processed_at?: string | null; // Frontend-specific

  // FHIR reference
  fhir_bundle_id?: string | null;
  created_by?: number | null;
}

// Claim Item with coverage type (SHA Integration Checklist #13)
export interface ClaimItem {
  id: number;
  claim: number;
  tariff?: number;
  tariff_code?: string;
  tariff_name?: string;
  service?: number;
  invoice_item?: number;
  description: string;
  service_date?: string;
  quantity: string | number;
  unit_price: string;
  claimed_amount: string;
  // PFMS coverage type
  coverage_type: CoverageType;
  coverage_type_display?: string;
  status: 'pending' | 'approved' | 'rejected' | 'adjusted';
  approved_quantity?: string | number;
  approved_amount?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface ClaimCreateRequest {
  invoice_id: number;
  encounter_id: number;
}

export interface ClaimCreateResponse {
  id: number;
  claim_number: string;
  status: ClaimStatus;
}

export interface ClaimSubmitResponse {
  success: boolean;
  sha_reference?: string;
  tracking_number?: string;
  message?: string;
  errors?: string[];
}

export interface ClaimListParams {
  page?: number;
  page_size?: number;
  status?: ClaimStatus;
  search?: string;
  patient?: number;
  encounter?: number;
  invoice?: number;
  start_date?: string;
  end_date?: string;
  ordering?: string;
}

// ============================================================================
// Facility Validation Types
// ============================================================================

export interface FacilityInfo {
  facility_code: string;
  name: string;
  level: number;
  county: string;
  sub_county?: string;
  ward?: string;
  operational_status: string;
  sha_approved: boolean;
  license_number?: string;
  license_expiry?: string;
  keph_level?: string;
  facility_type?: string;
  owner?: string;
  beds?: number;
}

export interface FacilityValidationRequest {
  facility_code: string;
}

export interface FacilityValidationResponse {
  valid: boolean;
  facility?: FacilityInfo;
  errors: string[];
  warnings?: string[];
}

export type FacilityValidationStatus =
  | 'idle'
  | 'validating'
  | 'valid'
  | 'invalid'
  | 'error';

// ============================================================================
// DHA Practitioner/Health Worker Registry Types
// Based on: https://uat.dha.go.ke/v1/practitioner-search API
// ============================================================================

/**
 * Practitioner membership details from DHA registry
 */
export interface DHAPractitionerMembership {
  id: string;                        // e.g., "PUID-0022840-4"
  status: string;                    // e.g., "Licensed", "Suspended", "Expired"
  salutation: string;                // e.g., "Dr.", "Mr.", "Ms."
  full_name: string;                 // Full name as registered
  gender: string;                    // e.g., "M", "F"
  first_name: string;
  middle_name: string;
  last_name: string;
  registration_id: string;           // e.g., "PUID-059839"
  external_reference_id: string;     // e.g., "24120"
  licensing_body: string;            // e.g., "Clinical Officers Council", "KMPDB", "NCK"
  specialty: string;                 // e.g., "CLINICAL OFFICER", "MEDICAL OFFICER"
  is_active: number;                 // 1 = active, 0 = inactive
  is_withdrawn: number;              // 1 = withdrawn, 0 = not withdrawn
  withdrawal_reason: string;
  withdrawal_date: string;
  license_expires_in_days: number;   // Days until license expires
}

/**
 * Practitioner license record from DHA
 */
export interface DHAPractitionerLicense {
  id: string;                        // e.g., "COC-Clinical Officer-2026-620095"
  external_reference_id: string;     // e.g., "Rb01923/25"
  license_type: string;              // e.g., "Clinical Officer", "Annual"
  license_start: string;             // Date string or "None"
  license_end: string;               // Date string (expiry)
}

/**
 * Professional details from DHA
 */
export interface DHAPractitionerProfessionalDetails {
  professional_cadre: string;        // e.g., "CLINICAL OFFICER", "MEDICAL OFFICER"
  practice_type: string;             // e.g., "Clinical Officer"
  specialty: string;
  subspecialty: string;
  discipline_name: string;           // e.g., "Clinical Officer"
  educational_qualifications: string; // e.g., "DIPLOMA - CLINICAL MEDICINE & SURGERY (KMTC)"
}

/**
 * Contact information from DHA
 */
export interface DHAPractitionerContacts {
  phone: string;                     // e.g., "0769005262"
  email: string;                     // e.g., "example@gmail.com"
  postal_address: string;            // e.g., "P O BOX 221-20303 OL KALAU"
}

/**
 * Identifier information from DHA
 */
export interface DHAPractitionerIdentifiers {
  identification_type: string;       // e.g., "National ID", "Passport"
  identification_number: string;     // e.g., "1111111"
  client_registry_id: string;
  student_id: string;
}

/**
 * Complete practitioner data from DHA Health Worker Registry
 */
export interface DHAPractitioner {
  membership: DHAPractitionerMembership;
  licenses: DHAPractitionerLicense[];
  professional_details: DHAPractitionerProfessionalDetails;
  contacts: DHAPractitionerContacts;
  identifiers: DHAPractitionerIdentifiers;
}

/**
 * DHA API response wrapper
 */
export interface DHAPractitionerSearchResponse {
  message: DHAPractitioner;
}

/**
 * Search request parameters
 */
export interface DHAPractitionerSearchRequest {
  identification_type: 'National ID' | 'passport';
  identification_number: string;
}

// Legacy types kept for backward compatibility
export interface PractitionerInfo {
  hwr_number: string;
  name: string;
  cadre: string;
  specialization?: string;
  license_status: string;
  license_expiry?: string;
  registration_board?: string;
  facility_code?: string;
}

export interface PractitionerValidationRequest {
  hwr_number: string;
}

export interface PractitionerValidationResponse {
  valid: boolean;
  practitioner?: PractitionerInfo;
  errors: string[];
}

// ============================================================================
// Paginated Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type PaginatedSHAMembers = PaginatedResponse<SHAMember>;
export type PaginatedClaims = PaginatedResponse<Claim>;
export type PaginatedICD11Codes = PaginatedResponse<ICD11Code>;
export type PaginatedSHAInterventions = PaginatedResponse<SHAIntervention>;
export type PaginatedICHICodes = PaginatedResponse<ICHICode>;

/**
 * Terminology search response (not truly paginated - returns { results, count, source? }).
 */
export interface TerminologySearchResponse<T> {
  count: number;
  results: T[];
  source?: string;
}

export type PaginatedLOINCCodes = TerminologySearchResponse<LOINCCode>;
export type PaginatedDrugProducts = PaginatedResponse<DrugProduct>;
export type PaginatedActiveComponents = PaginatedResponse<ActiveComponent>;

// ============================================================================
// API Response Wrapper Type
// ============================================================================

export interface SHAApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SHAApiResponse<T> {
  success: boolean;
  data?: T;
  error?: SHAApiError;
}
