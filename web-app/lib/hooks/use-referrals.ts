/**
 * Referral Hooks
 * React Query hooks for the referrals module.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { referralsApi } from '@/lib/api/referrals';
import type {
  ReferralCreateData,
  ReferralListParams,
} from '@/lib/types/referral';

// =============================================================================
// Query Key Factory
// =============================================================================

export const referralKeys = {
  all: ['referrals'] as const,
  lists: () => [...referralKeys.all, 'list'] as const,
  list: (params?: ReferralListParams) =>
    [...referralKeys.lists(), params] as const,
  details: () => [...referralKeys.all, 'detail'] as const,
  detail: (id: number) => [...referralKeys.details(), id] as const,
  forEncounter: (encounterId: number) =>
    [...referralKeys.all, 'encounter', encounterId] as const,
  pending: (params?: { target_service?: string; referral_type?: string }) =>
    [...referralKeys.all, 'pending', params] as const,
  myReferrals: () => [...referralKeys.all, 'my'] as const,
  stats: (params?: { from_date?: string; to_date?: string }) =>
    [...referralKeys.all, 'stats', params] as const,
};

// =============================================================================
// Query Hooks
// =============================================================================

/** List referrals with filters */
export function useReferrals(params?: ReferralListParams) {
  return useQuery({
    queryKey: referralKeys.list(params),
    queryFn: () => referralsApi.list(params),
  });
}

/** Get a single referral detail */
export function useReferral(id: number | undefined) {
  return useQuery({
    queryKey: referralKeys.detail(id!),
    queryFn: () => referralsApi.get(id!),
    enabled: !!id,
  });
}

/** List referrals for a specific encounter */
export function useEncounterReferrals(encounterId: number | undefined) {
  return useQuery({
    queryKey: referralKeys.forEncounter(encounterId!),
    queryFn: () => referralsApi.forEncounter(encounterId!),
    enabled: !!encounterId,
  });
}

/** List pending referrals */
export function usePendingReferrals(params?: {
  target_service?: string;
  referral_type?: string;
}) {
  return useQuery({
    queryKey: referralKeys.pending(params),
    queryFn: () => referralsApi.pending(params),
  });
}

/** Current user's referrals */
export function useMyReferrals() {
  return useQuery({
    queryKey: referralKeys.myReferrals(),
    queryFn: () => referralsApi.myReferrals(),
  });
}

/** Referral stats */
export function useReferralStats(params?: {
  from_date?: string;
  to_date?: string;
}) {
  return useQuery({
    queryKey: referralKeys.stats(params),
    queryFn: () => referralsApi.stats(params),
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/** Create a new referral */
export function useCreateReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReferralCreateData) => referralsApi.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: referralKeys.all });
      // Also invalidate encounter-specific queries
      if (variables.encounter) {
        queryClient.invalidateQueries({
          queryKey: referralKeys.forEncounter(variables.encounter),
        });
      }
    },
  });
}

/** Accept a referral */
export function useAcceptReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      referralsApi.accept(id, notes),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: referralKeys.all });
      queryClient.setQueryData(referralKeys.detail(data.id), data);
    },
  });
}

/** Decline a referral */
export function useDeclineReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      referralsApi.decline(id, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: referralKeys.all });
      queryClient.setQueryData(referralKeys.detail(data.id), data);
    },
  });
}

/** Cancel a referral */
export function useCancelReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      referralsApi.cancel(id, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: referralKeys.all });
      queryClient.setQueryData(referralKeys.detail(data.id), data);
    },
  });
}
