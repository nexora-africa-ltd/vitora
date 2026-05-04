/**
 * React Query hooks for Dialysis module
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dialysisApi } from '@/lib/api/dialysis';
import type {
  VascularAccessCreateData,
  VascularAccessListParams,
  DialysisOrderCreateData,
  DialysisOrderListParams,
  DialysisSessionCreateData,
  DialysisSessionListParams,
} from '@/lib/types/dialysis';

export const dialysisKeys = {
  all: ['dialysis'] as const,
  accesses: () => [...dialysisKeys.all, 'accesses'] as const,
  accessList: (params?: VascularAccessListParams) => [...dialysisKeys.accesses(), 'list', params] as const,
  accessDetail: (id: number) => [...dialysisKeys.accesses(), 'detail', id] as const,
  orders: () => [...dialysisKeys.all, 'orders'] as const,
  orderList: (params?: DialysisOrderListParams) => [...dialysisKeys.orders(), 'list', params] as const,
  orderDetail: (id: number) => [...dialysisKeys.orders(), 'detail', id] as const,
  sessions: () => [...dialysisKeys.all, 'sessions'] as const,
  sessionList: (params?: DialysisSessionListParams) => [...dialysisKeys.sessions(), 'list', params] as const,
  sessionDetail: (id: number) => [...dialysisKeys.sessions(), 'detail', id] as const,
};

// Vascular Access
export function useVascularAccesses(params?: VascularAccessListParams) {
  return useQuery({
    queryKey: dialysisKeys.accessList(params),
    queryFn: () => dialysisApi.listAccesses(params),
  });
}

export function useVascularAccess(id: number | undefined) {
  return useQuery({
    queryKey: dialysisKeys.accessDetail(id!),
    enabled: typeof id === 'number',
    queryFn: () => dialysisApi.getAccess(id!),
  });
}

export function useCreateVascularAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VascularAccessCreateData) => dialysisApi.createAccess(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.accesses() });
    },
  });
}

// Orders
export function useDialysisOrders(params?: DialysisOrderListParams) {
  return useQuery({
    queryKey: dialysisKeys.orderList(params),
    queryFn: () => dialysisApi.listOrders(params),
  });
}

export function useDialysisOrder(id: number | undefined) {
  return useQuery({
    queryKey: dialysisKeys.orderDetail(id!),
    enabled: typeof id === 'number',
    queryFn: () => dialysisApi.getOrder(id!),
  });
}

export function useCreateDialysisOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DialysisOrderCreateData) => dialysisApi.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.orders() });
    },
  });
}

export function useSuspendOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => dialysisApi.suspendOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.orders() });
    },
  });
}

export function useResumeOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => dialysisApi.resumeOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.orders() });
    },
  });
}

// Sessions
export function useDialysisSessions(params?: DialysisSessionListParams) {
  return useQuery({
    queryKey: dialysisKeys.sessionList(params),
    queryFn: () => dialysisApi.listSessions(params),
  });
}

export function useDialysisSession(id: number | undefined) {
  return useQuery({
    queryKey: dialysisKeys.sessionDetail(id!),
    enabled: typeof id === 'number',
    queryFn: () => dialysisApi.getSession(id!),
  });
}

export function useCreateDialysisSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DialysisSessionCreateData) => dialysisApi.createSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.sessions() });
    },
  });
}

export function useStartSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => dialysisApi.startSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.sessions() });
    },
  });
}

export function useCompleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, postVitals }: { id: number; postVitals?: Record<string, unknown> }) =>
      dialysisApi.completeSession(id, postVitals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.sessions() });
    },
  });
}

export function useAbortSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => dialysisApi.abortSession(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dialysisKeys.sessions() });
    },
  });
}
