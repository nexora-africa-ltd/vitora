/**
 * Occupational Therapy React Hooks
 * Sprint Allied Health - OT data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { occupationalTherapyApi } from '@/lib/api/occupational-therapy';
import type {
  OTOrderListParams,
  OTSessionListParams,
  OTTreatmentTypeListParams,
  OTOrderCreateData,
  OTOrderUpdateData,
  OTSessionCreateData,
  OTSessionCompleteData,
} from '@/lib/types/occupational-therapy';

// ============ Query Key Factory ============

export const otKeys = {
  all: ['occupational-therapy'] as const,
  // Treatment types
  treatmentTypes: () => [...otKeys.all, 'treatment-types'] as const,
  treatmentTypeList: (params?: OTTreatmentTypeListParams) =>
    [...otKeys.treatmentTypes(), 'list', params] as const,
  treatmentType: (id: number) => [...otKeys.treatmentTypes(), 'detail', id] as const,
  // Orders
  orders: () => [...otKeys.all, 'orders'] as const,
  orderList: (params?: OTOrderListParams) => [...otKeys.orders(), 'list', params] as const,
  order: (id: number) => [...otKeys.orders(), 'detail', id] as const,
  orderByNumber: (orderNumber: string) =>
    [...otKeys.orders(), 'by-number', orderNumber] as const,
  // Sessions
  sessions: () => [...otKeys.all, 'sessions'] as const,
  sessionList: (params?: OTSessionListParams) => [...otKeys.sessions(), 'list', params] as const,
  session: (id: number) => [...otKeys.sessions(), 'detail', id] as const,
  orderSessions: (orderId: number) => [...otKeys.sessions(), 'order', orderId] as const,
};

// ============ Treatment Type Hooks ============

export function useOTTreatmentTypes(params?: OTTreatmentTypeListParams) {
  return useQuery({
    queryKey: otKeys.treatmentTypeList(params),
    queryFn: () => occupationalTherapyApi.listTreatmentTypes(params),
  });
}

export function useOTTreatmentType(id: number | undefined) {
  return useQuery({
    queryKey: otKeys.treatmentType(id!),
    queryFn: () => occupationalTherapyApi.getTreatmentType(id!),
    enabled: !!id,
  });
}

// ============ Order Hooks ============

export function useOTOrders(params?: OTOrderListParams) {
  return useQuery({
    queryKey: otKeys.orderList(params),
    queryFn: () => occupationalTherapyApi.listOrders(params),
  });
}

export function useOTOrder(id: number | undefined) {
  return useQuery({
    queryKey: otKeys.order(id!),
    queryFn: () => occupationalTherapyApi.getOrder(id!),
    enabled: !!id,
  });
}

export function useOTOrderByNumber(orderNumber: string | undefined) {
  return useQuery({
    queryKey: otKeys.orderByNumber(orderNumber!),
    queryFn: () => occupationalTherapyApi.getOrderByNumber(orderNumber!),
    enabled: !!orderNumber,
  });
}

export function useCreateOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OTOrderCreateData) => occupationalTherapyApi.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

export function useUpdateOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: OTOrderUpdateData }) =>
      occupationalTherapyApi.updateOrder(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

export function useDeleteOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => occupationalTherapyApi.deleteOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

// Order Actions
export function useApproveOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => occupationalTherapyApi.approveOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

export function useRejectOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      occupationalTherapyApi.rejectOrder(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

export function useAssignOTTherapist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, therapistId }: { id: number; therapistId: number }) =>
      occupationalTherapyApi.assignTherapist(id, therapistId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

export function useGenerateOTSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, count }: { id: number; count?: number }) =>
      occupationalTherapyApi.generateSessions(id, count),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orderSessions(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.sessions() });
    },
  });
}

export function useStartOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => occupationalTherapyApi.startOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

export function useCompleteOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => occupationalTherapyApi.completeOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

export function useCancelOTOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      occupationalTherapyApi.cancelOrder(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.orders() });
    },
  });
}

// ============ Session Hooks ============

export function useOTSessions(params?: OTSessionListParams) {
  return useQuery({
    queryKey: otKeys.sessionList(params),
    queryFn: () => occupationalTherapyApi.listSessions(params),
  });
}

export function useOTSession(id: number | undefined) {
  return useQuery({
    queryKey: otKeys.session(id!),
    queryFn: () => occupationalTherapyApi.getSession(id!),
    enabled: !!id,
  });
}

export function useOTOrderSessions(orderId: number | undefined) {
  return useQuery({
    queryKey: otKeys.orderSessions(orderId!),
    queryFn: () => occupationalTherapyApi.getOrderSessions(orderId!),
    enabled: !!orderId,
  });
}

export function useCreateOTSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OTSessionCreateData) => occupationalTherapyApi.createSession(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: otKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: otKeys.orderSessions(data.order_id) });
    },
  });
}

export function useStartOTSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => occupationalTherapyApi.startSession(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: otKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.sessions() });
    },
  });
}

export function useCompleteOTSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: OTSessionCompleteData }) =>
      occupationalTherapyApi.completeSession(id, data),
    onSuccess: (result, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: otKeys.order(result.order_id) });
    },
  });
}

export function useCancelOTSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      occupationalTherapyApi.cancelSession(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.sessions() });
    },
  });
}

export function useMarkOTSessionNoShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => occupationalTherapyApi.markNoShow(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: otKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.sessions() });
    },
  });
}

export function useRescheduleOTSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newDate, newTime }: { id: number; newDate: string; newTime?: string }) =>
      occupationalTherapyApi.rescheduleSession(id, newDate, newTime),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: otKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: otKeys.sessions() });
    },
  });
}
