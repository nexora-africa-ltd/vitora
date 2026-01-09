/**
 * React hooks for pharmacy data fetching and mutations.
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pharmacyApi } from '@/lib/api/pharmacy';
import {
  DrugListParams,
  StockBatchListParams,
  StockAlertListParams,
  PrescriptionListParams,
  DispensingListParams,
  DrugCreateData,
  StockBatchCreateData,
  PrescriptionCreateData,
  DispensingCreateData,
  StockAdjustmentCreateData,
} from '@/lib/types/pharmacy';

// ============ Drug Hooks ============

/**
 * Hook for fetching paginated drug list.
 */
export function useDrugs(params?: DrugListParams) {
  return useQuery({
    queryKey: ['drugs', params],
    queryFn: () => pharmacyApi.listDrugs(params),
  });
}

/**
 * Hook for fetching a single drug.
 */
export function useDrug(id: number) {
  return useQuery({
    queryKey: ['drugs', id],
    queryFn: () => pharmacyApi.getDrug(id),
    enabled: !!id,
  });
}

/**
 * Hook for searching drugs.
 */
export function useDrugSearch(query: string) {
  return useQuery({
    queryKey: ['drugs', 'search', query],
    queryFn: () => pharmacyApi.searchDrugs(query),
    enabled: query.length >= 2,
  });
}

/**
 * Hook for creating a drug.
 */
export function useCreateDrug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DrugCreateData) => pharmacyApi.createDrug(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}

/**
 * Hook for updating a drug.
 */
export function useUpdateDrug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DrugCreateData> }) =>
      pharmacyApi.updateDrug(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['drugs', id] });
    },
  });
}

/**
 * Hook for deleting a drug.
 */
export function useDeleteDrug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pharmacyApi.deleteDrug(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}

// ============ Stock Batch Hooks ============

/**
 * Hook for fetching paginated stock batches.
 */
export function useStockBatches(params?: StockBatchListParams) {
  return useQuery({
    queryKey: ['stock-batches', params],
    queryFn: () => pharmacyApi.listStockBatches(params),
  });
}

/**
 * Hook for fetching a single stock batch.
 */
export function useStockBatch(id: number) {
  return useQuery({
    queryKey: ['stock-batches', id],
    queryFn: () => pharmacyApi.getStockBatch(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching stock batches for a drug.
 */
export function useDrugStockBatches(drugId: number) {
  return useQuery({
    queryKey: ['drugs', drugId, 'stock-batches'],
    queryFn: () => pharmacyApi.getDrugStockBatches(drugId),
    enabled: !!drugId,
  });
}

/**
 * Hook for creating a stock batch (receiving stock).
 */
export function useCreateStockBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StockBatchCreateData) => pharmacyApi.createStockBatch(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['drugs', variables.drug, 'stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    },
  });
}

/**
 * Hook for updating a stock batch.
 */
export function useUpdateStockBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StockBatchCreateData> }) =>
      pharmacyApi.updateStockBatch(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['stock-batches', id] });
    },
  });
}

// ============ Stock Alert Hooks ============

/**
 * Hook for fetching paginated stock alerts.
 */
export function useStockAlerts(params?: StockAlertListParams) {
  return useQuery({
    queryKey: ['stock-alerts', params],
    queryFn: () => pharmacyApi.listAlerts(params),
  });
}

/**
 * Hook for fetching low stock alerts.
 */
export function useLowStockAlerts() {
  return useQuery({
    queryKey: ['stock-alerts', 'low-stock'],
    queryFn: () => pharmacyApi.getLowStockAlerts(),
  });
}

/**
 * Hook for fetching expiring stock alerts.
 */
export function useExpiringAlerts() {
  return useQuery({
    queryKey: ['stock-alerts', 'expiring'],
    queryFn: () => pharmacyApi.getExpiringAlerts(),
  });
}

/**
 * Hook for acknowledging an alert.
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pharmacyApi.acknowledgeAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    },
  });
}

/**
 * Hook for resolving an alert.
 */
export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      pharmacyApi.resolveAlert(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    },
  });
}

// ============ Prescription Hooks ============

/**
 * Hook for fetching paginated prescriptions.
 */
export function usePrescriptions(params?: PrescriptionListParams) {
  return useQuery({
    queryKey: ['prescriptions', params],
    queryFn: () => pharmacyApi.listPrescriptions(params),
  });
}

/**
 * Hook for fetching a single prescription.
 */
export function usePrescription(id: number) {
  return useQuery({
    queryKey: ['prescriptions', id],
    queryFn: () => pharmacyApi.getPrescription(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching patient prescriptions.
 */
export function usePatientPrescriptions(patientId: number) {
  return useQuery({
    queryKey: ['patients', patientId, 'prescriptions'],
    queryFn: () => pharmacyApi.getPatientPrescriptions(patientId),
    enabled: !!patientId,
  });
}

/**
 * Hook for fetching encounter prescriptions.
 */
export function useEncounterPrescriptions(encounterId: number) {
  return useQuery({
    queryKey: ['encounters', encounterId, 'prescriptions'],
    queryFn: () => pharmacyApi.getEncounterPrescriptions(encounterId),
    enabled: !!encounterId,
  });
}

/**
 * Hook for fetching pending prescriptions (dispensing queue).
 */
export function usePendingPrescriptions() {
  return useQuery({
    queryKey: ['prescriptions', 'pending'],
    queryFn: () => pharmacyApi.getPendingPrescriptions(),
  });
}

/**
 * Hook for creating a prescription.
 */
export function useCreatePrescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PrescriptionCreateData) => pharmacyApi.createPrescription(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['patients', variables.patient, 'prescriptions'] });
    },
  });
}

/**
 * Hook for cancelling a prescription.
 */
export function useCancelPrescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      pharmacyApi.cancelPrescription(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    },
  });
}

// ============ Dispensing Hooks ============

/**
 * Hook for fetching paginated dispensing records.
 */
export function useDispensings(params?: DispensingListParams) {
  return useQuery({
    queryKey: ['dispensings', params],
    queryFn: () => pharmacyApi.listDispensings(params),
  });
}

/**
 * Hook for fetching a single dispensing record.
 */
export function useDispensing(id: number) {
  return useQuery({
    queryKey: ['dispensings', id],
    queryFn: () => pharmacyApi.getDispensing(id),
    enabled: !!id,
  });
}

/**
 * Hook for creating a dispensing record.
 */
export function useCreateDispensing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DispensingCreateData) => pharmacyApi.createDispensing(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensings'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    },
  });
}

/**
 * Hook for dispensing from prescription using FEFO.
 */
export function useDispenseFromPrescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      drug_id: number;
      quantity: number;
      patient_id: number;
      prescription_item_id?: number;
      counseling_notes?: string;
    }) => pharmacyApi.dispenseFromPrescription(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensings'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}

/**
 * Hook for getting available batches for a drug.
 */
export function useBatchesForDrug(drugId: number | undefined) {
  return useQuery({
    queryKey: ['stock-batches', 'by-drug', drugId],
    queryFn: () => pharmacyApi.getBatchesForDrug(drugId!),
    enabled: !!drugId,
  });
}

/**
 * Hook for returning dispensed stock.
 */
export function useReturnDispensing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, quantity, reason }: { id: number; quantity: number; reason: string }) =>
      pharmacyApi.returnDispensing(id, quantity, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensings'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
    },
  });
}

/**
 * Hook for verifying controlled drug dispensing.
 */
export function useVerifyDispensing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pharmacyApi.verifyDispensing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensings'] });
    },
  });
}

// ============ Stock Adjustment Hooks ============

/**
 * Hook for fetching stock adjustments.
 */
export function useStockAdjustments(params?: { page?: number; page_size?: number; stock_batch?: number }) {
  return useQuery({
    queryKey: ['stock-adjustments', params],
    queryFn: () => pharmacyApi.listAdjustments(params),
  });
}

/**
 * Hook for creating a stock adjustment.
 */
export function useCreateStockAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StockAdjustmentCreateData) => pharmacyApi.createAdjustment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    },
  });
}

// ============ Report Hooks ============

/**
 * Hook for fetching stock summary report.
 */
export function useStockSummaryReport() {
  return useQuery({
    queryKey: ['pharmacy-reports', 'stock-summary'],
    queryFn: () => pharmacyApi.getStockSummaryReport(),
  });
}

/**
 * Hook for fetching expiry report.
 */
export function useExpiryReport(days?: number) {
  return useQuery({
    queryKey: ['pharmacy-reports', 'expiry', days],
    queryFn: () => pharmacyApi.getExpiryReport({ days }),
  });
}

/**
 * Hook for fetching dispensing report.
 */
export function useDispensingReport(params?: { date_from?: string; date_to?: string }) {
  return useQuery({
    queryKey: ['pharmacy-reports', 'dispensing', params],
    queryFn: () => pharmacyApi.getDispensingReport(params),
  });
}

// ============ Alert Settings Hooks ============

/**
 * Hook for fetching alert settings.
 */
export function useAlertSettings() {
  return useQuery({
    queryKey: ['alert-settings'],
    queryFn: () => pharmacyApi.getAlertSettings(),
  });
}

/**
 * Hook for updating alert settings.
 */
export function useUpdateAlertSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      low_stock_threshold?: number;
      expiry_warning_days?: number;
      expiry_critical_days?: number;
      enable_email_notifications?: boolean;
      notification_email_recipients?: string;
    }) => pharmacyApi.updateAlertSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-settings'] });
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    },
  });
}
