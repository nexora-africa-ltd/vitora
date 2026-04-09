/**
 * React hooks for pharmacy data fetching and mutations.
 * Dual-mode: PowerSync (local SQLite) with React Query API fallback.
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { transformPrescriptionRow } from '@/lib/powersync/transforms';
import type { PrescriptionRow } from '@/lib/powersync/schema';
import type { PaginatedResponse } from '@/lib/types';
import type { Prescription } from '@/lib/types/pharmacy';

// ============ Drug Hooks ============

/**
 * Hook for fetching paginated drug list.
 */
export function useDrugs(params?: DrugListParams) {
  return useQuery({
    queryKey: ['drugs', params],
    queryFn: () => pharmacyApi.listDrugs(params),
    placeholderData: keepPreviousData,
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

// ============ Prescription Hooks — Dual-mode: PowerSync + API fallback ============

type PrescriptionJoinedRow = PrescriptionRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string };

/**
 * Hook for fetching paginated prescriptions.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function usePrescriptions(params?: PrescriptionListParams) {
  const limit = params?.page_size || 20;
  const offset = ((params?.page || 1) - 1) * limit;

  const conditions: string[] = [];
  const sqlParams: (string | number | null)[] = [];

  if (params?.status) {
    conditions.push('rx.status = ?');
    sqlParams.push(params.status);
  }
  if (params?.patient) {
    conditions.push('rx.patient_id = ?');
    sqlParams.push(String(params.patient));
  }
  if (params?.search) {
    conditions.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.mrn LIKE ? OR rx.prescription_number LIKE ?)');
    const pattern = `%${params.search}%`;
    sqlParams.push(pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return useOfflineQuery<PrescriptionJoinedRow, PaginatedResponse<Prescription>>({
    sql: `SELECT rx.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM pharmacy_prescription rx
      LEFT JOIN patients_patient p ON rx.patient_id = p.id
      ${whereClause}
      ORDER BY rx.created_at DESC
      LIMIT ? OFFSET ?`,
    params: [...sqlParams, limit, offset],
    transform: (rows) => ({
      count: rows.length < limit ? offset + rows.length : offset + limit + 1,
      next: null,
      previous: null,
      results: rows.map(r => transformPrescriptionRow(r) as unknown as Prescription),
    }),
    queryKey: ['prescriptions', params],
    queryFn: () => pharmacyApi.listPrescriptions(params),
  });
}

/**
 * Hook for fetching a single prescription.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function usePrescription(id: number) {
  return useOfflineQuery<PrescriptionJoinedRow, Prescription>({
    sql: `SELECT rx.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM pharmacy_prescription rx
      LEFT JOIN patients_patient p ON rx.patient_id = p.id
      WHERE rx.id = ?`,
    params: [String(id)],
    transform: (rows) => {
      if (rows.length === 0) throw new Error(`Prescription ${id} not found`);
      return transformPrescriptionRow(rows[0]!) as unknown as Prescription;
    },
    queryKey: ['prescriptions', id],
    queryFn: () => pharmacyApi.getPrescription(id),
    forceApi: !id,
  });
}

/**
 * Hook for fetching patient prescriptions.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function usePatientPrescriptions(patientId: number) {
  return useOfflineQuery<PrescriptionJoinedRow, Prescription[]>({
    sql: `SELECT rx.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM pharmacy_prescription rx
      LEFT JOIN patients_patient p ON rx.patient_id = p.id
      WHERE rx.patient_id = ?
      ORDER BY rx.created_at DESC`,
    params: [String(patientId)],
    transform: (rows) => rows.map(r => transformPrescriptionRow(r) as unknown as Prescription),
    queryKey: ['patients', patientId, 'prescriptions'],
    queryFn: () => pharmacyApi.getPatientPrescriptions(patientId),
    forceApi: !patientId,
  });
}

/**
 * Hook for fetching encounter prescriptions.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useEncounterPrescriptions(encounterId: number) {
  return useOfflineQuery<PrescriptionJoinedRow, Prescription[]>({
    sql: `SELECT rx.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM pharmacy_prescription rx
      LEFT JOIN patients_patient p ON rx.patient_id = p.id
      WHERE rx.encounter_id = ?
      ORDER BY rx.created_at DESC`,
    params: [String(encounterId)],
    transform: (rows) => rows.map(r => transformPrescriptionRow(r) as unknown as Prescription),
    queryKey: ['encounters', encounterId, 'prescriptions'],
    queryFn: () => pharmacyApi.getEncounterPrescriptions(encounterId),
    forceApi: !encounterId,
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
 * Hook for fetching prescriptions for an admission (inpatient stay).
 */
export function useAdmissionPrescriptions(admissionId: number) {
  return useQuery({
    queryKey: ['admissions', admissionId, 'prescriptions'],
    queryFn: () => pharmacyApi.getAdmissionPrescriptions(admissionId),
    enabled: !!admissionId,
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
      if (variables.admission) {
        queryClient.invalidateQueries({ queryKey: ['admissions', variables.admission, 'prescriptions'] });
      }
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

/**
 * Hook for updating a prescription's discharge fields.
 */
export function useUpdatePrescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { dispensing_type?: 'INTERNAL' | 'EXTERNAL'; is_discharge_medication?: boolean } }) =>
      pharmacyApi.updatePrescription(id, data),
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
 * Alias for useReturnDispensing with different parameter names.
 */
export function useReturnStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dispensing_id, quantity, reason }: { dispensing_id: number; quantity: number; reason: string }) =>
      pharmacyApi.returnDispensing(dispensing_id, quantity, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensings'] });
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
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
export function useDispensingReport(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['pharmacy-reports', 'dispensing', startDate, endDate],
    queryFn: () => pharmacyApi.getDispensingReport({ date_from: startDate, date_to: endDate }),
  });
}

/**
 * Hook for fetching stock movement report.
 */
export function useStockMovementReport(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['pharmacy-reports', 'movement', startDate, endDate],
    queryFn: () => pharmacyApi.getStockMovementReport({ date_from: startDate, date_to: endDate }),
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
