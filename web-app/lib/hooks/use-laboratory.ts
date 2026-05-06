/**
 * React hooks for laboratory data fetching and mutations.
 * Dual-mode: PowerSync (local SQLite) with React Query API fallback.
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
  DiagnosticReport,
  DiagnosticReportCreateData,
  DiagnosticReportStatus,
} from '@/lib/types/laboratory';
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { useOfflineMutation } from '@/lib/powersync/use-offline-mutation';
import { generateId } from '@/lib/powersync/uuid';
import { transformLabOrderRow } from '@/lib/powersync/transforms';
import type { LabOrderRow } from '@/lib/powersync/schema';
import type { PaginatedResponse } from '@/lib/types';

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

/**
 * Hook for resolving AI suggestion names to test catalog entries.
 */
export function useResolveTests() {
  return useMutation({
    mutationFn: (tests: { name: string; loinc_code?: string | null }[]) =>
      laboratoryApi.resolveTests(tests),
  });
}

// ============ Lab Order Hooks — Dual-mode: PowerSync + API fallback ============

type LabOrderJoinedRow = LabOrderRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string };

/**
 * Hook for fetching paginated lab orders.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useLabOrders(params?: LabOrderListParams) {
  const limit = params?.page_size || 20;
  const offset = ((params?.page || 1) - 1) * limit;

  const conditions: string[] = [];
  const sqlParams: (string | number | null)[] = [];

  if (params?.status) {
    conditions.push('lo.status = ?');
    sqlParams.push(params.status);
  }
  if (params?.patient) {
    conditions.push('lo.patient_id = ?');
    sqlParams.push(String(params.patient));
  }
  if (params?.priority) {
    conditions.push('lo.priority = ?');
    sqlParams.push(params.priority);
  }
  if (params?.search) {
    conditions.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.mrn LIKE ? OR lo.order_number LIKE ?)');
    const pattern = `%${params.search}%`;
    sqlParams.push(pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Force API mode: lab orders require nested items with test names from the
  // test catalog, which is not synced to PowerSync's local SQLite.
  return useOfflineQuery<LabOrderJoinedRow, PaginatedResponse<LabOrder>>({
    sql: `SELECT lo.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM laboratory_laborder lo
      LEFT JOIN patients_patient p ON lo.patient_id = p.id
      ${whereClause}
      ORDER BY lo.created_at DESC
      LIMIT ? OFFSET ?`,
    params: [...sqlParams, limit, offset],
    transform: (rows) => ({
      count: rows.length < limit ? offset + rows.length : offset + limit + 1,
      next: null,
      previous: null,
      results: rows.map(r => transformLabOrderRow(r) as unknown as LabOrder),
    }),
    queryKey: ['lab-orders', params],
    queryFn: () => laboratoryApi.listOrders(params),
    forceApi: true,
  });
}

/**
 * Hook for fetching a single lab order.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useLabOrder(orderNumber: string) {
  // Force API mode: lab orders require nested items with test names
  return useOfflineQuery<LabOrderJoinedRow, LabOrder>({
    sql: `SELECT lo.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM laboratory_laborder lo
      LEFT JOIN patients_patient p ON lo.patient_id = p.id
      WHERE lo.order_number = ?`,
    params: [orderNumber],
    transform: (rows) => {
      if (rows.length === 0) throw new Error(`Lab order ${orderNumber} not found`);
      return transformLabOrderRow(rows[0]!) as unknown as LabOrder;
    },
    queryKey: ['lab-orders', orderNumber],
    queryFn: () => laboratoryApi.getOrder(orderNumber),
    forceApi: true,
    enabled: !!orderNumber,
  });
}

/**
 * Hook for fetching lab orders for a patient.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function usePatientLabOrders(patientId: number) {
  // Force API mode: lab orders require nested items with test names
  return useOfflineQuery<LabOrderJoinedRow, LabOrder[]>({
    sql: `SELECT lo.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM laboratory_laborder lo
      LEFT JOIN patients_patient p ON lo.patient_id = p.id
      WHERE lo.patient_id = ?
      ORDER BY lo.created_at DESC`,
    params: [String(patientId)],
    transform: (rows) => rows.map(r => transformLabOrderRow(r) as unknown as LabOrder),
    queryKey: ['patients', patientId, 'lab-orders'],
    queryFn: () => laboratoryApi.getPatientOrders(patientId),
    forceApi: true,
    enabled: patientId > 0,
  });
}

/**
 * Hook for fetching lab orders for an encounter.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useEncounterLabOrders(encounterId: number) {
  // Force API mode: lab orders require nested items with test names
  return useOfflineQuery<LabOrderJoinedRow, LabOrder[]>({
    sql: `SELECT lo.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM laboratory_laborder lo
      LEFT JOIN patients_patient p ON lo.patient_id = p.id
      WHERE lo.encounter_id = ?
      ORDER BY lo.created_at DESC`,
    params: [String(encounterId)],
    transform: (rows) => rows.map(r => transformLabOrderRow(r) as unknown as LabOrder),
    queryKey: ['encounters', encounterId, 'lab-orders'],
    queryFn: () => laboratoryApi.getEncounterOrders(encounterId),
    forceApi: true,
    enabled: encounterId > 0,
  });
}

/**
 * Hook for creating a lab order.
 * Uses local PowerSync write when available, falls back to API.
 */
export function useCreateLabOrder() {
  const queryClient = useQueryClient();

  return useOfflineMutation<LabOrderCreateData, LabOrder>({
    table: 'laboratory_laborder',
    operation: 'create',
    // Lab order creation MUST go through the API directly because:
    // 1. The backend generates order_number which is used as the primary identifier in URLs
    // 2. onSuccess accesses result.patient, result.encounter, result.admission for cache invalidation
    forceApi: true,
    buildLocalData: (data) => ({
      id: generateId(),
      order_number: '', // Assigned by backend after sync
      patient_id: String(data.patient),
      encounter_id: String(data.encounter),
      admission_id: data.admission ? String(data.admission) : null,
      order_type: data.order_type || 'INTERNAL',
      priority: data.priority || 'ROUTINE',
      clinical_notes: data.clinical_notes || null,
      status: 'DRAFT',
      specimen_collected: 0,
      is_paid: 0,
      ordered_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    mutationFn: (data) => laboratoryApi.createOrder(data),
    onSuccess: (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      if (newOrder) {
        queryClient.invalidateQueries({
          queryKey: ['patients', newOrder.patient, 'lab-orders'],
        });
        queryClient.invalidateQueries({
          queryKey: ['encounters', newOrder.encounter, 'lab-orders'],
        });
        if (newOrder.admission) {
          queryClient.invalidateQueries({
            queryKey: ['inpatient', 'admissions', newOrder.admission, 'orders'],
          });
          queryClient.invalidateQueries({
            queryKey: ['inpatient', 'admissions', newOrder.admission, 'lab-orders'],
          });
        }
      }
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

// ============ Diagnostic Report Hooks ============

interface DiagnosticReportListParams {
  lab_order?: number;
  status?: DiagnosticReportStatus;
}

/**
 * Hook for fetching diagnostic reports.
 */
export function useDiagnosticReports(params?: DiagnosticReportListParams) {
  return useQuery({
    queryKey: ['diagnostic-reports', params],
    queryFn: () => laboratoryApi.listDiagnosticReports(params),
  });
}

/**
 * Hook for fetching a single diagnostic report.
 */
export function useDiagnosticReport(id: number | string) {
  return useQuery({
    queryKey: ['diagnostic-reports', id],
    queryFn: () => laboratoryApi.getDiagnosticReport(id),
    enabled: !!id,
  });
}

/**
 * Hook for creating a diagnostic report.
 */
export function useCreateDiagnosticReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DiagnosticReportCreateData) =>
      laboratoryApi.createDiagnosticReport(data),
    onSuccess: (newReport: DiagnosticReport) => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-reports'] });
      queryClient.invalidateQueries({
        queryKey: ['lab-orders', newReport.lab_order_number],
      });
    },
  });
}

/**
 * Hook for updating a diagnostic report.
 */
export function useUpdateDiagnosticReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DiagnosticReport> }) =>
      laboratoryApi.updateDiagnosticReport(id, data),
    onSuccess: (updatedReport: DiagnosticReport) => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-reports'] });
      queryClient.invalidateQueries({
        queryKey: ['diagnostic-reports', updatedReport.report_number],
      });
    },
  });
}

/**
 * Hook for finalizing a diagnostic report.
 */
export function useFinalizeDiagnosticReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => laboratoryApi.finalizeDiagnosticReport(id),
    onSuccess: (updatedReport: DiagnosticReport) => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-reports'] });
      queryClient.invalidateQueries({
        queryKey: ['diagnostic-reports', updatedReport.report_number],
      });
    },
  });
}

/**
 * Hook for amending a diagnostic report.
 */
export function useAmendDiagnosticReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, conclusion }: { id: number; conclusion: string }) =>
      laboratoryApi.amendDiagnosticReport(id, conclusion),
    onSuccess: (updatedReport: DiagnosticReport) => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-reports'] });
      queryClient.invalidateQueries({
        queryKey: ['diagnostic-reports', updatedReport.report_number],
      });
    },
  });
}

/**
 * Hook for cancelling a diagnostic report.
 */
export function useCancelDiagnosticReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      laboratoryApi.cancelDiagnosticReport(id, reason),
    onSuccess: (updatedReport: DiagnosticReport) => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-reports'] });
      queryClient.invalidateQueries({
        queryKey: ['diagnostic-reports', updatedReport.report_number],
      });
    },
  });
}

/**
 * Hook for generating and downloading a diagnostic report PDF.
 */
export function useGenerateReportPdf() {
  return useMutation({
    mutationFn: (id: number) => laboratoryApi.downloadDiagnosticReportPdf(id),
    onSuccess: (blob: Blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostic-report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}

// ============ Lab Operational Reports Hooks ============

/**
 * Hook for fetching turnaround time report.
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export function useLabTurnaroundReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reports', 'turnaround', startDate, endDate],
    queryFn: () => laboratoryApi.getTurnaroundTimeReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Hook for fetching workload report.
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export function useLabWorkloadReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reports', 'workload', startDate, endDate],
    queryFn: () => laboratoryApi.getWorkloadReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Hook for fetching critical values report.
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export function useLabCriticalValuesReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reports', 'critical-values', startDate, endDate],
    queryFn: () => laboratoryApi.getCriticalValuesReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Hook for fetching sample rejection report.
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export function useLabSampleRejectionReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reports', 'rejections', startDate, endDate],
    queryFn: () => laboratoryApi.getSampleRejectionReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

// ============ L5: TAT Monitoring & SLA Hooks ============

export function useSLATargets() {
  return useQuery({
    queryKey: ['lab-reporting', 'sla-targets'],
    queryFn: () => laboratoryApi.listSLATargets(),
  });
}

export function useSLAComplianceReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reporting', 'sla-compliance', startDate, endDate],
    queryFn: () => laboratoryApi.getSLAComplianceReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useTATTrendReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reporting', 'tat-trend', startDate, endDate],
    queryFn: () => laboratoryApi.getTATTrendReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useActiveBreaches() {
  return useQuery({
    queryKey: ['lab-reporting', 'active-breaches'],
    queryFn: () => laboratoryApi.getActiveBreaches(),
    refetchInterval: 60_000,
  });
}

export function useTechnicianEfficiency(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reporting', 'technician-efficiency', startDate, endDate],
    queryFn: () => laboratoryApi.getTechnicianEfficiency(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useWorkloadKPI(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['lab-reporting', 'workload-kpi', startDate, endDate],
    queryFn: () => laboratoryApi.getWorkloadKPI(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useTATSnapshots(params?: { priority?: string; is_breach?: boolean }) {
  return useQuery({
    queryKey: ['lab-reporting', 'tat-snapshots', params],
    queryFn: () => laboratoryApi.listTATSnapshots(params),
  });
}

// ============================================================================
// Microbiology Hooks (Phase L4)
// ============================================================================

import { microbiologyApi } from '@/lib/api/laboratory';
import {
  CultureResultCreateData,
  CultureIncubateData,
  CultureReadingData,
  CultureReportData,
  SensitivityCreateData,
} from '@/lib/types/laboratory';

export function useOrganisms(params?: { gram_stain?: string; organism_type?: string; search?: string }) {
  return useQuery({
    queryKey: ['microbiology', 'organisms', params],
    queryFn: () => microbiologyApi.listOrganisms(params),
  });
}

export function useAntibiotics(params?: { antibiotic_class?: string; search?: string }) {
  return useQuery({
    queryKey: ['microbiology', 'antibiotics', params],
    queryFn: () => microbiologyApi.listAntibiotics(params),
  });
}

export function useCultures(params?: { status?: string; organism?: number; search?: string; page?: number }) {
  return useQuery({
    queryKey: ['microbiology', 'cultures', params],
    queryFn: () => microbiologyApi.listCultures(params),
  });
}

export function useCulture(id: number | undefined) {
  return useQuery({
    queryKey: ['microbiology', 'culture', id],
    queryFn: () => microbiologyApi.getCulture(id!),
    enabled: !!id,
  });
}

export function useCreateCulture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CultureResultCreateData) => microbiologyApi.createCulture(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'cultures'] });
    },
  });
}

export function useIncubateCulture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CultureIncubateData }) =>
      microbiologyApi.incubateCulture(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'culture', id] });
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'cultures'] });
    },
  });
}

export function useReadCulture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CultureReadingData }) =>
      microbiologyApi.readCulture(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'culture', id] });
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'cultures'] });
    },
  });
}

export function useReportPreliminary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CultureReportData }) =>
      microbiologyApi.reportPreliminary(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'culture', id] });
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'cultures'] });
    },
  });
}

export function useReportFinal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CultureReportData }) =>
      microbiologyApi.reportFinal(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'culture', id] });
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'cultures'] });
    },
  });
}

export function useMarkNoGrowth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => microbiologyApi.markNoGrowth(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'culture', id] });
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'cultures'] });
    },
  });
}

export function useCancelCulture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => microbiologyApi.cancelCulture(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'culture', id] });
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'cultures'] });
    },
  });
}

export function useAddSensitivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cultureId, data }: { cultureId: number; data: SensitivityCreateData }) =>
      microbiologyApi.addSensitivity(cultureId, data),
    onSuccess: (_, { cultureId }) => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'culture', cultureId] });
    },
  });
}

export function useAntibiograms(params?: { year?: number; organism?: number }) {
  return useQuery({
    queryKey: ['microbiology', 'antibiograms', params],
    queryFn: () => microbiologyApi.listAntibiograms(params),
  });
}

export function useGenerateAntibiogram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => microbiologyApi.generateAntibiogram(year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microbiology', 'antibiograms'] });
    },
  });
}
