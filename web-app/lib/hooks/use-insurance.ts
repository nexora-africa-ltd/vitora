/**
 * React Query hooks for the Insurance module.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { insuranceApi } from '@/lib/api/insurance';
import type {
  InsuranceClaimCreateInput,
  InsuranceClaimFilters,
  InsurancePlanCreateInput,
  InsurancePreauthCreateInput,
  InsurancePreauthFilters,
  InsuranceProviderCreateInput,
  InsuranceRemittanceCreateInput,
  PatientInsuranceCreateInput,
  PayerTariffCreateInput,
} from '@/lib/types/insurance';

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

  tariffs: () => [...insuranceQueryKeys.all, 'tariffs'] as const,
  tariffList: (params?: Record<string, unknown>) =>
    [...insuranceQueryKeys.tariffs(), 'list', params] as const,
  tariffDetail: (id: number) => [...insuranceQueryKeys.tariffs(), id] as const,
};

// ---------------------------------------------------------------------------
// Provider Hooks
// ---------------------------------------------------------------------------

export function useInsuranceProviders(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: insuranceQueryKeys.providerList(params),
    queryFn: () => insuranceApi.listProviders(params),
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

export function useInsurancePlans(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: insuranceQueryKeys.planList(params),
    queryFn: () => insuranceApi.listPlans(params),
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

export function usePatientInsurances(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: insuranceQueryKeys.enrollmentList(params),
    queryFn: () => insuranceApi.listEnrollments(params),
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

// ---------------------------------------------------------------------------
// Provider Config Hooks
// ---------------------------------------------------------------------------

export function useProviderConfigs(params?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: insuranceQueryKeys.configList(params),
    queryFn: () => insuranceApi.listProviderConfigs(params),
  });
}

export function useProviderConfig(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.configDetail(id!),
    queryFn: () => insuranceApi.getProviderConfig(id!),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Claim Hooks
// ---------------------------------------------------------------------------

export function useInsuranceClaims(filters?: InsuranceClaimFilters) {
  return useQuery({
    queryKey: insuranceQueryKeys.claimList(filters),
    queryFn: () => insuranceApi.listClaims(filters),
  });
}

export function useInsuranceClaim(id: number | undefined) {
  return useQuery({
    queryKey: insuranceQueryKeys.claimDetail(id!),
    queryFn: () => insuranceApi.getClaim(id!),
    enabled: !!id,
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
