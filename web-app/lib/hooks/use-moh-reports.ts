/**
 * React Query hooks for MOH Reporting.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mohReportsApi } from '@/lib/api/moh-reports';
import type { MOHReportGenerateParams } from '@/lib/types/moh-reporting';

export const MOH_REPORT_KEYS = {
  all: ['moh-reports'] as const,
  moh705: {
    all: ['moh-reports', '705'] as const,
    list: () => [...MOH_REPORT_KEYS.moh705.all, 'list'] as const,
    detail: (id: number) => [...MOH_REPORT_KEYS.moh705.all, id] as const,
  },
  moh711: {
    all: ['moh-reports', '711'] as const,
    list: () => [...MOH_REPORT_KEYS.moh711.all, 'list'] as const,
    detail: (id: number) => [...MOH_REPORT_KEYS.moh711.all, id] as const,
  },
  moh717: {
    all: ['moh-reports', '717'] as const,
    list: () => [...MOH_REPORT_KEYS.moh717.all, 'list'] as const,
    detail: (id: number) => [...MOH_REPORT_KEYS.moh717.all, id] as const,
  },
};

// ---------------------------------------------------------------------------
// MOH 705
// ---------------------------------------------------------------------------

export function useMOH705List() {
  return useQuery({
    queryKey: MOH_REPORT_KEYS.moh705.list(),
    queryFn: mohReportsApi.listMOH705,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMOH705Detail(id: number) {
  return useQuery({
    queryKey: MOH_REPORT_KEYS.moh705.detail(id),
    queryFn: () => mohReportsApi.getMOH705(id),
    enabled: id > 0,
  });
}

export function useGenerateMOH705() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params?: MOHReportGenerateParams) => mohReportsApi.generateMOH705(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: MOH_REPORT_KEYS.moh705.all }),
  });
}

export function useApproveMOH705() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      mohReportsApi.approveMOH705(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: MOH_REPORT_KEYS.moh705.all }),
  });
}

// ---------------------------------------------------------------------------
// MOH 711
// ---------------------------------------------------------------------------

export function useMOH711List() {
  return useQuery({
    queryKey: MOH_REPORT_KEYS.moh711.list(),
    queryFn: mohReportsApi.listMOH711,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMOH711Detail(id: number) {
  return useQuery({
    queryKey: MOH_REPORT_KEYS.moh711.detail(id),
    queryFn: () => mohReportsApi.getMOH711(id),
    enabled: id > 0,
  });
}

export function useGenerateMOH711() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params?: MOHReportGenerateParams) => mohReportsApi.generateMOH711(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: MOH_REPORT_KEYS.moh711.all }),
  });
}

// ---------------------------------------------------------------------------
// MOH 717
// ---------------------------------------------------------------------------

export function useMOH717List() {
  return useQuery({
    queryKey: MOH_REPORT_KEYS.moh717.list(),
    queryFn: mohReportsApi.listMOH717,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMOH717Detail(id: number) {
  return useQuery({
    queryKey: MOH_REPORT_KEYS.moh717.detail(id),
    queryFn: () => mohReportsApi.getMOH717(id),
    enabled: id > 0,
  });
}

export function useGenerateMOH717() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params?: MOHReportGenerateParams) => mohReportsApi.generateMOH717(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: MOH_REPORT_KEYS.moh717.all }),
  });
}
