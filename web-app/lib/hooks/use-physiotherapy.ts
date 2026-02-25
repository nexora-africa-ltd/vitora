/**
 * Physiotherapy React Hooks
 * Sprint Allied Health - Physiotherapy data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { physiotherapyApi } from '@/lib/api/physiotherapy';
import type {
  PhysiotherapyOrderListParams,
  PhysiotherapySessionListParams,
  PhysiotherapyTreatmentTypeListParams,
  PhysiotherapyOrderCreateData,
  PhysiotherapyOrderUpdateData,
  PhysiotherapySessionCreateData,
  PhysiotherapySessionCompleteData,
} from '@/lib/types/physiotherapy';

// ============ Query Key Factory ============

export const physiotherapyKeys = {
  all: ['physiotherapy'] as const,
  // Treatment types
  treatmentTypes: () => [...physiotherapyKeys.all, 'treatment-types'] as const,
  treatmentTypeList: (params?: PhysiotherapyTreatmentTypeListParams) =>
    [...physiotherapyKeys.treatmentTypes(), 'list', params] as const,
  treatmentType: (id: number) => [...physiotherapyKeys.treatmentTypes(), 'detail', id] as const,
  // Orders
  orders: () => [...physiotherapyKeys.all, 'orders'] as const,
  orderList: (params?: PhysiotherapyOrderListParams) =>
    [...physiotherapyKeys.orders(), 'list', params] as const,
  order: (id: number) => [...physiotherapyKeys.orders(), 'detail', id] as const,
  orderByNumber: (orderNumber: string) =>
    [...physiotherapyKeys.orders(), 'by-number', orderNumber] as const,
  // Sessions
  sessions: () => [...physiotherapyKeys.all, 'sessions'] as const,
  sessionList: (params?: PhysiotherapySessionListParams) =>
    [...physiotherapyKeys.sessions(), 'list', params] as const,
  session: (id: number) => [...physiotherapyKeys.sessions(), 'detail', id] as const,
  orderSessions: (orderId: number) =>
    [...physiotherapyKeys.sessions(), 'order', orderId] as const,
};

// ============ Treatment Type Hooks ============

export function usePhysioTreatmentTypes(params?: PhysiotherapyTreatmentTypeListParams) {
  return useQuery({
    queryKey: physiotherapyKeys.treatmentTypeList(params),
    queryFn: () => physiotherapyApi.listTreatmentTypes(params),
  });
}

export function usePhysioTreatmentType(id: number | undefined) {
  return useQuery({
    queryKey: physiotherapyKeys.treatmentType(id!),
    queryFn: () => physiotherapyApi.getTreatmentType(id!),
    enabled: !!id,
  });
}

// ============ Order Hooks ============

export function usePhysioOrders(params?: PhysiotherapyOrderListParams) {
  return useQuery({
    queryKey: physiotherapyKeys.orderList(params),
    queryFn: () => physiotherapyApi.listOrders(params),
  });
}

export function usePhysioOrder(id: number | undefined) {
  return useQuery({
    queryKey: physiotherapyKeys.order(id!),
    queryFn: () => physiotherapyApi.getOrder(id!),
    enabled: !!id,
  });
}

export function usePhysioOrderByNumber(orderNumber: string | undefined) {
  return useQuery({
    queryKey: physiotherapyKeys.orderByNumber(orderNumber!),
    queryFn: () => physiotherapyApi.getOrderByNumber(orderNumber!),
    enabled: !!orderNumber,
  });
}

export function useCreatePhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PhysiotherapyOrderCreateData) => physiotherapyApi.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

export function useUpdatePhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PhysiotherapyOrderUpdateData }) =>
      physiotherapyApi.updateOrder(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

export function useDeletePhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physiotherapyApi.deleteOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

// Order Actions
export function useApprovePhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physiotherapyApi.approveOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

export function useRejectPhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      physiotherapyApi.rejectOrder(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

export function useAssignPhysioTherapist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, therapistId }: { id: number; therapistId: number }) =>
      physiotherapyApi.assignTherapist(id, therapistId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

export function useGeneratePhysioSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, count }: { id: number; count?: number }) =>
      physiotherapyApi.generateSessions(id, count),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orderSessions(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.sessions() });
    },
  });
}

export function useStartPhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physiotherapyApi.startOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

export function useCompletePhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physiotherapyApi.completeOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

export function useCancelPhysioOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      physiotherapyApi.cancelOrder(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orders() });
    },
  });
}

// ============ Session Hooks ============

export function usePhysioSessions(params?: PhysiotherapySessionListParams) {
  return useQuery({
    queryKey: physiotherapyKeys.sessionList(params),
    queryFn: () => physiotherapyApi.listSessions(params),
  });
}

export function usePhysioSession(id: number | undefined) {
  return useQuery({
    queryKey: physiotherapyKeys.session(id!),
    queryFn: () => physiotherapyApi.getSession(id!),
    enabled: !!id,
  });
}

export function usePhysioOrderSessions(orderId: number | undefined) {
  return useQuery({
    queryKey: physiotherapyKeys.orderSessions(orderId!),
    queryFn: () => physiotherapyApi.getOrderSessions(orderId!),
    enabled: !!orderId,
  });
}

export function useCreatePhysioSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PhysiotherapySessionCreateData) => physiotherapyApi.createSession(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.orderSessions(data.order_id) });
    },
  });
}

export function useStartPhysioSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physiotherapyApi.startSession(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.sessions() });
    },
  });
}

export function useCompletePhysioSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PhysiotherapySessionCompleteData }) =>
      physiotherapyApi.completeSession(id, data),
    onSuccess: (result, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.sessions() });
      queryClient.invalidateQueries({
        queryKey: physiotherapyKeys.order(result.order_id),
      });
    },
  });
}

export function useCancelPhysioSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      physiotherapyApi.cancelSession(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.sessions() });
    },
  });
}

export function useMarkPhysioSessionNoShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physiotherapyApi.markNoShow(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.sessions() });
    },
  });
}

export function useReschedulePhysioSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newDate, newTime }: { id: number; newDate: string; newTime?: string }) =>
      physiotherapyApi.rescheduleSession(id, newDate, newTime),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: physiotherapyKeys.sessions() });
    },
  });
}
