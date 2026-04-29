/**
 * SHA Integration Hooks
 * React Query hooks for SHA data fetching and mutations
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shaApi } from '@/lib/api/sha';
import type {
  ClaimListParams,
  ClaimCreateRequest,
  EligibilityCheckRequest,
  InterventionSearchParams,
  TerminologySearchParams,
  DrugSearchParams,
  SendOTPRequest,
  ValidateOTPRequest,
  StartVisitRequest,
  SubmitPreauthRequest,
} from '@/lib/types/sha';

// ============================================================================
// Query Keys
// ============================================================================

export const shaQueryKeys = {
  all: ['sha'] as const,

  // SHA Members
  members: () => [...shaQueryKeys.all, 'members'] as const,
  membersByPatient: (patientId: number) => [...shaQueryKeys.members(), 'patient', patientId] as const,
  member: (id: number) => [...shaQueryKeys.members(), id] as const,

  // Eligibility
  eligibility: () => [...shaQueryKeys.all, 'eligibility'] as const,
  patientEligibility: (patientId: number) => [...shaQueryKeys.eligibility(), 'patient', patientId] as const,

  // Claims
  claims: () => [...shaQueryKeys.all, 'claims'] as const,
  claimsList: (params?: ClaimListParams) => [...shaQueryKeys.claims(), 'list', params] as const,
  claim: (id: number) => [...shaQueryKeys.claims(), id] as const,

  // Terminology
  terminology: () => [...shaQueryKeys.all, 'terminology'] as const,
  icd11: (params?: TerminologySearchParams) => [...shaQueryKeys.terminology(), 'icd11', params] as const,
  interventions: (params?: InterventionSearchParams) => [...shaQueryKeys.terminology(), 'interventions', params] as const,
  ichi: (params?: TerminologySearchParams) => [...shaQueryKeys.terminology(), 'ichi', params] as const,
  loinc: (params?: TerminologySearchParams) => [...shaQueryKeys.terminology(), 'loinc', params] as const,
  drugs: (params?: DrugSearchParams) => [...shaQueryKeys.terminology(), 'drugs', params] as const,
  components: (params?: TerminologySearchParams) => [...shaQueryKeys.terminology(), 'components', params] as const,

  // DHA HIE Consent
  consent: () => [...shaQueryKeys.all, 'consent'] as const,
  consentDetail: (id: number) => [...shaQueryKeys.consent(), id] as const,

  // DHA HIE Pre-authorization
  preauth: () => [...shaQueryKeys.all, 'preauth'] as const,
  preauthStatus: (id: number) => [...shaQueryKeys.preauth(), id] as const,
  preauthPending: () => [...shaQueryKeys.preauth(), 'pending'] as const,
};

// ============================================================================
// SHA Member Hooks
// ============================================================================

/**
 * Get SHA member records for a patient
 */
export function useSHAMembersByPatient(patientId: number | undefined) {
  return useQuery({
    queryKey: shaQueryKeys.membersByPatient(patientId!),
    queryFn: () => shaApi.getSHAMembers({ patient: patientId }),
    enabled: !!patientId,
  });
}

/**
 * Get a specific SHA member record
 */
export function useSHAMember(id: number | undefined) {
  return useQuery({
    queryKey: shaQueryKeys.member(id!),
    queryFn: () => shaApi.getSHAMember(id!),
    enabled: !!id,
  });
}

// ============================================================================
// Eligibility Hooks
// ============================================================================

/**
 * Check patient eligibility with SHA
 */
export function usePatientEligibility(patientId: number | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.patientEligibility(patientId!),
    queryFn: () => shaApi.checkPatientEligibility(patientId!),
    enabled: !!patientId && options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Check eligibility mutation (for manual refresh)
 */
export function useCheckEligibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EligibilityCheckRequest) => shaApi.checkEligibility(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.eligibility() });
    },
  });
}

// ============================================================================
// Claims Hooks
// ============================================================================

/**
 * Get list of claims
 */
export function useClaims(params?: ClaimListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.claimsList(params),
    queryFn: () => shaApi.getClaims(params),
    enabled: options?.enabled,
  });
}

/**
 * Get a specific claim
 */
export function useClaim(id: number | undefined) {
  return useQuery({
    queryKey: shaQueryKeys.claim(id!),
    queryFn: () => shaApi.getClaim(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      // Auto-refetch for claims in progress
      const data = query.state.data;
      if (data && ['pending', 'submitted', 'processing'].includes(data.status)) {
        return 10000; // 10 seconds
      }
      return false;
    },
  });
}

/**
 * Create a new claim
 */
export function useCreateClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClaimCreateRequest) => shaApi.createClaim(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.claims() });
    },
  });
}

/**
 * Submit a claim to SHA
 */
export function useSubmitClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (claimId: number) => shaApi.submitClaim(claimId),
    onSuccess: (_, claimId) => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.claim(claimId) });
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.claims() });
    },
  });
}

/**
 * Resubmit a rejected claim
 */
export function useResubmitClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (claimId: number) => shaApi.resubmitClaim(claimId),
    onSuccess: (_, claimId) => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.claim(claimId) });
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.claims() });
    },
  });
}

/**
 * Cancel a draft claim
 */
export function useCancelClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (claimId: number) => shaApi.cancelClaim(claimId),
    onSuccess: (_, claimId) => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.claim(claimId) });
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.claims() });
    },
  });
}

// ============================================================================
// Terminology Hooks
// ============================================================================

/**
 * Search ICD-11 codes
 */
export function useICD11Search(params?: TerminologySearchParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.icd11(params),
    queryFn: () => shaApi.searchICD11(params),
    enabled: options?.enabled !== false && (params?.search?.length ?? 0) >= 2,
    staleTime: 30 * 60 * 1000, // 30 minutes - terminology doesn't change often
  });
}

/**
 * Search SHA interventions
 */
export function useInterventionsSearch(params?: InterventionSearchParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.interventions(params),
    queryFn: () => shaApi.searchInterventions(params),
    enabled: options?.enabled !== false && (params?.search?.length ?? 0) >= 2,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Search ICHI codes
 */
export function useICHISearch(params?: TerminologySearchParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.ichi(params),
    queryFn: () => shaApi.searchICHI(params),
    enabled: options?.enabled !== false && (params?.search?.length ?? 0) >= 2,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Search LOINC codes
 */
export function useLOINCSearch(params?: TerminologySearchParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.loinc(params),
    queryFn: () => shaApi.searchLOINC(params),
    enabled: options?.enabled !== false && (params?.search?.length ?? 0) >= 2,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Search drugs
 */
export function useDrugsSearch(params?: DrugSearchParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.drugs(params),
    queryFn: () => shaApi.searchDrugs(params),
    enabled: options?.enabled !== false && (params?.search?.length ?? 0) >= 2,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Search active components
 */
export function useActiveComponentsSearch(params?: TerminologySearchParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.components(params),
    queryFn: () => shaApi.searchActiveComponents(params),
    enabled: options?.enabled !== false && (params?.search?.length ?? 0) >= 2,
    staleTime: 30 * 60 * 1000,
  });
}

// ============================================================================
// Client Registry Hooks
// ============================================================================

/**
 * Fetch from Client Registry
 */
export function useFetchFromCR() {
  return useMutation({
    mutationFn: shaApi.fetchFromClientRegistry,
  });
}

/**
 * Register in Client Registry
 * Invalidates patient cache on success since backend updates patient.cr_number
 */
export function useRegisterInCR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: shaApi.registerInClientRegistry,
    onSuccess: (_, variables) => {
      // Invalidate patient cache since cr_number was updated
      if (variables.patient_id) {
        queryClient.invalidateQueries({ queryKey: ['patient', variables.patient_id] });
        queryClient.invalidateQueries({ queryKey: ['patients'] });
      }
    },
  });
}

/**
 * Update in Client Registry
 */
export function useUpdateCR() {
  return useMutation({
    mutationFn: shaApi.updateClientRegistry,
  });
}

// ============================================================================
// Facility & Practitioner Validation Hooks
// ============================================================================

/**
 * Validate facility
 */
export function useValidateFacility() {
  return useMutation({
    mutationFn: shaApi.validateFacility,
  });
}

/**
 * Validate practitioner
 */
export function useValidatePractitioner() {
  return useMutation({
    mutationFn: shaApi.validatePractitioner,
  });
}

// ============================================================================
// DHA HIE Consent Hooks
// ============================================================================

/**
 * Send OTP for consent verification
 */
export function useSendConsentOTP() {
  return useMutation({
    mutationFn: (data: SendOTPRequest) => shaApi.sendConsentOTP(data),
  });
}

/**
 * Validate OTP code to obtain consent token
 */
export function useValidateConsentOTP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ValidateOTPRequest) => shaApi.validateConsentOTP(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.consentDetail(result.consent_id) });
    },
  });
}

/**
 * Start visit with DHA (combined OTP validation + visit start)
 */
export function useStartVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StartVisitRequest) => shaApi.startVisit(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.consentDetail(result.id) });
    },
  });
}

/**
 * Get consent token detail
 */
export function useConsentDetail(consentId: number | undefined) {
  return useQuery({
    queryKey: shaQueryKeys.consentDetail(consentId!),
    queryFn: () => shaApi.getConsentDetail(consentId!),
    enabled: !!consentId,
  });
}

// ============================================================================
// DHA HIE Pre-authorization Hooks
// ============================================================================

/**
 * Submit pre-authorization request
 */
export function useSubmitPreauth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SubmitPreauthRequest) => shaApi.submitPreauth(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shaQueryKeys.preauth() });
    },
  });
}

/**
 * Get pre-authorization status (with auto-refresh for pending)
 */
export function usePreauthStatus(preauthId: number | undefined) {
  return useQuery({
    queryKey: shaQueryKeys.preauthStatus(preauthId!),
    queryFn: () => shaApi.getPreauthStatus(preauthId!),
    enabled: !!preauthId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.decision === 'PENDING') {
        return 15000; // Poll every 15 seconds for pending preauths
      }
      return false;
    },
  });
}

/**
 * Get list of pending pre-authorization requests
 */
export function usePendingPreauths(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: shaQueryKeys.preauthPending(),
    queryFn: () => shaApi.getPendingPreauths(),
    enabled: options?.enabled,
  });
}
