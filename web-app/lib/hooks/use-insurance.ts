/**
 * React Query hooks for the Insurance module.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { insuranceApi } from '@/lib/api/insurance';
import type {
  HealthcloudGetHealthIdInput,
  HealthcloudPostProfileInput,
  HealthcloudSessionRequestOTPInput,
  HealthcloudSessionStartVisitInput,
  InsuranceClaimCreateInput,
  InsuranceClaimFilters,
  InsurancePlanCreateInput,
  InsurancePreauthCreateInput,
  InsurancePreauthFilters,
  InsuranceProviderConfigCreateInput,
  FacilitySladeCredentialInput,
  RequestOTPInput,
  ReserveBalanceInput,
  StartVisitInput,
  SubmitCreditNoteInput,
  SubmitInvoiceInput,
  UploadClaimAttachmentFileInput,
  UploadClaimAttachmentInput,
  ValidateAuthorizationInput,
  InsuranceProviderCreateInput,
  InsuranceRemittanceCreateInput,
  PatientInsuranceCreateInput,
  PayerTariffCreateInput,
  VerifyEnrollmentPreviewInput,
} from '@/lib/types/insurance';

const INSURANCE_POLLABLE_STATUSES = new Set([
  'submitted',
  'acknowledged',
  'under_review',
  'query',
  'pending_preauth',
]);

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const insuranceQueryKeys = {
  all: ['insurance'] as const,
  providers: () => [...insuranceQueryKeys.all, 'providers'] as const,
  providerList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.providers(), 'list', params] as const,
  providerDetail: (id: number) => [...insuranceQueryKeys.providers(), id] as const,

  plans: () => [...insuranceQueryKeys.all, 'plans'] as const,
  planList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.plans(), 'list', params] as const,
  planDetail: (id: number) => [...insuranceQueryKeys.plans(), id] as const,

  enrollments: () => [...insuranceQueryKeys.all, 'enrollments'] as const,
  enrollmentList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.enrollments(), 'list', params] as const,
  enrollmentDetail: (id: number) => [...insuranceQueryKeys.enrollments(), id] as const,

  configs: () => [...insuranceQueryKeys.all, 'configs'] as const,
  configList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.configs(), 'list', params] as const,
  configDetail: (id: number) => [...insuranceQueryKeys.configs(), id] as const,
  sladeCredentialCurrent: () => [...insuranceQueryKeys.configs(), 'slade-credential-current'] as const,

  authorizations: () => [...insuranceQueryKeys.all, 'authorizations'] as const,
  authorizationList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.authorizations(), 'list', params] as const,
  authorizationDetail: (id: number) => [...insuranceQueryKeys.authorizations(), id] as const,

  claims: () => [...insuranceQueryKeys.all, 'claims'] as const,
  claimList: (filters?: InsuranceClaimFilters) =>
    [...insuranceQueryKeys.claims(), 'list', filters] as const,
  claimDetail: (id: number) => [...insuranceQueryKeys.claims(), id] as const,

  preauths: () => [...insuranceQueryKeys.all, 'preauths'] as const,
  preauthList: (filters?: InsurancePreauthFilters) =>
    [...insuranceQueryKeys.preauths(), 'list', filters] as const,
  preauthDetail: (id: number) => [...insuranceQueryKeys.preauths(), id] as const,

  remittances: () => [...insuranceQueryKeys.all, 'remittances'] as const,
  remittanceList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.remittances(), 'list', params] as const,
  remittanceDetail: (id: number) => [...insuranceQueryKeys.remittances(), id] as const,
  healthcloudSyncStatus: (params?: {
    include_failures?: boolean;
    include_sync_items?: boolean;
    include_remittance_items?: boolean;
    limit?: number;
  }) =>
    [...insuranceQueryKeys.remittances(), 'healthcloud-sync-status', params] as const,

  tariffs: () => [...insuranceQueryKeys.all, 'tariffs'] as const,
  tariffList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.tariffs(), 'list', params] as const,
  tariffDetail: (id: number) => [...insuranceQueryKeys.tariffs(), id] as const,
};

// ---------------------------------------------------------------------------
// Provider Hooks
// ---------------------------------------------------------------------------

export function useInsuranceProviders(
  params?: Record<string, string | number | undefined>,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: insuranceQueryKeys.providerList(params),
    queryFn: () => insuranceApi.listProviders(params),
    enabled: options?.enabled ?? true,
  });
}

export function useInsuranceProvider(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.providerDetail(id!),
    queryFn: () => insuranceApi.getProvider(id!),
    enabled: !!id,
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsuranceProviderCreateInput) => insuranceApi.createProvider(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.providers() });
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsuranceProviderCreateInput> }) =>
      insuranceApi.updateProvider(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.providers() });
      queryClient.invalidateQueries({
        queryKey: insuranceQueryKeys.providerDetail(variables.id),
      });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.deleteProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.providers() });
    },
  });
}

// ---------------------------------------------------------------------------
// Plan Hooks
// ---------------------------------------------------------------------------

export function useInsurancePlans(
  params?: Record<string, string | number | undefined>,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: insuranceQueryKeys.planList(params),
    queryFn: () => insuranceApi.listPlans(params),
    enabled: options?.enabled ?? true,
  });
}

export function useInsurancePlan(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.planDetail(id!),
    queryFn: () => insuranceApi.getPlan(id!),
    enabled: !!id,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsurancePlanCreateInput) => insuranceApi.createPlan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.plans() });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsurancePlanCreateInput> }) =>
      insuranceApi.updatePlan(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.plans() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.planDetail(variables.id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Enrollment Hooks
// ---------------------------------------------------------------------------

export function usePatientInsurances(
  params?: Record<string, string | number | undefined>,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: insuranceQueryKeys.enrollmentList(params),
    queryFn: () => insuranceApi.listEnrollments(params),
    enabled: options?.enabled ?? true,
  });
}

export function usePatientInsurance(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.enrollmentDetail(id!),
    queryFn: () => insuranceApi.getEnrollment(id!),
    enabled: !!id,
  });
}

export function useCreateEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatientInsuranceCreateInput) => insuranceApi.createEnrollment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollments() });
    },
  });
}

export function useUpdateEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PatientInsuranceCreateInput> }) =>
      insuranceApi.updateEnrollment(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollments() });
      queryClient.invalidateQueries({
        queryKey: insuranceQueryKeys.enrollmentDetail(variables.id),
      });
    },
  });
}

export function useVerifyEnrollmentViaHealthcloud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.verifyEnrollmentViaHealthcloud(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollments() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollmentDetail(id) });
    },
  });
}

export function useVerifyEnrollmentViaHealthcloudPreview() {
  return useMutation({
    mutationFn: (data: VerifyEnrollmentPreviewInput) =>
      insuranceApi.verifyEnrollmentViaHealthcloudPreview(data),
  });
}

export function useSeedSladeDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => insuranceApi.seedSladeDefaults(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.providers() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.plans() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.configs() });
    },
  });
}

export function useRequestEnrollmentOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RequestOTPInput }) =>
      insuranceApi.requestEnrollmentOtp(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizations() });
    },
  });
}

export function useStartEnrollmentVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: StartVisitInput }) =>
      insuranceApi.startEnrollmentVisit(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizations() });
    },
  });
}

export function useStartHealthcloudSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.startHealthcloudSession(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizations() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizationDetail(data.session.id) });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollments() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollmentDetail(data.session.enrollment) });
    },
  });
}

export function useRequestHealthcloudSessionOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: HealthcloudSessionRequestOTPInput }) =>
      insuranceApi.requestHealthcloudSessionOtp(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizations() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizationDetail(data.id) });
    },
  });
}

export function useStartHealthcloudSessionVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: HealthcloudSessionStartVisitInput }) =>
      insuranceApi.startHealthcloudSessionVisit(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizations() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizationDetail(data.id) });
    },
  });
}

export function usePostHealthcloudProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: HealthcloudPostProfileInput }) =>
      insuranceApi.postHealthcloudProfile(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollments() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollmentDetail(variables.id) });
      queryClient.setQueryData(insuranceQueryKeys.enrollmentDetail(variables.id), data.enrollment);
    },
  });
}

export function useGetHealthcloudHealthId() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: HealthcloudGetHealthIdInput }) =>
      insuranceApi.getHealthcloudHealthId(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollments() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.enrollmentDetail(variables.id) });
      queryClient.setQueryData(insuranceQueryKeys.enrollmentDetail(variables.id), data.enrollment);
    },
  });
}

// ---------------------------------------------------------------------------
// Provider Config Hooks
// ---------------------------------------------------------------------------

export function useProviderConfigs(
  params?: Record<string, string | number | undefined>,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: insuranceQueryKeys.configList(params),
    queryFn: () => insuranceApi.listProviderConfigs(params),
    enabled: options?.enabled ?? true,
  });
}

export function useProviderConfig(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.configDetail(id!),
    queryFn: () => insuranceApi.getProviderConfig(id!),
    enabled: !!id,
  });
}

export function useCreateProviderConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsuranceProviderConfigCreateInput) =>
      insuranceApi.createProviderConfig(data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.configs() });
    },
  });
}

export function useUpdateProviderConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsuranceProviderConfigCreateInput> }) =>
      insuranceApi.updateProviderConfig(id, data as Record<string, unknown>),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.configs() });
      queryClient.invalidateQueries({
        queryKey: insuranceQueryKeys.configDetail(variables.id),
      });
    },
  });
}

export function useFacilitySladeCredential(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: insuranceQueryKeys.sladeCredentialCurrent(),
    queryFn: () => insuranceApi.getCurrentFacilitySladeCredential(),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateFacilitySladeCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FacilitySladeCredentialInput) =>
      insuranceApi.createFacilitySladeCredential(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.configs() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.sladeCredentialCurrent() });
    },
  });
}

export function useUpdateFacilitySladeCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FacilitySladeCredentialInput }) =>
      insuranceApi.updateFacilitySladeCredential(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.configs() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.sladeCredentialCurrent() });
    },
  });
}

export function useVisitAuthorizations(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: insuranceQueryKeys.authorizationList(params),
    queryFn: () => insuranceApi.listVisitAuthorizations(params),
  });
}

export function useVisitAuthorization(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.authorizationDetail(id!),
    queryFn: () => insuranceApi.getVisitAuthorization(id!),
    enabled: !!id,
  });
}

export function useValidateVisitAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ValidateAuthorizationInput }) =>
      insuranceApi.validateVisitAuthorization(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizations() });
      queryClient.invalidateQueries({
        queryKey: insuranceQueryKeys.authorizationDetail(variables.id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Claim Hooks
// ---------------------------------------------------------------------------

export function useInsuranceClaims(filters?: InsuranceClaimFilters) {
  return useQuery({
    queryKey: insuranceQueryKeys.claimList(filters),
    queryFn: () => insuranceApi.listClaims(filters),
    refetchInterval: (query) => {
      const data = query.state.data as { results?: Array<{ status?: string }> } | undefined;
      const hasInProgress = data?.results?.some((claim) => {
        const status = String(claim.status || '').toLowerCase();
        return INSURANCE_POLLABLE_STATUSES.has(status);
      });
      return hasInProgress ? 15000 : false;
    },
  });
}

export function useInsuranceClaim(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.claimDetail(id!),
    queryFn: () => insuranceApi.getClaim(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as { status?: string } | undefined;
      const status = String(data?.status || '').toLowerCase();
      return INSURANCE_POLLABLE_STATUSES.has(status) ? 10000 : false;
    },
  });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsuranceClaimCreateInput) => insuranceApi.createClaim(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
    },
  });
}

export function useSubmitClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.submitClaim(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(id) });
    },
  });
}

export function useApproveClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved_amount }: { id: number; approved_amount: string }) =>
      insuranceApi.approveClaim(id, approved_amount),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(variables.id) });
    },
  });
}

export function useRejectClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      insuranceApi.rejectClaim(id, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(variables.id) });
    },
  });
}

export function useRespondToQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, response }: { id: number; response: string }) =>
      insuranceApi.respondToQuery(id, response),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(variables.id) });
    },
  });
}

export function useMarkClaimPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paid_amount }: { id: number; paid_amount: string }) =>
      insuranceApi.markClaimPaid(id, paid_amount),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(variables.id) });
    },
  });
}

export function useAppealClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      insuranceApi.appealClaim(id, notes),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(variables.id) });
    },
  });
}

export function useCancelClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      insuranceApi.cancelClaim(id, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(variables.id) });
    },
  });
}

export function useReserveClaimBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReserveBalanceInput }) =>
      insuranceApi.reserveClaimBalance(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(variables.id) });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.authorizations() });
    },
  });
}

export function useSubmitClaimToHealthcloud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.submitClaimToHealthcloud(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(id) });
    },
  });
}

export function useRefreshClaimExternalStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.refreshClaimExternalStatus(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claims() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(id) });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.remittances() });
    },
  });
}

export function useCheckClaimRemittance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.checkClaimRemittance(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.claimDetail(id) });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.remittances() });
    },
  });
}

export function useSubmitClaimInvoice() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SubmitInvoiceInput }) =>
      insuranceApi.submitClaimInvoice(id, data),
  });
}

export function useSubmitClaimCreditNote() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SubmitCreditNoteInput }) =>
      insuranceApi.submitClaimCreditNote(id, data),
  });
}

export function useUploadClaimAttachment() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UploadClaimAttachmentInput }) =>
      insuranceApi.uploadClaimAttachment(id, data),
  });
}

export function useUploadClaimAttachmentFile() {
  return useMutation({
    mutationFn: ({
      id,
      file,
      data,
    }: {
      id: number;
      file: File;
      data?: UploadClaimAttachmentFileInput;
    }) => insuranceApi.uploadClaimAttachmentFile(id, file, data),
  });
}

// ---------------------------------------------------------------------------
// Preauth Hooks
// ---------------------------------------------------------------------------

export function useInsurancePreauths(filters?: InsurancePreauthFilters) {
  return useQuery({
    queryKey: insuranceQueryKeys.preauthList(filters),
    queryFn: () => insuranceApi.listPreauths(filters),
  });
}

export function useInsurancePreauth(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.preauthDetail(id!),
    queryFn: () => insuranceApi.getPreauth(id!),
    enabled: !!id,
  });
}

export function useCreatePreauth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsurancePreauthCreateInput) => insuranceApi.createPreauth(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.preauths() });
    },
  });
}

export function useSubmitPreauth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.submitPreauth(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.preauths() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.preauthDetail(id) });
    },
  });
}

export function useApprovePreauth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approved_amount,
      validity_days,
    }: {
      id: number;
      approved_amount: string;
      validity_days?: number;
    }) => insuranceApi.approvePreauth(id, approved_amount, validity_days),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.preauths() });
      queryClient.invalidateQueries({
        queryKey: insuranceQueryKeys.preauthDetail(variables.id),
      });
    },
  });
}

export function useDenyPreauth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      insuranceApi.denyPreauth(id, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.preauths() });
      queryClient.invalidateQueries({
        queryKey: insuranceQueryKeys.preauthDetail(variables.id),
      });
    },
  });
}

export function useCancelPreauth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      insuranceApi.cancelPreauth(id, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.preauths() });
      queryClient.invalidateQueries({
        queryKey: insuranceQueryKeys.preauthDetail(variables.id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Remittance Hooks
// ---------------------------------------------------------------------------

export function useInsuranceRemittances(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: insuranceQueryKeys.remittanceList(params),
    queryFn: () => insuranceApi.listRemittances(params),
  });
}

export function useInsuranceRemittance(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.remittanceDetail(id!),
    queryFn: () => insuranceApi.getRemittance(id!),
    enabled: !!id,
  });
}

export function useHealthcloudSyncStatus(options?: {
  enabled?: boolean;
  includeFailures?: boolean;
  includeSyncItems?: boolean;
  includeRemittanceItems?: boolean;
  limit?: number;
}) {
  const queryParams = {
    include_failures: options?.includeFailures ?? false,
    include_sync_items: options?.includeSyncItems ?? false,
    include_remittance_items: options?.includeRemittanceItems ?? false,
    limit: options?.limit ?? 20,
  };

  return useQuery({
    queryKey: insuranceQueryKeys.healthcloudSyncStatus(queryParams),
    queryFn: () => insuranceApi.getHealthcloudSyncStatus(queryParams),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateRemittance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsuranceRemittanceCreateInput) => insuranceApi.createRemittance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.remittances() });
    },
  });
}

export function useReconcileRemittance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.reconcileRemittance(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.remittances() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.remittanceDetail(id) });
    },
  });
}

export function useRemittanceClaimsDrilldown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.getRemittanceClaimsDrilldown(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.remittances() });
    },
  });
}

// ---------------------------------------------------------------------------
// Tariff Hooks
// ---------------------------------------------------------------------------

export function usePayerTariffs(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: insuranceQueryKeys.tariffList(params),
    queryFn: () => insuranceApi.listTariffs(params),
  });
}

export function usePayerTariff(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.tariffDetail(id!),
    queryFn: () => insuranceApi.getTariff(id!),
    enabled: !!id,
  });
}

export function useCreateTariff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PayerTariffCreateInput) => insuranceApi.createTariff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.tariffs() });
    },
  });
}

export function useUpdateTariff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PayerTariffCreateInput> }) =>
      insuranceApi.updateTariff(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.tariffs() });
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.tariffDetail(variables.id) });
    },
  });
}

export function useDeleteTariff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => insuranceApi.deleteTariff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.tariffs() });
    },
  });
}
