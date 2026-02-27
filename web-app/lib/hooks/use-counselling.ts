/**
 * Counselling React Hooks
 * Sprint Allied Health - Counselling data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { counsellingApi } from '@/lib/api/counselling';
import type {
  CounsellingReferralListParams,
  CounsellingReferralCreateData,
  CounsellingReferralUpdateData,
  CounsellingSessionListParams,
  CounsellingSessionCreateData,
  CounsellingSessionCompleteData,
  CounsellingTypeListParams,
} from '@/lib/types/counselling';

// ============ Query Key Factory ============

export const counsellingKeys = {
  all: ['counselling'] as const,
  // Types
  types: () => [...counsellingKeys.all, 'types'] as const,
  typeList: (params?: CounsellingTypeListParams) =>
    [...counsellingKeys.types(), 'list', params] as const,
  type: (id: number) => [...counsellingKeys.types(), 'detail', id] as const,
  // Referrals
  referrals: () => [...counsellingKeys.all, 'referrals'] as const,
  referralList: (params?: CounsellingReferralListParams) =>
    [...counsellingKeys.referrals(), 'list', params] as const,
  referral: (id: number) => [...counsellingKeys.referrals(), 'detail', id] as const,
  referralByNumber: (referralNumber: string) =>
    [...counsellingKeys.referrals(), 'by-number', referralNumber] as const,
  // Sessions
  sessions: () => [...counsellingKeys.all, 'sessions'] as const,
  sessionList: (params?: CounsellingSessionListParams) =>
    [...counsellingKeys.sessions(), 'list', params] as const,
  session: (id: number) => [...counsellingKeys.sessions(), 'detail', id] as const,
  referralSessions: (referralId: number) =>
    [...counsellingKeys.sessions(), 'referral', referralId] as const,
};

// ============ Counselling Type Hooks ============

export function useCounsellingTypes(params?: CounsellingTypeListParams) {
  return useQuery({
    queryKey: counsellingKeys.typeList(params),
    queryFn: () => counsellingApi.listTypes(params),
  });
}

export function useCounsellingType(id: number | undefined) {
  return useQuery({
    queryKey: counsellingKeys.type(id!),
    queryFn: () => counsellingApi.getType(id!),
    enabled: !!id,
  });
}

// ============ Referral Hooks ============

export function useCounsellingReferrals(params?: CounsellingReferralListParams) {
  return useQuery({
    queryKey: counsellingKeys.referralList(params),
    queryFn: () => counsellingApi.listReferrals(params),
  });
}

export function useCounsellingReferral(id: number | undefined) {
  return useQuery({
    queryKey: counsellingKeys.referral(id!),
    queryFn: () => counsellingApi.getReferral(id!),
    enabled: !!id,
  });
}

export function useCounsellingReferralByNumber(referralNumber: string | undefined) {
  return useQuery({
    queryKey: counsellingKeys.referralByNumber(referralNumber!),
    queryFn: () => counsellingApi.getReferralByNumber(referralNumber!),
    enabled: !!referralNumber,
  });
}

export function useCreateCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CounsellingReferralCreateData) => counsellingApi.createReferral(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

export function useUpdateCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CounsellingReferralUpdateData }) =>
      counsellingApi.updateReferral(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

export function useDeleteCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => counsellingApi.deleteReferral(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

// Referral Actions
export function useAcceptCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => counsellingApi.acceptReferral(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

export function useRejectCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      counsellingApi.rejectReferral(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

export function useAssignCounsellor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, counsellorId }: { id: number; counsellorId: number }) =>
      counsellingApi.assignCounsellor(id, counsellorId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

export function useGenerateCounsellingSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, count }: { id: number; count?: number }) =>
      counsellingApi.generateSessions(id, count),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referralSessions(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.sessions() });
    },
  });
}

export function useStartCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => counsellingApi.startReferral(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

export function useCompleteCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => counsellingApi.completeReferral(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

export function useCancelCounsellingReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      counsellingApi.cancelReferral(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referral(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.referrals() });
    },
  });
}

// ============ Session Hooks ============

export function useCounsellingSessions(params?: CounsellingSessionListParams) {
  return useQuery({
    queryKey: counsellingKeys.sessionList(params),
    queryFn: () => counsellingApi.listSessions(params),
  });
}

export function useCounsellingSession(id: number | undefined) {
  return useQuery({
    queryKey: counsellingKeys.session(id!),
    queryFn: () => counsellingApi.getSession(id!),
    enabled: !!id,
  });
}

export function useCounsellingReferralSessions(referralId: number | undefined) {
  return useQuery({
    queryKey: counsellingKeys.referralSessions(referralId!),
    queryFn: () => counsellingApi.getReferralSessions(referralId!),
    enabled: !!referralId,
  });
}

export function useCreateCounsellingSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CounsellingSessionCreateData) => counsellingApi.createSession(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.sessions() });
      queryClient.invalidateQueries({
        queryKey: counsellingKeys.referralSessions(data.referral),
      });
    },
  });
}

export function useStartCounsellingSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => counsellingApi.startSession(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.sessions() });
    },
  });
}

export function useCompleteCounsellingSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CounsellingSessionCompleteData }) =>
      counsellingApi.completeSession(id, data),
    onSuccess: (result, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.sessions() });
      queryClient.invalidateQueries({
        queryKey: counsellingKeys.referral(result.referral),
      });
    },
  });
}

export function useCancelCounsellingSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      counsellingApi.cancelSession(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.sessions() });
    },
  });
}

export function useMarkCounsellingSessionNoShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => counsellingApi.markNoShow(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.sessions() });
    },
  });
}

export function useRescheduleCounsellingSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newDate, newTime }: { id: number; newDate: string; newTime?: string }) =>
      counsellingApi.rescheduleSession(id, newDate, newTime),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: counsellingKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: counsellingKeys.sessions() });
    },
  });
}
