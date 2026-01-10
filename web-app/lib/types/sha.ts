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
  patient_id: number;
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

export interface DirectEligibilityCheckResponse {
  is_eligible: boolean;
  sha_number?: string | null;
  full_name?: string | null;
  coverage_end_date?: string | null;
  copay_percentage: number;
  reason?: string;
  possible_solution?: string;
  is_employed?: boolean;
  employment_type?: string;
  employer_name?: string | null;
  nhif_transition_status?: string;
  means_testing?: MeansTestingDetails;
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

export interface LOINCCode {
  id: number;
  code: string;
  component: string;
  long_common_name: string;
  property?: string;
  time_aspect?: string;
  system?: string;
  scale_type?: string;
  method_type?: string;
  class_name?: string;
  is_active: boolean;
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
  | 'pending' 
  | 'submitted' 
  | 'processing' 
  | 'approved' 
  | 'rejected' 
  | 'paid'
  | 'partial_approved';

export interface Claim {
  id: number;
  claim_number?: string;
  invoice_id: number;
  invoice_number?: string;
  encounter_id: number;
  patient_id?: number;
  patient_name?: string;
  patient_mrn?: string;
  
  status: ClaimStatus;
  sha_reference?: string;
  
  // Amounts
  total_amount: string;
  approved_amount?: string;
  rejected_amount?: string;
  copay_amount?: string;
  
  // Dates
  submitted_at?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
  
  // Rejection details
  rejection_reason?: string;
  rejection_codes?: string[];
  
  // FHIR bundle reference
  fhir_bundle_id?: string;
  
  // Metadata
  created_by?: number;
  submitted_by?: number;
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
// Practitioner Validation Types
// ============================================================================

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
export type PaginatedLOINCCodes = PaginatedResponse<LOINCCode>;
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
