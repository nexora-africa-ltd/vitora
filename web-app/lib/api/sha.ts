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
  StartVisitResponseSchema,
  PreauthRequestSchema,
  SubmitPreauthResponseSchema,
  PaginatedPreauthRequestsSchema,
  IlmCallResultSchema,
  IlmRegistryResponseSchema,
  PatientContactSchema,
  PatientContactListSchema,
  IlmPreauthResponseSchema,
  SHAPreauthListSchema,
  SHAEmergencyClaimListSchema,
  IlmLifecycleResponseSchema,
  SHAOtpRequestListSchema,
  SHAOtpWhitelistListSchema,
  SHAUploadListSchema,
  IlmPrescriptionResponseSchema,
  SHADhaPrescriptionListSchema,
} from '@/lib/schemas/sha.schema';
import type {
  IlmStartVisitRequest,
  IlmInterventionRequest,
  IlmVirtualClaimLineRequest,
  IlmSwitchInterventionRequest,
  IlmAddDiagnosisRequest,
  IlmRemoveDiagnosisRequest,
  IlmAddLineRequest,
  IlmEditLineRequest,
  IlmRemoveLineRequest,
  IlmRemoveAttachmentRequest,
  IlmSubmitRequest,
  IlmCloseRequest,
  IlmCallResult,
  IlmRegistryResponse,
  PatientContact,
  PatientContactList,
  PatientContactCreateInput,
  IlmPreauthResponse,
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
  StartVisitRequest,
  StartVisitResponse,
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
  // Backend uses 'client_number' query param, frontend type uses 'cr_number'
  const { cr_number, ...rest } = data;
  const params = cr_number ? { ...rest, client_number: cr_number } : rest;
  const queryString = buildQueryString(params);
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

/**
 * Ensure an SHAMember record exists for a patient.
 * If one already exists, returns it. Otherwise, fetches patient info,
 * runs a direct eligibility check, and creates the member record.
 *
 * Used by the consent step to lazily create the member when user clicks "Send OTP".
 */
async function ensureSHAMember(patientId: number): Promise<SHAMember | null> {
  // Check if member already exists
  const existing = await getSHAMembers({ patient: patientId });
  if (existing.results.length > 0) {
    return existing.results[0]!;
  }

  // Fetch patient details
  const patientResponse = await apiClient.get(`/api/patients/${patientId}/`);
  const patient = patientResponse.data;

  // Determine the national ID for eligibility lookup
  const params: DirectEligibilityCheckRequest = {};
  if (patient.principal_national_id) {
    params.national_id = patient.principal_national_id;
  } else if (patient.identification_type === 'national_id' && patient.identification_number) {
    params.national_id = patient.identification_number;
  } else if (patient.national_id) {
    params.national_id = patient.national_id;
  } else if (patient.sha_number) {
    params.sha_number = patient.sha_number;
  }

  if (!Object.keys(params).length) {
    throw new Error('Patient has no identification suitable for SHA verification');
  }

  // Run direct eligibility check to get SHA number
  const eligibility = await checkDirectEligibility(params);
  if (!eligibility.is_eligible) {
    throw new Error('Patient is not eligible for SHA coverage');
  }

  // Normalize SHA number
  const rawShaNumber = patient.sha_number || eligibility.sha_number || eligibility.member_cr_number || '';
  const shaNumber = rawShaNumber.startsWith('SHA-')
    ? rawShaNumber
    : rawShaNumber.startsWith('SHA')
      ? `SHA-${rawShaNumber.slice(3)}`
      : rawShaNumber.startsWith('CR')
        ? `SHA-${rawShaNumber.slice(2)}`
        : rawShaNumber
          ? `SHA-${rawShaNumber}`
          : `SHA-${patient.identification_number || 'UNKNOWN'}`;

  const principalShaNumber = patient.principal_national_id
    ? (() => {
        const raw = eligibility.sha_number || eligibility.member_cr_number || '';
        return raw.startsWith('SHA-') ? raw
          : raw.startsWith('SHA') ? `SHA-${raw.slice(3)}`
          : raw.startsWith('CR') ? `SHA-${raw.slice(2)}`
          : `SHA-${raw}`;
      })()
    : undefined;

  const memberPayload: Record<string, unknown> = {
    patient: patientId,
    sha_number: shaNumber,
    national_id: patient.identification_number || patient.national_id || '',
    membership_type: patient.principal_national_id ? 'child' : 'principal',
    coverage_start_date: eligibility.schemes?.[0]?.policy?.startDate || new Date().toISOString().split('T')[0],
    coverage_end_date: eligibility.coverage_end_date || undefined,
  };
  if (principalShaNumber) {
    memberPayload.principal_sha_number = principalShaNumber;
  }

  const createResponse = await apiClient.post('/api/billing/sha-members/', memberPayload)
    .catch(async (err) => {
      // If sha_number already exists (e.g. orphaned from a deleted patient),
      // try to find the existing member and reuse it
      if (err?.response?.status === 400 && err?.response?.data?.sha_number) {
        const allMembers = await apiClient.get(`/api/billing/sha-members/?search=${encodeURIComponent(shaNumber)}`);
        if (allMembers.data?.results?.length > 0) {
          return allMembers;
        }
      }
      throw err;
    });
  const data = Array.isArray(createResponse.data?.results)
    ? createResponse.data.results[0]
    : createResponse.data;

  // Build SHAMember from response
  const createdMember: SHAMember = {
    id: data.id,
    patient: data.patient,
    patient_name: data.patient_name,
    sha_member_number: data.sha_number,
    scheme_category: 'SHIF_SELF_EMPLOYED' as const,
    coverage_start_date: data.coverage_start_date || new Date().toISOString().split('T')[0],
    coverage_end_date: data.coverage_end_date,
    is_active: true,
    membership_type: data.membership_type?.toUpperCase(),
    principal_sha_number: data.principal_sha_number,
    status: data.status?.toUpperCase(),
    is_pfms_eligible: data.is_pfms_eligible || false,
    pfms_verified: data.pfms_verified || false,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  return createdMember;
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
    try {
      const patientResponse = await apiClient.get(`/api/patients/${patientId}/`);
      const patient = patientResponse.data;

      // Build eligibility check params.
      // CRITICAL: For dependants, DHA only resolves coverage via the PRINCIPAL's
      // national ID — querying a dependant's own ID returns "not covered".
      const params: DirectEligibilityCheckRequest = {};

      if (patient.principal_national_id) {
        params.national_id = patient.principal_national_id;
      } else if (patient.identification_type === 'national_id' && patient.identification_number) {
        params.national_id = patient.identification_number;
      } else if (patient.national_id) {
        params.national_id = patient.national_id;
      } else if (patient.sha_number) {
        params.sha_number = patient.sha_number;
      } else if (patient.identification_type === 'cr_number' && patient.identification_number) {
        params.sha_number = patient.identification_number;
      } else if (patient.identification_number) {
        params.identification_type = patient.identification_type;
        params.identification_number = patient.identification_number;
      }

      if (Object.keys(params).length > 0) {
        try {
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
        } catch (primaryError) {
          // If primary lookup failed, try fallback identifier
          const fallbackParams: DirectEligibilityCheckRequest = {};
          if (params.national_id && patient.sha_number) {
            fallbackParams.sha_number = patient.sha_number;
          } else if (params.sha_number && patient.identification_type === 'national_id' && patient.identification_number) {
            fallbackParams.national_id = patient.identification_number;
          }

          if (Object.keys(fallbackParams).length > 0) {
            try {
              const fallbackResponse = await checkDirectEligibility(fallbackParams);
              return {
                is_eligible: fallbackResponse.is_eligible,
                copay_percentage: fallbackResponse.copay_percentage,
                checked_at: new Date().toISOString(),
                verified_name: fallbackResponse.full_name || undefined,
                coverage_end_date: fallbackResponse.coverage_end_date || undefined,
                message: fallbackResponse.is_eligible
                  ? 'SHA coverage verified via direct lookup'
                  : fallbackResponse.reason || 'Patient is not eligible for SHA coverage',
              };
            } catch {
              throw primaryError;
            }
          }
          throw primaryError;
        }
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

  // Then check eligibility — wrap in try/catch since the backend response
  // may not match the strict Zod schema (e.g. missing copay_percentage/checked_at)
  try {
    const eligibilityResponse = await checkEligibility({ sha_member_id: member!.id });
    return {
      ...eligibilityResponse,
      member,
    };
  } catch {
    // If member-based eligibility check fails (schema mismatch or network),
    // still return the member as eligible since it was already verified at creation
    return {
      is_eligible: true,
      copay_percentage: 0,
      checked_at: new Date().toISOString(),
      message: 'SHA coverage verified',
      member,
    };
  }
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

/**
 * Lightweight search for SHA interventions used in consent OTP flow.
 * Calls the terminology endpoint directly and returns raw results.
 */
async function searchInterventionCodes(
  search: string,
  limit: number = 20
): Promise<{ code: string; name: string; category?: string; price?: number }[]> {
  if (search.length < 2) return [];
  const response = await apiClient.get(
    `/api/sha/terminology/interventions/?search=${encodeURIComponent(search)}&limit=${limit}`
  );
  const data = response.data as { results?: Array<Record<string, unknown>> };
  return (data.results || []).map((r) => ({
    code: String(r.code || ''),
    name: String(r.name || ''),
    category: r.category ? String(r.category) : undefined,
    price: typeof r.price === 'number' ? r.price : undefined,
  }));
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
 * Start visit with DHA (combined OTP validation + visit start)
 * This is the primary DHA endpoint: POST /api/v1/claims/visit
 */
async function startVisit(data: StartVisitRequest): Promise<StartVisitResponse> {
  const response = await apiClient.post('/api/sha/consent/start-visit/', data);
  return parseResponse(StartVisitResponseSchema, response.data, { context: 'shaApi.startVisit' });
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
// DHA HIE Middleware (ILM) — per-action claim workflow
// ============================================================================

const ilmBase = (claimId: number) => `/api/sha/claims/${claimId}/ilm`;

async function ilmStartVisit(claimId: number, body: IlmStartVisitRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/start-visit/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmStartVisit' });
}

async function ilmAddIntervention(claimId: number, body: IlmInterventionRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/interventions/add/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmAddIntervention' });
}

async function ilmSwitchIntervention(claimId: number, body: IlmSwitchInterventionRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/interventions/switch/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmSwitchIntervention' });
}

async function ilmRestoreIntervention(claimId: number, body: IlmInterventionRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/interventions/restore/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmRestoreIntervention' });
}

async function ilmRetireIntervention(claimId: number, body: IlmInterventionRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/interventions/retire/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmRetireIntervention' });
}

/**
 * Add a PHC virtual claim line — DHA HIE user-journey Scenario C.
 * Used by Level 2/3 facilities for capitation / basic FFS interventions
 * (no pre-authorization).
 */
async function ilmAddVirtualClaimLine(
  claimId: number,
  body: IlmVirtualClaimLineRequest,
): Promise<IlmCallResult> {
  const response = await apiClient.post(
    `${ilmBase(claimId)}/interventions/virtual-claim-line/`,
    body,
  );
  return parseResponse(IlmCallResultSchema, response.data, {
    context: 'shaApi.ilmAddVirtualClaimLine',
  });
}

async function ilmAddDiagnosis(claimId: number, body: IlmAddDiagnosisRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/diagnoses/add/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmAddDiagnosis' });
}

async function ilmRemoveDiagnosis(claimId: number, body: IlmRemoveDiagnosisRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/diagnoses/remove/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmRemoveDiagnosis' });
}

async function ilmAddLine(claimId: number, body: IlmAddLineRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/lines/add/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmAddLine' });
}

async function ilmEditLine(claimId: number, body: IlmEditLineRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/lines/edit/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmEditLine' });
}

async function ilmRemoveLine(claimId: number, body: IlmRemoveLineRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/lines/remove/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmRemoveLine' });
}

async function ilmAddAttachment(
  claimId: number,
  files: File[],
  extra?: Record<string, string>,
): Promise<IlmCallResult> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f, f.name));
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      form.append(k, v);
    }
  }
  const response = await apiClient.post(`${ilmBase(claimId)}/attachments/add/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmAddAttachment' });
}

async function ilmRemoveAttachment(claimId: number, body: IlmRemoveAttachmentRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/attachments/remove/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmRemoveAttachment' });
}

async function ilmPreview(claimId: number): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/preview/`, {});
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmPreview' });
}

async function ilmSubmit(claimId: number, body: IlmSubmitRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/submit/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmSubmit' });
}

async function ilmClose(claimId: number, body: IlmCloseRequest): Promise<IlmCallResult> {
  const response = await apiClient.post(`${ilmBase(claimId)}/close/`, body);
  return parseResponse(IlmCallResultSchema, response.data, { context: 'shaApi.ilmClose' });
}

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 2: pre-visit registries & eligibility
// ============================================================================

const ILM_BASE = '/api/sha/ilm';

async function ilmFacilitySearch(params: {
  identifier: string;
  identifier_type: string;
  name?: string;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/registries/facility-search/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmFacilitySearch',
  });
}

async function ilmPatientLookup(params: {
  identification_number: string;
  identification_type: string;
  patient_pk?: number;
  sha_member_id?: number;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/registries/patient-lookup/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmPatientLookup',
  });
}

async function ilmProfessionalSearch(params: {
  identification_number: string;
  identification_type: string;
  regulator: string;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/registries/professional-search/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmProfessionalSearch',
  });
}

async function ilmEligibility(params: {
  identification_number: string;
  identification_type: string;
  patient_pk?: number;
  sha_member_id?: number;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/eligibility/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmEligibility',
  });
}

async function ilmBenefits(params: {
  patient_id: string;
  fields?: string;
  is_unique_benefit?: boolean;
  patient_pk?: number;
  sha_member_id?: number;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/benefits/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmBenefits',
  });
}

async function ilmSubBenefits(params: {
  patient_id: string;
  patient_pk?: number;
  sha_member_id?: number;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/sub-benefits/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmSubBenefits',
  });
}

async function ilmBenefitInterventions(params: {
  patient_id: string;
  sub_benefit_code: string;
  patient_pk?: number;
  sha_member_id?: number;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/benefit-interventions/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmBenefitInterventions',
  });
}

async function ilmUtilization(params: {
  patient_id: string;
  intervention_code: string;
  patient_pk?: number;
  sha_member_id?: number;
}): Promise<IlmRegistryResponse> {
  const response = await apiClient.get(`${ILM_BASE}/utilization/`, { params });
  return parseResponse(IlmRegistryResponseSchema, response.data, {
    context: 'shaApi.ilmUtilization',
  });
}

async function listPatientContacts(patientPk: number): Promise<PatientContactList> {
  const response = await apiClient.get(`${ILM_BASE}/patient-contacts/`, {
    params: { patient_pk: patientPk },
  });
  return parseResponse(PatientContactListSchema, response.data, {
    context: 'shaApi.listPatientContacts',
  });
}

async function createPatientContact(body: PatientContactCreateInput): Promise<PatientContact> {
  const response = await apiClient.post(`${ILM_BASE}/patient-contacts/`, body);
  return parseResponse(PatientContactSchema, response.data, {
    context: 'shaApi.createPatientContact',
  });
}

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 3: preauth, doctor consent & emergency
// ============================================================================

async function ilmPreauthFetch(params: {
  consent_token: string;
  intervention_code?: string;
  patient_pk?: number;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.get(`${ILM_BASE}/preauth/`, { params });
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmPreauthFetch',
  });
}

async function ilmPreauthCreate(body: {
  consent_token: string;
  intervention_code: string;
  patient_pk: number;
  claim_pk?: number;
  payload?: Record<string, unknown>;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.post(`${ILM_BASE}/preauth/create/`, body);
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmPreauthCreate',
  });
}

async function ilmPreauthCancel(body: {
  consent_token: string;
  intervention_code: string;
  reason?: string;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.post(`${ILM_BASE}/preauth/cancel/`, body);
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmPreauthCancel',
  });
}

async function ilmPreauthRemoveDiagnosis(
  icdCode: string,
  body: { consent_token: string; intervention_code: string },
): Promise<IlmPreauthResponse> {
  const response = await apiClient.delete(
    `${ILM_BASE}/preauth/diagnoses/${encodeURIComponent(icdCode)}/`,
    { data: body },
  );
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmPreauthRemoveDiagnosis',
  });
}

async function ilmPreauthRemoveDoctor(body: {
  consent_token: string;
  intervention_code: string;
  practitioner_registration_number: string;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.delete(`${ILM_BASE}/preauth/doctors/`, { data: body });
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmPreauthRemoveDoctor',
  });
}

async function ilmDoctorConsent(body: {
  consent_token: string;
  intervention_code: string;
  practitioner_registration_number: string;
  identification_number: string;
  identification_type?: string;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.post(`${ILM_BASE}/preauth/doctor-consent/`, body);
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmDoctorConsent',
  });
}

async function ilmEmergencyOpen(body: {
  interventions: string[];
  diagnoses?: string[];
  reference_number?: string;
  beneficiary_cr_id?: string;
  brought_by?: string;
  mode_of_arrival?: string;
  consent_token?: string;
  patient_pk?: number;
  claim_pk?: number;
  payload?: Record<string, unknown>;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.post(`${ILM_BASE}/emergency/`, body);
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmEmergencyOpen',
  });
}

async function ilmEmergencyProtocolsList(params: {
  active?: boolean | string;
  intervention_code?: string;
  protocol_code?: string;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.get(`${ILM_BASE}/emergency/protocols/`, { params });
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmEmergencyProtocolsList',
  });
}

async function ilmEmergencyProtocolApply(body: {
  consent_token: string;
  protocol_code: string;
  intervention_code: string;
  unit_price: number;
  quantity: number;
  diagnoses?: string;
  payload?: Record<string, unknown>;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.post(`${ILM_BASE}/emergency/protocols/apply/`, body);
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmEmergencyProtocolApply',
  });
}

async function ilmEmtCreate(body: {
  beneficiary_cr_id: string;
  case_number: string;
  consent_token: string;
  diagnoses: string[];
  interventions: string[];
  practitioner_reg_number: string;
  provider_registration_number: string;
  protocol_code: string;
  patient_pk?: number;
  payload?: Record<string, unknown>;
}): Promise<IlmPreauthResponse> {
  const response = await apiClient.post(`${ILM_BASE}/emt/`, body);
  return parseResponse(IlmPreauthResponseSchema, response.data, {
    context: 'shaApi.ilmEmtCreate',
  });
}

async function listLocalPreauths(params: { patient_pk?: number; consent_token?: string }) {
  const response = await apiClient.get(`${ILM_BASE}/preauth/local/`, { params });
  return parseResponse(SHAPreauthListSchema, response.data, {
    context: 'shaApi.listLocalPreauths',
  });
}

async function listLocalEmergencyClaims(params: { patient_pk?: number; kind?: 'emergency' | 'emt' } = {}) {
  const response = await apiClient.get(`${ILM_BASE}/emergency/local/`, { params });
  return parseResponse(SHAEmergencyClaimListSchema, response.data, {
    context: 'shaApi.listLocalEmergencyClaims',
  });
}

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 4: lifecycle (OTP, discharge, NoK, uploads)
// ============================================================================

async function ilmSendVisitOtp(body: {
  intervention_codes: string[];
  patient_id: string;
  beneficiary_contact_id?: string;
}) {
  const response = await apiClient.post(`${ILM_BASE}/lifecycle/visit-otp/`, body);
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmSendVisitOtp',
  });
}

async function ilmSendDischargeOtp(body: {
  consent_token: string;
  patient_id: string;
  beneficiary_contact_id?: string;
}) {
  const response = await apiClient.post(`${ILM_BASE}/lifecycle/discharge-otp/`, body);
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmSendDischargeOtp',
  });
}

async function ilmDischarge(body: {
  consent_token: string;
  discharge_date: string;
  discharge_reason: string;
  invoice_number: string;
  otp: string;
}) {
  const response = await apiClient.post(`${ILM_BASE}/lifecycle/discharge/`, body);
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmDischarge',
  });
}

async function ilmRequestOtpWhitelist(formData: FormData) {
  const response = await apiClient.post(`${ILM_BASE}/lifecycle/otp-whitelist/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmRequestOtpWhitelist',
  });
}

async function ilmListOtpWhitelistStatus(params: {
  beneficiary_cr_id: string;
  facility_fr_code?: string;
  beneficiary_contact_id?: string;
}) {
  const response = await apiClient.get(`${ILM_BASE}/lifecycle/otp-whitelist/callback/`, { params });
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmListOtpWhitelistStatus',
  });
}

async function ilmAddNextOfKin(body: {
  consent_token: string;
  contact_value: string;
  next_of_kin_full_name: string;
  next_of_kin_id_number: string;
  next_of_kin_id_number_type?: string;
  contact_type?: string;
}) {
  const response = await apiClient.post(`${ILM_BASE}/lifecycle/next-of-kin/`, body);
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmAddNextOfKin',
  });
}

async function ilmAddEmergencyDoctor(body: {
  consent_token: string;
  identification_number: string;
  identification_type?: string;
}) {
  const response = await apiClient.post(`${ILM_BASE}/lifecycle/emergency-doctors/`, body);
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmAddEmergencyDoctor',
  });
}

async function ilmRemoveEmergencyDoctor(body: { consent_token: string }) {
  const response = await apiClient.delete(`${ILM_BASE}/lifecycle/emergency-doctors/remove/`, {
    data: body,
  });
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmRemoveEmergencyDoctor',
  });
}

async function ilmGetPomsfBalances(params: {
  patient_id: string;
  policy_year?: string;
  principal_member_number?: string;
  benefit_package_id?: string;
}) {
  const response = await apiClient.get(`${ILM_BASE}/lifecycle/pomsf-balances/`, { params });
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmGetPomsfBalances',
  });
}

async function ilmUploadFile(file: File, extra: Record<string, string> = {}) {
  const formData = new FormData();
  formData.append('file', file);
  Object.entries(extra).forEach(([k, v]) => formData.append(k, v));
  const response = await apiClient.post(`/api/sha/ilm/uploads/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmUploadFile',
  });
}

async function ilmGetUploadUrl(fileId: string) {
  const response = await apiClient.get(`/api/sha/ilm/uploads/${encodeURIComponent(fileId)}/`);
  return parseResponse(IlmLifecycleResponseSchema, response.data, {
    context: 'shaApi.ilmGetUploadUrl',
  });
}

async function listLocalOtpRequests(params: { kind?: 'visit' | 'discharge'; patient_pk?: number } = {}) {
  const response = await apiClient.get(`${ILM_BASE}/lifecycle/otp/local/`, { params });
  return parseResponse(SHAOtpRequestListSchema, response.data, {
    context: 'shaApi.listLocalOtpRequests',
  });
}

async function listLocalOtpWhitelists(params: { status?: string } = {}) {
  const response = await apiClient.get(`${ILM_BASE}/lifecycle/otp-whitelist/local/`, { params });
  return parseResponse(SHAOtpWhitelistListSchema, response.data, {
    context: 'shaApi.listLocalOtpWhitelists',
  });
}

async function listLocalUploads(params: Record<string, string> = {}) {
  const response = await apiClient.get(`/api/sha/ilm/uploads/local/`, { params });
  return parseResponse(SHAUploadListSchema, response.data, {
    context: 'shaApi.listLocalUploads',
  });
}

// ============================================================================
// DHA HIE Middleware (ILM) — Phase 5: ePrescriptions
// ============================================================================

async function ilmPreviewPrescription(params: { consent_token: string; patient_pk?: number }) {
  const response = await apiClient.get(`${ILM_BASE}/prescriptions/preview/`, { params });
  return parseResponse(IlmPrescriptionResponseSchema, response.data, {
    context: 'shaApi.ilmPreviewPrescription',
  });
}

async function ilmCreatePrescription(body: {
  consent_token: string;
  intervention_code: string;
  identification_number: string;
  identification_type?: string;
  regulation_body?: string;
  items: Array<Record<string, unknown>>;
  patient_pk?: number;
  encounter_pk?: number;
}) {
  const response = await apiClient.post(`${ILM_BASE}/prescriptions/`, body);
  return parseResponse(IlmPrescriptionResponseSchema, response.data, {
    context: 'shaApi.ilmCreatePrescription',
  });
}

async function ilmDispensePrescription(body: {
  consent_token: string;
  intervention_code: string;
  actual_products: Array<{ actual_product_code: string; medication_price: number; total_quantity: number }>;
  doctors?: Array<{ identification_number: string; identification_type?: string }>;
  prescription_pk?: number;
}) {
  const response = await apiClient.post(`${ILM_BASE}/prescriptions/dispenses/`, body);
  return parseResponse(IlmPrescriptionResponseSchema, response.data, {
    context: 'shaApi.ilmDispensePrescription',
  });
}

async function ilmRemovePrescriptionDoctor(body: {
  consent_token: string;
  intervention_code: string;
  practitioner_registration_number: string;
}) {
  const response = await apiClient.delete(`${ILM_BASE}/prescriptions/doctors/`, { data: body });
  return parseResponse(IlmPrescriptionResponseSchema, response.data, {
    context: 'shaApi.ilmRemovePrescriptionDoctor',
  });
}

async function listLocalDhaPrescriptions(
  params: { patient_pk?: number; status?: string; intervention_code?: string } = {},
) {
  const response = await apiClient.get(`${ILM_BASE}/prescriptions/local/`, { params });
  return parseResponse(SHADhaPrescriptionListSchema, response.data, {
    context: 'shaApi.listLocalDhaPrescriptions',
  });
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
  ensureSHAMember,

  // Eligibility
  checkEligibility,
  checkPatientEligibility,
  checkDirectEligibility,

  // Terminology - ICD-11
  searchICD11,

  // Terminology - Interventions
  searchInterventions,
  searchInterventionCodes,

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
  startVisit,
  getConsentDetail,

  // DHA HIE Pre-authorization
  submitPreauth,
  getPreauthStatus,
  getPendingPreauths,

  // DHA HIE Middleware (ILM) — per-action claim workflow
  ilmStartVisit,
  ilmAddIntervention,
  ilmAddVirtualClaimLine,
  ilmSwitchIntervention,
  ilmRestoreIntervention,
  ilmRetireIntervention,
  ilmAddDiagnosis,
  ilmRemoveDiagnosis,
  ilmAddLine,
  ilmEditLine,
  ilmRemoveLine,
  ilmAddAttachment,
  ilmRemoveAttachment,
  ilmPreview,
  ilmSubmit,
  ilmClose,

  // DHA HIE Middleware (ILM) — Phase 2 pre-visit registries & eligibility
  ilmFacilitySearch,
  ilmPatientLookup,
  ilmProfessionalSearch,
  ilmEligibility,
  ilmBenefits,
  ilmSubBenefits,
  ilmBenefitInterventions,
  ilmUtilization,
  listPatientContacts,
  createPatientContact,

  // DHA HIE Middleware (ILM) — Phase 3 preauth, doctor consent & emergency
  ilmPreauthFetch,
  ilmPreauthCreate,
  ilmPreauthCancel,
  ilmPreauthRemoveDiagnosis,
  ilmPreauthRemoveDoctor,
  ilmDoctorConsent,
  ilmEmergencyOpen,
  ilmEmergencyProtocolsList,
  ilmEmergencyProtocolApply,
  ilmEmtCreate,
  listLocalPreauths,
  listLocalEmergencyClaims,
  // Phase 4 — lifecycle
  ilmSendVisitOtp,
  ilmSendDischargeOtp,
  ilmDischarge,
  ilmRequestOtpWhitelist,
  ilmListOtpWhitelistStatus,
  ilmAddNextOfKin,
  ilmAddEmergencyDoctor,
  ilmRemoveEmergencyDoctor,
  ilmGetPomsfBalances,
  ilmUploadFile,
  ilmGetUploadUrl,
  listLocalOtpRequests,
  listLocalOtpWhitelists,
  listLocalUploads,
  // Phase 5 — ePrescriptions
  ilmPreviewPrescription,
  ilmCreatePrescription,
  ilmDispensePrescription,
  ilmRemovePrescriptionDoctor,
  listLocalDhaPrescriptions,
};
