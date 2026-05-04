/**
 * React Query hooks for Blood Bank module
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bloodBankApi } from '@/lib/api/blood-bank';
import type {
  BloodDonorCreateData,
  BloodDonorListParams,
  BloodUnitCreateData,
  BloodUnitListParams,
  BloodRequestCreateData,
  BloodRequestListParams,
  CrossMatchCreateData,
  BloodIssueCreateData,
} from '@/lib/types/blood-bank';

export const bloodBankKeys = {
  all: ['blood-bank'] as const,
  donors: () => [...bloodBankKeys.all, 'donors'] as const,
  donorList: (params?: BloodDonorListParams) => [...bloodBankKeys.donors(), 'list', params] as const,
  donorDetail: (id: number) => [...bloodBankKeys.donors(), 'detail', id] as const,
  units: () => [...bloodBankKeys.all, 'units'] as const,
  unitList: (params?: BloodUnitListParams) => [...bloodBankKeys.units(), 'list', params] as const,
  unitDetail: (id: number) => [...bloodBankKeys.units(), 'detail', id] as const,
  requests: () => [...bloodBankKeys.all, 'requests'] as const,
  requestList: (params?: BloodRequestListParams) => [...bloodBankKeys.requests(), 'list', params] as const,
  requestDetail: (id: number) => [...bloodBankKeys.requests(), 'detail', id] as const,
  crossmatches: () => [...bloodBankKeys.all, 'crossmatches'] as const,
  issues: () => [...bloodBankKeys.all, 'issues'] as const,
};

// Donors
export function useBloodDonors(params?: BloodDonorListParams) {
  return useQuery({
    queryKey: bloodBankKeys.donorList(params),
    queryFn: () => bloodBankApi.listDonors(params),
  });
}

export function useBloodDonor(id: number | undefined) {
  return useQuery({
    queryKey: bloodBankKeys.donorDetail(id!),
    enabled: typeof id === 'number',
    queryFn: () => bloodBankApi.getDonor(id!),
  });
}

export function useCreateBloodDonor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BloodDonorCreateData) => bloodBankApi.createDonor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.donors() });
    },
  });
}

// Units
export function useBloodUnits(params?: BloodUnitListParams) {
  return useQuery({
    queryKey: bloodBankKeys.unitList(params),
    queryFn: () => bloodBankApi.listUnits(params),
  });
}

export function useBloodUnit(id: number | undefined) {
  return useQuery({
    queryKey: bloodBankKeys.unitDetail(id!),
    enabled: typeof id === 'number',
    queryFn: () => bloodBankApi.getUnit(id!),
  });
}

export function useCreateBloodUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BloodUnitCreateData) => bloodBankApi.createUnit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.units() });
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.donors() });
    },
  });
}

export function useMarkUnitAvailable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => bloodBankApi.markAvailable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.units() });
    },
  });
}

export function useQuarantineUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => bloodBankApi.quarantine(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.units() });
    },
  });
}

// Requests
export function useBloodRequests(params?: BloodRequestListParams) {
  return useQuery({
    queryKey: bloodBankKeys.requestList(params),
    queryFn: () => bloodBankApi.listRequests(params),
  });
}

export function useBloodRequest(id: number | undefined) {
  return useQuery({
    queryKey: bloodBankKeys.requestDetail(id!),
    enabled: typeof id === 'number',
    queryFn: () => bloodBankApi.getRequest(id!),
  });
}

export function useCreateBloodRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BloodRequestCreateData) => bloodBankApi.createRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.requests() });
    },
  });
}

export function useCancelBloodRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => bloodBankApi.cancelRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.requests() });
    },
  });
}

// Cross-Match
export function useCrossMatches(requestId?: number) {
  return useQuery({
    queryKey: [...bloodBankKeys.crossmatches(), requestId] as const,
    queryFn: () => bloodBankApi.listCrossMatches(requestId),
  });
}

export function useCreateCrossMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CrossMatchCreateData) => bloodBankApi.createCrossMatch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.crossmatches() });
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.requests() });
    },
  });
}

export function useRecordCrossMatchResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, result }: { id: number; result: 'COMPATIBLE' | 'INCOMPATIBLE' }) =>
      bloodBankApi.recordResult(id, result),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.crossmatches() });
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.requests() });
    },
  });
}

// Issues
export function useBloodIssues() {
  return useQuery({
    queryKey: bloodBankKeys.issues(),
    queryFn: () => bloodBankApi.listIssues(),
  });
}

export function useCreateBloodIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BloodIssueCreateData) => bloodBankApi.createIssue(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.issues() });
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.units() });
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.requests() });
    },
  });
}

export function useCompleteTransfusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reaction, details }: { id: number; reaction: string; details: string }) =>
      bloodBankApi.completeTransfusion(id, reaction, details),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.issues() });
      queryClient.invalidateQueries({ queryKey: bloodBankKeys.requests() });
    },
  });
}
