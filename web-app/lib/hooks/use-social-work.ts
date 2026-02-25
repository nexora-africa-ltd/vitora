/**
 * Social Work React Hooks
 * Sprint Allied Health - Social Work data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialWorkApi } from '@/lib/api/social-work';
import type {
  SWReferralListParams,
  SWReferralCreateData,
  SWCaseListParams,
  SWCaseCreateData,
  SWCaseUpdateData,
  CaseNoteListParams,
  CaseNoteCreateData,
  SWInterventionListParams,
  SWInterventionCreateData,
} from '@/lib/types/social-work';

// ============ Query Key Factory ============

export const socialWorkKeys = {
  all: ['social-work'] as const,
  // Referrals
  referrals: () => [...socialWorkKeys.all, 'referrals'] as const,
  referralList: (params?: SWReferralListParams) =>
    [...socialWorkKeys.referrals(), 'list', params] as const,
  referral: (id: number) => [...socialWorkKeys.referrals(), 'detail', id] as const,
  referralByNumber: (referralNumber: string) =>
    [...socialWorkKeys.referrals(), 'by-number', referralNumber] as const,
  // Cases
  cases: () => [...socialWorkKeys.all, 'cases'] as const,
  caseList: (params?: SWCaseListParams) => [...socialWorkKeys.cases(), 'list', params] as const,
  case: (id: number) => [...socialWorkKeys.cases(), 'detail', id] as const,
  caseByNumber: (caseNumber: string) =>
    [...socialWorkKeys.cases(), 'by-number', caseNumber] as const,
  // Case Notes
  notes: () => [...socialWorkKeys.all, 'notes'] as const,
  noteList: (params?: CaseNoteListParams) => [...socialWorkKeys.notes(), 'list', params] as const,
  note: (id: number) => [...socialWorkKeys.notes(), 'detail', id] as const,
  caseNotes: (caseId: number) => [...socialWorkKeys.notes(), 'case', caseId] as const,
  // Interventions
  interventions: () => [...socialWorkKeys.all, 'interventions'] as const,
  interventionList: (params?: SWInterventionListParams) =>
    [...socialWorkKeys.interventions(), 'list', params] as const,
  intervention: (id: number) => [...socialWorkKeys.interventions(), 'detail', id] as const,
  caseInterventions: (caseId: number) =>
    [...socialWorkKeys.interventions(), 'case', caseId] as const,
};

// ============ Referral Hooks ============

export function useSWReferrals(params?: SWReferralListParams) {
  return useQuery({
    queryKey: socialWorkKeys.referralList(params),
    queryFn: () => socialWorkApi.listReferrals(params),
  });
}

export function useSWReferral(id: number | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.referral(id!),
    queryFn: () => socialWorkApi.getReferral(id!),
    enabled: !!id,
  });
}

export function useSWReferralByNumber(referralNumber: string | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.referralByNumber(referralNumber!),
    queryFn: () => socialWorkApi.getReferralByNumber(referralNumber!),
    enabled: !!referralNumber,
  });
}

export function useCreateSWReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SWReferralCreateData) => socialWorkApi.createReferral(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
    },
  });
}

export function useUpdateSWReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SWReferralCreateData> }) =>
      socialWorkApi.updateReferral(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
    },
  });
}

export function useDeleteSWReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => socialWorkApi.deleteReferral(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
    },
  });
}

// Referral Actions
export function useAcceptSWReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => socialWorkApi.acceptReferral(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
    },
  });
}

export function useRejectSWReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      socialWorkApi.rejectReferral(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
    },
  });
}

export function useAssignSWWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workerId }: { id: number; workerId: number }) =>
      socialWorkApi.assignWorker(id, workerId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
    },
  });
}

export function useCreateCaseFromReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      referralId,
      caseData,
    }: {
      referralId: number;
      caseData: Omit<SWCaseCreateData, 'referral_id'>;
    }) => socialWorkApi.createCaseFromReferral(referralId, caseData),
    onSuccess: (_, { referralId }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referral(referralId) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.cases() });
    },
  });
}

// ============ Case Hooks ============

export function useSWCases(params?: SWCaseListParams) {
  return useQuery({
    queryKey: socialWorkKeys.caseList(params),
    queryFn: () => socialWorkApi.listCases(params),
  });
}

export function useSWCase(id: number | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.case(id!),
    queryFn: () => socialWorkApi.getCase(id!),
    enabled: !!id,
  });
}

export function useSWCaseByNumber(caseNumber: string | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.caseByNumber(caseNumber!),
    queryFn: () => socialWorkApi.getCaseByNumber(caseNumber!),
    enabled: !!caseNumber,
  });
}

export function useCreateSWCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SWCaseCreateData) => socialWorkApi.createCase(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.cases() });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.referrals() });
    },
  });
}

export function useUpdateSWCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SWCaseUpdateData }) =>
      socialWorkApi.updateCase(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.case(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.cases() });
    },
  });
}

export function useDeleteSWCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => socialWorkApi.deleteCase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.cases() });
    },
  });
}

// Case Actions
export function useCloseSWCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      closureReason,
      outcomeSummary,
    }: {
      id: number;
      closureReason: string;
      outcomeSummary?: string;
    }) => socialWorkApi.closeCase(id, closureReason, outcomeSummary),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.case(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.cases() });
    },
  });
}

export function useReopenSWCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      socialWorkApi.reopenCase(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.case(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.cases() });
    },
  });
}

// ============ Case Note Hooks ============

export function useCaseNotes(params?: CaseNoteListParams) {
  return useQuery({
    queryKey: socialWorkKeys.noteList(params),
    queryFn: () => socialWorkApi.listCaseNotes(params),
  });
}

export function useCaseNotesByCaseId(caseId: number | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.caseNotes(caseId!),
    queryFn: () => socialWorkApi.getCaseNotes(caseId!),
    enabled: !!caseId,
  });
}

export function useCaseNote(id: number | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.note(id!),
    queryFn: () => socialWorkApi.getCaseNote(id!),
    enabled: !!id,
  });
}

export function useCreateCaseNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CaseNoteCreateData) => socialWorkApi.createCaseNote(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.notes() });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.caseNotes(data.case_id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.case(data.case_id) });
    },
  });
}

export function useUpdateCaseNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CaseNoteCreateData> }) =>
      socialWorkApi.updateCaseNote(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.note(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.notes() });
    },
  });
}

export function useDeleteCaseNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => socialWorkApi.deleteCaseNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.notes() });
    },
  });
}

// ============ Intervention Hooks ============

export function useInterventions(params?: SWInterventionListParams) {
  return useQuery({
    queryKey: socialWorkKeys.interventionList(params),
    queryFn: () => socialWorkApi.listInterventions(params),
  });
}

export function useInterventionsByCaseId(caseId: number | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.caseInterventions(caseId!),
    queryFn: () => socialWorkApi.getCaseInterventions(caseId!),
    enabled: !!caseId,
  });
}

export function useIntervention(id: number | undefined) {
  return useQuery({
    queryKey: socialWorkKeys.intervention(id!),
    queryFn: () => socialWorkApi.getIntervention(id!),
    enabled: !!id,
  });
}

export function useCreateIntervention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SWInterventionCreateData) => socialWorkApi.createIntervention(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.interventions() });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.caseInterventions(data.case_id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.case(data.case_id) });
    },
  });
}

export function useUpdateIntervention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SWInterventionCreateData> }) =>
      socialWorkApi.updateIntervention(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.intervention(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.interventions() });
    },
  });
}

export function useDeleteIntervention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => socialWorkApi.deleteIntervention(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.interventions() });
    },
  });
}

// Intervention Actions
export function useStartIntervention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => socialWorkApi.startIntervention(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.intervention(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.interventions() });
    },
  });
}

export function useCompleteIntervention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome?: string }) =>
      socialWorkApi.completeIntervention(id, outcome),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.intervention(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.interventions() });
    },
  });
}

export function useCancelIntervention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      socialWorkApi.cancelIntervention(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.intervention(id) });
      queryClient.invalidateQueries({ queryKey: socialWorkKeys.interventions() });
    },
  });
}

// ============ Legacy Hook Aliases (for test compatibility) ============
// These provide alternative names for commonly used hooks

/** @alias useCreateSWReferral */
export const useCreateSocialWorkReferral = useCreateSWReferral;

/** @alias useUpdateSWReferral */
export const useUpdateSocialWorkReferral = useUpdateSWReferral;
