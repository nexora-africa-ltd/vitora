/**
 * React hooks for imaging data fetching and mutations.
 * Phase B: Frontend Order Management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { imagingApi } from '@/lib/api/imaging';
import {
  ImagingProcedureListParams,
  ImagingOrderListParams,
  ImagingOrderCreateData,
  ImagingOrder,
  ScheduleOrderData,
  CancelOrderData,
} from '@/lib/types/imaging';

// ============ Query Keys ============

export const imagingKeys = {
  all: ['imaging'] as const,
  procedures: () => [...imagingKeys.all, 'procedures'] as const,
  proceduresList: (params?: ImagingProcedureListParams) =>
    [...imagingKeys.procedures(), 'list', params] as const,
  procedureDetail: (code: string) =>
    [...imagingKeys.procedures(), 'detail', code] as const,
  proceduresSearch: (query: string) =>
    [...imagingKeys.procedures(), 'search', query] as const,
  orders: () => [...imagingKeys.all, 'orders'] as const,
  ordersList: (params?: ImagingOrderListParams) =>
    [...imagingKeys.orders(), 'list', params] as const,
  orderDetail: (orderNumber: string) =>
    [...imagingKeys.orders(), 'detail', orderNumber] as const,
  patientOrders: (patientId: number) =>
    [...imagingKeys.orders(), 'patient', patientId] as const,
  encounterOrders: (encounterId: number) =>
    [...imagingKeys.orders(), 'encounter', encounterId] as const,
  worklist: (params?: Omit<ImagingOrderListParams, 'status'>) =>
    [...imagingKeys.orders(), 'worklist', params] as const,
  worklistStats: () => [...imagingKeys.orders(), 'worklist-stats'] as const,
};

// ============ Procedure Catalog Hooks ============

/**
 * Hook for fetching paginated imaging procedures.
 */
export function useImagingProcedures(params?: ImagingProcedureListParams) {
  return useQuery({
    queryKey: imagingKeys.proceduresList(params),
    queryFn: () => imagingApi.listProcedures(params),
  });
}

/**
 * Hook for fetching a single procedure by code.
 */
export function useImagingProcedure(code: string) {
  return useQuery({
    queryKey: imagingKeys.procedureDetail(code),
    queryFn: () => imagingApi.getProcedure(code),
    enabled: !!code,
  });
}

/**
 * Hook for searching procedures.
 */
export function useImagingProcedureSearch(query: string) {
  return useQuery({
    queryKey: imagingKeys.proceduresSearch(query),
    queryFn: () => imagingApi.searchProcedures(query),
    enabled: query.length >= 2,
  });
}

// ============ Imaging Order Hooks ============

/**
 * Hook for fetching paginated imaging orders.
 */
export function useImagingOrders(params?: ImagingOrderListParams) {
  return useQuery({
    queryKey: imagingKeys.ordersList(params),
    queryFn: () => imagingApi.listOrders(params),
  });
}

/**
 * Hook for fetching a single imaging order.
 */
export function useImagingOrder(orderNumber: string) {
  return useQuery({
    queryKey: imagingKeys.orderDetail(orderNumber),
    queryFn: () => imagingApi.getOrder(orderNumber),
    enabled: !!orderNumber,
  });
}

/**
 * Hook for fetching imaging orders for a patient.
 * Polls every 30 seconds to detect order updates.
 */
export function usePatientImagingOrders(patientId: number) {
  return useQuery({
    queryKey: imagingKeys.patientOrders(patientId),
    queryFn: () => imagingApi.getPatientOrders(patientId),
    enabled: !!patientId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook for fetching imaging orders for an encounter.
 * Polls every 30 seconds to detect order updates.
 */
export function useEncounterImagingOrders(encounterId: number) {
  return useQuery({
    queryKey: imagingKeys.encounterOrders(encounterId),
    queryFn: () => imagingApi.getEncounterOrders(encounterId),
    enabled: !!encounterId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}

// ============ Worklist Hooks ============

/**
 * Hook for fetching worklist orders.
 * Returns orders that need action (ORDERED, SCHEDULED, IN_PROGRESS).
 */
export function useImagingWorklist(
  params?: Omit<ImagingOrderListParams, 'status'>
) {
  return useQuery({
    queryKey: imagingKeys.worklist(params),
    queryFn: () => imagingApi.getWorklist(params),
    refetchInterval: 15000, // Refresh every 15 seconds
  });
}

/**
 * Hook for fetching worklist statistics.
 */
export function useWorklistStats() {
  return useQuery({
    queryKey: imagingKeys.worklistStats(),
    queryFn: () => imagingApi.getWorklistStats(),
    refetchInterval: 30000,
  });
}

// ============ Mutation Hooks ============

/**
 * Hook for creating an imaging order.
 */
export function useCreateImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImagingOrderCreateData) => imagingApi.createOrder(data),
    onSuccess: (newOrder) => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.patientOrders(newOrder.patient),
      });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.encounterOrders(newOrder.encounter),
      });
    },
  });
}

/**
 * Hook for updating an imaging order.
 */
export function useUpdateImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderNumber,
      data,
    }: {
      orderNumber: string;
      data: Partial<ImagingOrder>;
    }) => imagingApi.updateOrder(orderNumber, data),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.orderDetail(updatedOrder.order_number),
      });
    },
  });
}

/**
 * Hook for deleting an imaging order.
 */
export function useDeleteImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderNumber: string) => imagingApi.deleteOrder(orderNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
    },
  });
}

/**
 * Hook for submitting an imaging order.
 */
export function useSubmitImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderNumber: string) => imagingApi.submitOrder(orderNumber),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.orderDetail(updatedOrder.order_number),
      });
    },
  });
}

/**
 * Hook for scheduling an imaging order.
 */
export function useScheduleImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderNumber,
      data,
    }: {
      orderNumber: string;
      data: ScheduleOrderData;
    }) => imagingApi.scheduleOrder(orderNumber, data),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.orderDetail(updatedOrder.order_number),
      });
    },
  });
}

/**
 * Hook for starting an imaging order.
 */
export function useStartImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderNumber: string) => imagingApi.startOrder(orderNumber),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.orderDetail(updatedOrder.order_number),
      });
    },
  });
}

/**
 * Hook for completing an imaging order.
 */
export function useCompleteImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderNumber: string) => imagingApi.completeOrder(orderNumber),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.orderDetail(updatedOrder.order_number),
      });
    },
  });
}

/**
 * Hook for cancelling an imaging order.
 */
export function useCancelImagingOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderNumber,
      data,
    }: {
      orderNumber: string;
      data?: CancelOrderData;
    }) => imagingApi.cancelOrder(orderNumber, data),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: imagingKeys.orders() });
      queryClient.invalidateQueries({
        queryKey: imagingKeys.orderDetail(updatedOrder.order_number),
      });
    },
  });
}
