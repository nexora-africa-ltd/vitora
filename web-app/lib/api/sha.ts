/**
 * SHA (Social Health Authority) API Client for Vitora HMIS
 *
 * Implements all SHA-related API operations including:
 * - Client Registry lookup and registration
 * - Eligibility verification
 * - Terminology lookups (ICD-11, ICHI, LOINC, Drugs)
 * - Claims management
 * - Facility and Practitioner validation
 *
 * @see docs/sha-frontend-integration-guide.md
 * @see backend/hmis/apps/billing/
 */
import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  ClientRegistryFetchResponseSchema,
  ClientRegistryRegisterResponseSchema,
  ClientRegistryUpdateResponseSchema,
  SHAMemberSchema,
  PaginatedSHAMembersSchema,
  EligibilityCheckResponseSchema,
  DirectEligibilityCheckResponseSchema,
  PaginatedICD11CodesSchema,
  PaginatedSHAInterventionsSchema,
  PaginatedICHICodesSchema,
  PaginatedLOINCCodesSchema,
  PaginatedDrugProductsSchema,
  PaginatedActiveComponentsSchema,
  ClaimSchema,
  PaginatedClaimsSchema,
  ClaimCreateResponseSchema,
  ClaimSubmitResponseSchema,
  FacilityValidationResponseSchema,
  DHAPractitionerSearchResponseSchema,
  PractitionerValidationResponseSchema,
  ConsentTokenSchema,
  SendOTPResponseSchema,
  ValidateOTPResponseSchema,
  PreauthRequestSchema,
  SubmitPreauthResponseSchema,
  PaginatedPreauthRequestsSchema,
} from '@/lib/schemas/sha.schema';
import type {
  // Client Registry
  ClientRegistryFetchRequest,
  ClientRegistryFetchResponse,
  ClientRegistryRegisterRequest,
  ClientRegistryRegisterResponse,
  ClientRegistryUpdateRequest,
  ClientRegistryUpdateResponse,
  // Eligibility
  SHAMember,
  PaginatedSHAMembers,
  EligibilityCheckRequest,
  EligibilityCheckResponse,
  DirectEligibilityCheckRequest,
  DirectEligibilityCheckResponse,
  // Terminology
  PaginatedICD11Codes,
  PaginatedSHAInterventions,
  PaginatedICHICodes,
  PaginatedLOINCCodes,
  PaginatedDrugProducts,
  PaginatedActiveComponents,
  TerminologySearchParams,
  InterventionSearchParams,
  DrugSearchParams,
  // Claims
  Claim,
  PaginatedClaims,
  ClaimCreateRequest,
  ClaimCreateResponse,
  ClaimSubmitResponse,
  ClaimListParams,
  // Facility/Practitioner
  FacilityValidationRequest,
  FacilityValidationResponse,
  PractitionerValidationRequest,
  PractitionerValidationResponse,
  // DHA Practitioner Registry
  DHAPractitionerSearchRequest,
  DHAPractitionerSearchResponse,
  DHAPractitioner,
  // DHA HIE Consent/Preauth
  ConsentToken,
  SendOTPRequest,
  SendOTPResponse,
  ValidateOTPRequest,
  ValidateOTPResponse,
  SubmitPreauthRequest,
  SubmitPreauthResponse,
  PreauthRequest,
} from '@/lib/types/sha';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build query string from params object
 */
function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  return searchParams.toString();
}

// ============================================================================
// Client Registry API
// ============================================================================

/**
 * Fetch client from SHA Client Registry by identifier
 */
async function fetchFromClientRegistry(
  data: ClientRegistryFetchRequest
): Promise<ClientRegistryFetchResponse> {
  const queryString = buildQueryString(data);
  const response = await apiClient.get(`/api/billing/client-registry/fetch/?${queryString}`);
  return parseResponse(ClientRegistryFetchResponseSchema, response.data, { context: 'shaApi.fetchFromClientRegistry' });
}

/**
 * Register a patient in the SHA Client Registry
 */
async function registerInClientRegistry(
  data: ClientRegistryRegisterRequest
): Promise<ClientRegistryRegisterResponse> {
  const response = await apiClient.post('/api/billing/client-registry/register/', data);
  return parseResponse(ClientRegistryRegisterResponseSchema, response.data, { context: 'shaApi.registerInClientRegistry' });
}

/**
 * Update patient information in the SHA Client Registry
 */
async function updateClientRegistry(
  data: ClientRegistryUpdateRequest
): Promise<ClientRegistryUpdateResponse> {
  const response = await apiClient.put('/api/billing/client-registry/update/', data);
  return parseResponse(ClientRegistryUpdateResponseSchema, response.data, { context: 'shaApi.updateClientRegistry' });
}

// ============================================================================
// SHA Members API
// ============================================================================

/**
 * Get SHA member records for a patient
 */
async function getSHAMembers(params?: { patient?: number }): Promise<PaginatedSHAMembers> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/sha-members/?${queryString}`
    : '/api/billing/sha-members/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedSHAMembersSchema, response.data, { context: 'shaApi.getSHAMembers' });
}

/**
 * Get a specific SHA member record
 */
async function getSHAMember(id: number): Promise<SHAMember> {
  const response = await apiClient.get(`/api/billing/sha-members/${id}/`);
  return parseResponse(SHAMemberSchema, response.data, { context: 'shaApi.getSHAMember' });
}

/**
 * Get dependents for a principal SHA member
 * Returns all SHA members who have this member as their principal
 */
async function getSHAMemberDependents(memberId: number): Promise<PaginatedSHAMembers> {
  const response = await apiClient.get(`/api/billing/sha-members/${memberId}/dependents/`);
  return parseResponse(PaginatedSHAMembersSchema, response.data, { context: 'shaApi.getSHAMemberDependents' });
}

// ============================================================================
// Eligibility API
// ============================================================================

/**
 * Check patient eligibility with SHA
 */
async function checkEligibility(
  data: EligibilityCheckRequest
): Promise<EligibilityCheckResponse> {
  const response = await apiClient.post('/api/billing/eligibility/check/', data);
  return parseResponse(EligibilityCheckResponseSchema, response.data, { context: 'shaApi.checkEligibility' });
}

/**
 * Get eligibility for a patient by patient ID
 * Combines member lookup + eligibility check
 *
 * If no SHA member record exists in the local database, falls back to
 * direct eligibility check using the patient's identification number.
 */
async function checkPatientEligibility(
  patientId: number
): Promise<EligibilityCheckResponse & { member?: SHAMember }> {
  // First get the SHA member record
  const membersResponse = await getSHAMembers({ patient: patientId });

  if (!membersResponse.results.length) {
    // No SHA member record - try direct eligibility check
    // First fetch the patient to get their identification info
    try {
      const patientResponse = await apiClient.get(`/api/patients/${patientId}/`);
      const patient = patientResponse.data;

      // Build eligibility check params based on available ID
      const params: DirectEligibilityCheckRequest = {};

      if (patient.identification_type === 'national_id' && patient.identification_number) {
        params.national_id = patient.identification_number;
      } else if (patient.national_id) {
        // Legacy field
        params.national_id = patient.national_id;
      } else if (patient.identification_type === 'cr_number' && patient.identification_number) {
        params.sha_number = patient.identification_number;
      } else if (patient.sha_number) {
        params.sha_number = patient.sha_number;
      } else if (patient.identification_number) {
        // Try with whatever ID we have
        params.identification_type = patient.identification_type;
        params.identification_number = patient.identification_number;
      }

      // If we have identification info, do direct check
      if (Object.keys(params).length > 0) {
        const directResponse = await checkDirectEligibility(params);
        return {
          is_eligible: directResponse.is_eligible,
          copay_percentage: directResponse.copay_percentage,
          checked_at: new Date().toISOString(),
          verified_name: directResponse.full_name || undefined,
          coverage_end_date: directResponse.coverage_end_date || undefined,
          message: directResponse.is_eligible
            ? 'SHA coverage verified via direct lookup'
            : directResponse.reason || 'Patient is not eligible for SHA coverage',
        };
      }
    } catch (error) {
      console.error('Direct eligibility check failed:', error);
    }

    // Fallback: no SHA member record and direct check failed
    return {
      is_eligible: false,
      copay_percentage: 100,
      checked_at: new Date().toISOString(),
      message: 'Patient is not enrolled in SHA',
    };
  }

  const member = membersResponse.results[0];

  // Then check eligibility
  const eligibilityResponse = await checkEligibility({ sha_member_id: member!.id });

  return {
    ...eligibilityResponse,
    member,
  };
}

/**
 * Check SHA eligibility directly by national ID without needing an SHAMember record
 * Useful during patient registration/lookup to verify SHA coverage status
 */
async function checkDirectEligibility(
  params: DirectEligibilityCheckRequest
): Promise<DirectEligibilityCheckResponse> {
  const queryString = buildQueryString(params);
  const response = await apiClient.get(`/api/billing/eligibility/direct/?${queryString}`);
  return parseResponse(DirectEligibilityCheckResponseSchema, response.data, { context: 'shaApi.checkDirectEligibility' });
}

// ============================================================================
// Terminology API - ICD-11
// ============================================================================

/**
 * Search ICD-11 diagnosis codes
 */
async function searchICD11(params?: TerminologySearchParams): Promise<PaginatedICD11Codes> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/terminology/icd11/?${queryString}`
    : '/api/billing/terminology/icd11/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedICD11CodesSchema, response.data, { context: 'shaApi.searchICD11' });
}

// ============================================================================
// Terminology API - Interventions
// ============================================================================

/**
 * Search SHA interventions/procedures
 */
async function searchInterventions(
  params?: InterventionSearchParams
): Promise<PaginatedSHAInterventions> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/terminology/interventions/?${queryString}`
    : '/api/billing/terminology/interventions/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedSHAInterventionsSchema, response.data, { context: 'shaApi.searchInterventions' });
}

// ============================================================================
// Terminology API - ICHI
// ============================================================================

/**
 * Search ICHI (International Classification of Health Interventions) codes
 */
async function searchICHI(params?: TerminologySearchParams): Promise<PaginatedICHICodes> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/terminology/ichi/?${queryString}`
    : '/api/billing/terminology/ichi/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedICHICodesSchema, response.data, { context: 'shaApi.searchICHI' });
}

// ============================================================================
// Terminology API - LOINC
// ============================================================================

/**
 * Search LOINC lab test codes
 */
async function searchLOINC(params?: TerminologySearchParams): Promise<PaginatedLOINCCodes> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/terminology/loinc/?${queryString}`
    : '/api/billing/terminology/loinc/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedLOINCCodesSchema, response.data, { context: 'shaApi.searchLOINC' });
}

// ============================================================================
// Terminology API - Drugs
// ============================================================================

/**
 * Search Kenya drug registry
 */
async function searchDrugs(params?: DrugSearchParams): Promise<PaginatedDrugProducts> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/terminology/drugs/?${queryString}`
    : '/api/billing/terminology/drugs/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedDrugProductsSchema, response.data, { context: 'shaApi.searchDrugs' });
}

/**
 * Search drug active components/ingredients
 */
async function searchActiveComponents(
  params?: TerminologySearchParams
): Promise<PaginatedActiveComponents> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/terminology/active-components/?${queryString}`
    : '/api/billing/terminology/active-components/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedActiveComponentsSchema, response.data, { context: 'shaApi.searchActiveComponents' });
}

// ============================================================================
// Claims API
// ============================================================================

/**
 * Get list of claims
 */
async function getClaims(params?: ClaimListParams): Promise<PaginatedClaims> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/claims/?${queryString}`
    : '/api/billing/claims/';
  const response = await apiClient.get(url);
  return parseResponse(PaginatedClaimsSchema, response.data, { context: 'shaApi.getClaims' });
}

/**
 * Get a specific claim
 */
async function getClaim(id: number): Promise<Claim> {
  const response = await apiClient.get(`/api/billing/claims/${id}/`);
  return parseResponse(ClaimSchema, response.data, { context: 'shaApi.getClaim' });
}

/**
 * Create a new claim from invoice
 */
async function createClaim(data: ClaimCreateRequest): Promise<ClaimCreateResponse> {
  const response = await apiClient.post('/api/billing/claims/', data);
  return parseResponse(ClaimCreateResponseSchema, response.data, { context: 'shaApi.createClaim' });
}

/**
 * Submit claim to SHA
 */
async function submitClaim(claimId: number): Promise<ClaimSubmitResponse> {
  const response = await apiClient.post(`/api/billing/claims/${claimId}/submit/`);
  return parseResponse(ClaimSubmitResponseSchema, response.data, { context: 'shaApi.submitClaim' });
}

/**
 * Resubmit a rejected claim
 */
async function resubmitClaim(claimId: number): Promise<ClaimSubmitResponse> {
  const response = await apiClient.post(`/api/billing/claims/${claimId}/resubmit/`);
  return parseResponse(ClaimSubmitResponseSchema, response.data, { context: 'shaApi.resubmitClaim' });
}

/**
 * Cancel a draft claim
 */
async function cancelClaim(claimId: number): Promise<void> {
  await apiClient.post(`/api/billing/claims/${claimId}/cancel/`);
}

/**
 * Get claim FHIR bundle preview
 */
async function getClaimBundle(claimId: number): Promise<unknown> {
  const response = await apiClient.get(`/api/billing/claims/${claimId}/bundle/`);
  return response.data;
}

// ============================================================================
// Facility Validation API
// ============================================================================

/**
 * Validate facility MFL code with DHA
 */
async function validateFacility(
  data: FacilityValidationRequest
): Promise<FacilityValidationResponse> {
  const response = await apiClient.post('/api/billing/dha/validate-facility/', data);
  return parseResponse(FacilityValidationResponseSchema, response.data, { context: 'shaApi.validateFacility' });
}

// ============================================================================
// DHA Health Worker Registry API
// Based on: https://uat.dha.go.ke/v1/practitioner-search
// ============================================================================

/**
 * Search DHA Health Worker Registry by National ID or Passport
 *
 * This searches the Kenya Digital Health Authority registry for registered
 * healthcare practitioners and returns comprehensive information including:
 * - Membership status and registration details
 * - License history with start/end dates
 * - Professional qualifications and cadre
 * - Contact information
 *
 * @param params - Search parameters (ID type and number)
 * @returns Practitioner data from DHA registry
 */
async function searchPractitioner(
  params: DHAPractitionerSearchRequest
): Promise<DHAPractitionerSearchResponse> {
  const queryString = buildQueryString(params);
  const response = await apiClient.get(`/api/sha/practitioner/validate/?${queryString}`);
  return parseResponse(DHAPractitionerSearchResponseSchema, response.data, { context: 'shaApi.searchPractitioner' });
}

/**
 * Legacy: Validate practitioner HWR number with DHA
 * @deprecated Use searchPractitioner instead for richer data
 */
async function validatePractitioner(
  data: PractitionerValidationRequest
): Promise<PractitionerValidationResponse> {
  const response = await apiClient.post('/api/billing/dha/validate-practitioner/', data);
  return parseResponse(PractitionerValidationResponseSchema, response.data, { context: 'shaApi.validatePractitioner' });
}

// ============================================================================
// DHA HIE Consent API
// ============================================================================

/**
 * Send OTP to SHA member for consent verification
 */
async function sendConsentOTP(data: SendOTPRequest): Promise<SendOTPResponse> {
  const response = await apiClient.post('/api/sha/consent/send-otp/', data);
  return parseResponse(SendOTPResponseSchema, response.data, { context: 'shaApi.sendConsentOTP' });
}

/**
 * Validate OTP code to obtain consent token
 */
async function validateConsentOTP(data: ValidateOTPRequest): Promise<ValidateOTPResponse> {
  const response = await apiClient.post('/api/sha/consent/validate-otp/', data);
  return parseResponse(ValidateOTPResponseSchema, response.data, { context: 'shaApi.validateConsentOTP' });
}

/**
 * Get consent token details
 */
async function getConsentDetail(consentId: number): Promise<ConsentToken> {
  const response = await apiClient.get(`/api/sha/consent/${consentId}/`);
  return parseResponse(ConsentTokenSchema, response.data, { context: 'shaApi.getConsentDetail' });
}

// ============================================================================
// DHA HIE Pre-authorization API
// ============================================================================

/**
 * Submit pre-authorization request for a claim
 */
async function submitPreauth(data: SubmitPreauthRequest): Promise<SubmitPreauthResponse> {
  const response = await apiClient.post('/api/sha/preauth/submit/', data);
  return parseResponse(SubmitPreauthResponseSchema, response.data, { context: 'shaApi.submitPreauth' });
}

/**
 * Get pre-authorization request status (polls DHA)
 */
async function getPreauthStatus(preauthId: number): Promise<PreauthRequest> {
  const response = await apiClient.get(`/api/sha/preauth/${preauthId}/status/`);
  return parseResponse(PreauthRequestSchema, response.data, { context: 'shaApi.getPreauthStatus' });
}

/**
 * Get list of pending pre-authorization requests
 */
async function getPendingPreauths(): Promise<{ count: number; next: string | null; previous: string | null; results: PreauthRequest[] }> {
  const response = await apiClient.get('/api/sha/preauth/pending/');
  return parseResponse(PaginatedPreauthRequestsSchema, response.data, { context: 'shaApi.getPendingPreauths' });
}

// ============================================================================
// Export API Object
// ============================================================================

export const shaApi = {
  // Client Registry
  fetchFromClientRegistry,
  registerInClientRegistry,
  updateClientRegistry,

  // SHA Members
  getSHAMembers,
  getSHAMember,
  getSHAMemberDependents,

  // Eligibility
  checkEligibility,
  checkPatientEligibility,
  checkDirectEligibility,

  // Terminology - ICD-11
  searchICD11,

  // Terminology - Interventions
  searchInterventions,

  // Terminology - ICHI
  searchICHI,

  // Terminology - LOINC
  searchLOINC,

  // Terminology - Drugs
  searchDrugs,
  searchActiveComponents,

  // Claims
  getClaims,
  getClaim,
  createClaim,
  submitClaim,
  resubmitClaim,
  cancelClaim,
  getClaimBundle,

  // Facility Validation
  validateFacility,

  // DHA Health Worker Registry
  searchPractitioner,

  // Legacy Practitioner Validation (deprecated)
  validatePractitioner,

  // DHA HIE Consent
  sendConsentOTP,
  validateConsentOTP,
  getConsentDetail,

  // DHA HIE Pre-authorization
  submitPreauth,
  getPreauthStatus,
  getPendingPreauths,
};
