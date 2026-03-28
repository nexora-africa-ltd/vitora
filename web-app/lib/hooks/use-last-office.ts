/**
 * React Query hooks for Last Office (Death Records)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lastOfficeApi } from '@/lib/api/last-office';
import type {
  DeathRecordCreateData,
  DeathRecordListParams,
  CertifyData,
  ReleaseBodyData,
  VoidData,
} from '@/lib/types/last-office';

export const lastOfficeQueryKeys = {
  all: ['death-records'] as const,
  lists: () => [...lastOfficeQueryKeys.all, 'list'] as const,
  list: (params?: DeathRecordListParams) => [...lastOfficeQueryKeys.lists(), params] as const,
  details: () => [...lastOfficeQueryKeys.all, 'detail'] as const,
  detail: (id: number) => [...lastOfficeQueryKeys.details(), id] as const,
};

export function useDeathRecords(params?: DeathRecordListParams) {
  return useQuery({
    queryKey: lastOfficeQueryKeys.list(params),
    queryFn: () => lastOfficeApi.list(params),
  });
}

export function useDeathRecord(id: number | undefined) {
  return useQuery({
    queryKey: lastOfficeQueryKeys.detail(id!),
    enabled: typeof id === 'number',
    queryFn: () => lastOfficeApi.get(id as number),
  });
}

export function useCreateDeathRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeathRecordCreateData) => lastOfficeApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useCertifyDeathRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: CertifyData }) =>
      lastOfficeApi.certify(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.lists() });
    },
  });
}

export function useReleaseBody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReleaseBodyData }) =>
      lastOfficeApi.releaseBody(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.lists() });
    },
  });
}

export function useReportToCivilRegistry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lastOfficeApi.reportToCivilRegistry(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.lists() });
    },
  });
}

export function useVoidDeathRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VoidData }) =>
      lastOfficeApi.void(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: lastOfficeQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}
