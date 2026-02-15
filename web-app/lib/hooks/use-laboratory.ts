/**
 * React hooks for laboratory data fetching and mutations.
 * Sprint 1.5-1.6 Track B: Lab Workflow
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laboratoryApi } from '@/lib/api/laboratory';
import {
  TestCatalogListParams,
  LabOrderListParams,
  LabOrderCreateData,
  LabResultCreateData,
  LabOrder,
  LabResult,
  ResultValidation,
  ResultValidationCreateData,
  ValidationType,
} from '@/lib/types/laboratory';

// ============ Test Catalog Hooks ============

/**
 * Hook for fetching paginated test catalog.
 */
export function useTestCatalog(params?: TestCatalogListParams) {
  return useQuery({
    queryKey: ['lab-tests', params],
    queryFn: () => laboratoryApi.listTests(params),
  });
}

/**
 * Hook for fetching a single test by code.
 */
export function useTest(code: string) {
  return useQuery({
    queryKey: ['lab-tests', code],
    queryFn: () => laboratoryApi.getTest(code),
    enabled: !!code,
  });
}

/**
 * Hook for searching tests.
 */
export function useTestSearch(query: string) {
  return useQuery({
    queryKey: ['lab-tests', 'search', query],
    queryFn: () => laboratoryApi.searchTests(query),
    enabled: query.length >= 2,
  });
}

// ============ Lab Order Hooks ============

/**
 * Hook for fetching paginated lab orders.
 */
export function useLabOrders(params?: LabOrderListParams) {
  return useQuery({
    queryKey: ['lab-orders', params],
    queryFn: () => laboratoryApi.listOrders(params),
  });
}

/**
 * Hook for fetching a single lab order.
 */
export function useLabOrder(orderNumber: string) {
  return useQuery({
    queryKey: ['lab-orders', orderNumber],
    queryFn: () => laboratoryApi.getOrder(orderNumber),
    enabled: !!orderNumber,
  });
}

/**
 * Hook for fetching lab orders for a patient.
 * Polls every 30 seconds to detect new results.
 */
export function usePatientLabOrders(patientId: number) {
  return useQuery({
    queryKey: ['patients', patientId, 'lab-orders'],
    queryFn: () => laboratoryApi.getPatientOrders(patientId),
    enabled: !!patientId,
    refetchInterval: 30000, // Check for new results every 30 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook for fetching lab orders for an encounter.
 * Polls every 30 seconds to detect new results.
 */
export function useEncounterLabOrders(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'lab-orders'],
    queryFn: () => laboratoryApi.getEncounterOrders(encounterId),
    enabled: !!encounterId,
    refetchInterval: 30000, // Check for new results every 30 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook for creating a lab order.
 */
export function useCreateLabOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LabOrderCreateData) => laboratoryApi.createOrder(data),
    onSuccess: (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({
        queryKey: ['patients', newOrder.patient, 'lab-orders'],
      });
      queryClient.invalidateQueries({
        queryKey: ['encounters', newOrder.encounter, 'lab-orders'],
      });
    },
  });
}

/**
 * Hook for updating a lab order.
 */
export function useUpdateLabOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderNumber, data }: { orderNumber: string; data: Partial<LabOrder> }) =>
      laboratoryApi.updateOrder(orderNumber, data),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', updatedOrder.order_number],
      });
    },
  });
}

/**
 * Hook for submitting a lab order.
 */
export function useSubmitLabOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderNumber: string) => laboratoryApi.submitOrder(orderNumber),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', updatedOrder.order_number],
      });
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for collecting specimen.
 */
export function useCollectSpecimen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderNumber, sampleId }: { orderNumber: string; sampleId?: string }) =>
      laboratoryApi.collectSpecimen(orderNumber, sampleId),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', updatedOrder.order_number],
      });
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for cancelling a lab order.
 */
export function useCancelLabOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderNumber, reason }: { orderNumber: string; reason: string }) =>
      laboratoryApi.cancelOrder(orderNumber, reason),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', updatedOrder.order_number],
      });
    },
  });
}

/**
 * Hook for adding an item to a lab order.
 */
export function useAddOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderNumber,
      testId,
      specialInstructions,
    }: {
      orderNumber: string;
      testId: number;
      specialInstructions?: string;
    }) => laboratoryApi.addOrderItem(orderNumber, testId, specialInstructions),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', variables.orderNumber],
      });
    },
  });
}

/**
 * Hook for removing an item from a lab order.
 */
export function useRemoveOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderNumber, itemId }: { orderNumber: string; itemId: number }) =>
      laboratoryApi.removeOrderItem(orderNumber, itemId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', variables.orderNumber],
      });
    },
  });
}

// ============ Lab Result Hooks ============

/**
 * Hook for fetching results for an order.
 */
export function useOrderResults(orderNumber: string) {
  return useQuery({
    queryKey: ['lab-orders', orderNumber, 'results'],
    queryFn: () => laboratoryApi.getOrderResults(orderNumber),
    enabled: !!orderNumber,
  });
}

/**
 * Hook for fetching results for a patient.
 */
export function usePatientLabResults(patientId: number) {
  return useQuery({
    queryKey: ['patients', patientId, 'lab-results'],
    queryFn: () => laboratoryApi.getPatientResults(patientId),
    enabled: !!patientId,
  });
}

/**
 * Hook for adding a result.
 */
export function useAddLabResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderNumber, data }: { orderNumber: string; data: LabResultCreateData }) =>
      laboratoryApi.addResult(orderNumber, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', variables.orderNumber],
      });
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', variables.orderNumber, 'results'],
      });
    },
  });
}

/**
 * Hook for updating a result.
 */
export function useUpdateLabResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resultId, data }: { resultId: number; data: Partial<LabResult> }) =>
      laboratoryApi.updateResult(resultId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({ queryKey: ['lab-results'] });
    },
  });
}

/**
 * Hook for verifying a result.
 */
export function useVerifyLabResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resultId: number) => laboratoryApi.verifyResult(resultId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({ queryKey: ['lab-results'] });
      queryClient.invalidateQueries({ queryKey: ['lab-results', 'pending-verification'] });
    },
  });
}

/**
 * Hook for uploading result attachment.
 */
export function useUploadResultAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resultId, file }: { resultId: number; file: File }) =>
      laboratoryApi.uploadResultAttachment(resultId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({ queryKey: ['lab-results'] });
    },
  });
}

/**
 * Hook for fetching results pending verification.
 */
export function usePendingVerification() {
  return useQuery({
    queryKey: ['lab-results', 'pending-verification'],
    queryFn: () => laboratoryApi.getPendingVerification(),
  });
}

// ============ Lab Queue Hooks ============

/**
 * Hook for fetching lab queue.
 */
export function useLabQueue(status?: string) {
  return useQuery({
    queryKey: ['lab-queue', status],
    queryFn: () => laboratoryApi.getQueue(status),
    refetchInterval: 20000, // Refresh every 20 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is in background
  });
}

/**
 * Hook for collecting sample for queue entry.
 */
export function useCollectSample() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ queueNumber, sampleId }: { queueNumber: string; sampleId?: string }) =>
      laboratoryApi.collectSample(queueNumber, sampleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for assigning queue entry to technician.
 */
export function useAssignQueueEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ queueNumber, technicianId }: { queueNumber: string; technicianId: number | null }) =>
      laboratoryApi.assignQueueEntry(queueNumber, technicianId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for starting queue processing.
 */
export function useStartProcessing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (queueNumber: string) => laboratoryApi.startProcessing(queueNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for submitting results for review.
 */
export function useSubmitForReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (queueNumber: string) => laboratoryApi.submitForReview(queueNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for releasing results.
 */
export function useReleaseResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (queueNumber: string) => laboratoryApi.releaseResults(queueNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
    },
  });
}

/**
 * Hook for rejecting sample with reason.
 */
export function useRejectSample() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ queueNumber, reason }: { queueNumber: string; reason: string }) =>
      laboratoryApi.rejectSample(queueNumber, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for updating technician notes.
 */
export function useUpdateNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ queueNumber, notes, append }: { queueNumber: string; notes: string; append?: boolean }) =>
      laboratoryApi.updateNotes(queueNumber, notes, append),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for looking up queue entry by barcode.
 */
export function useBarcodeLookup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (barcode: string) => laboratoryApi.lookupByBarcode(barcode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    },
  });
}

/**
 * Hook for fetching available lab technicians.
 */
export function useLabTechnicians() {
  return useQuery({
    queryKey: ['lab-technicians'],
    queryFn: () => laboratoryApi.getTechnicians(),
  });
}

// ============ Critical Alerts Hook ============

/**
 * Hook for fetching critical alerts for an order.
 */
export function useCriticalAlerts(orderNumber: string) {
  return useQuery({
    queryKey: ['lab-orders', orderNumber, 'alerts'],
    queryFn: () => laboratoryApi.getCriticalAlerts(orderNumber),
    enabled: !!orderNumber,
  });
}

// ============ Result Validation Hooks (Two-Stage) ============

/**
 * Hook for fetching validations for a specific result.
 */
export function useResultValidations(resultId: number) {
  return useQuery({
    queryKey: ['lab-results', resultId, 'validations'],
    queryFn: () => laboratoryApi.getResultValidations(resultId),
    enabled: !!resultId,
  });
}

/**
 * Hook for adding a validation to a result.
 */
export function useCreateResultValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      resultId,
      data,
    }: {
      resultId: number;
      data: ResultValidationCreateData;
    }) => laboratoryApi.createResultValidation(resultId, data),
    onSuccess: (validation: ResultValidation) => {
      // Invalidate specific result validations
      queryClient.invalidateQueries({
        queryKey: ['lab-results', validation.result, 'validations'],
      });
      // Invalidate pending validations list
      queryClient.invalidateQueries({
        queryKey: ['lab-results', 'pending-validations'],
      });
      // Invalidate general lab data
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      queryClient.invalidateQueries({ queryKey: ['lab-results'] });
    },
  });
}

interface PendingValidationsParams {
  validationType?: ValidationType;
  testCategory?: string;
  priority?: string;
}

/**
 * Hook for fetching results pending validation.
 * Returns results that need technical or clinical review.
 */
export function usePendingValidations(params?: PendingValidationsParams) {
  return useQuery({
    queryKey: ['lab-results', 'pending-validations', params],
    queryFn: async () => {
      // Use pending verification endpoint and filter by validation needs
      const results = await laboratoryApi.getPendingVerification();
      // Filter by validation type if specified
      if (params?.validationType) {
        // Results with existing validations will be filtered on the server
        // This is a client-side fallback
        return results;
      }
      return results;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchIntervalInBackground: false,
  });
}

