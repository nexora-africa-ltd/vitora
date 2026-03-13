/**
 * Pharmacy API client.
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

import { apiClient } from './client';
import {
  Drug,
  StockBatch,
  StockAlert,
  Prescription,
  Dispensing,
  StockAdjustment,
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
  StockSummaryItem,
  ExpiryReportItem,
  DispensingReportSummary,
  HptSearchResult,
  HptMapData,
} from '@/lib/types/pharmacy';
import { PaginatedResponse } from '@/lib/types';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  DrugSchema,
  DrugCategorySchema,
  StockBatchSchema,
  StockAlertSchema,
  PrescriptionSchema,
  DispensingSchema,
  StockAdjustmentSchema,
  StockSummaryItemSchema,
  ExpiryReportItemSchema,
  DispensingReportSummarySchema,
  StockMovementReportSchema,
  AlertSettingsSchema,
  HptSearchResponseSchema,
  PaginatedDrugSchema,
  PaginatedDrugCategorySchema,
  PaginatedStockBatchSchema,
  PaginatedStockAlertSchema,
  PaginatedPrescriptionSchema,
  PaginatedDispensingSchema,
  PaginatedStockAdjustmentSchema,
} from '@/lib/schemas/pharmacy.schema';

export interface DrugCategoryCreateData {
  name: string;
  code?: string;
}

export const pharmacyApi = {
  // ============ Drug Catalog ============

  /**
   * Get available drug categories (from backend registry).
   */
  async listDrugCategories(): Promise<Array<{ value: string; label: string }>> {
    const response = await apiClient.get('/api/pharmacy/drug-categories/', {
      params: { page_size: 500 },
    });
    const parsed = parseResponse(PaginatedDrugCategorySchema, response.data, {
      context: 'pharmacyApi.listDrugCategories',
    });
    return parsed.results.map((c) => ({ value: c.value, label: c.label }));
  },

  /**
   * Create a new drug category in the backend registry.
   */
  async createDrugCategory(data: DrugCategoryCreateData): Promise<{ value: string; label: string }>
  {
    const response = await apiClient.post('/api/pharmacy/drug-categories/', data);
    const parsed = parseResponse(DrugCategorySchema, response.data, {
      context: 'pharmacyApi.createDrugCategory',
    });
    return { value: parsed.value, label: parsed.label };
  },

  /**
   * Get paginated list of drugs.
   */
  async listDrugs(params?: DrugListParams): Promise<PaginatedResponse<Drug>> {
    const response = await apiClient.get<PaginatedResponse<Drug>>('/api/pharmacy/drugs/', {
      params,
    });
    return parseResponse(PaginatedDrugSchema, response.data, { context: 'pharmacyApi.listDrugs' });
  },

  /**
   * Get a single drug by ID.
   */
  async getDrug(id: number): Promise<Drug> {
    const response = await apiClient.get<Drug>(`/api/pharmacy/drugs/${id}/`);
    return parseResponse(DrugSchema, response.data, { context: 'pharmacyApi.getDrug' });
  },

  /**
   * Search drugs by name or code.
   */
  async searchDrugs(query: string): Promise<Drug[]> {
    const response = await apiClient.get<PaginatedResponse<Drug>>('/api/pharmacy/drugs/', {
      params: { search: query, page_size: 20 },
    });
    const parsed = parseResponse(PaginatedDrugSchema, response.data, { context: 'pharmacyApi.searchDrugs' });
    return parsed.results;
  },

  /**
   * Create a new drug.
   */
  async createDrug(data: DrugCreateData): Promise<Drug> {
    const response = await apiClient.post<Drug>('/api/pharmacy/drugs/', data);
    return parseResponse(DrugSchema, response.data, { context: 'pharmacyApi.createDrug' });
  },

  /**
   * Update a drug.
   */
  async updateDrug(id: number, data: Partial<DrugCreateData>): Promise<Drug> {
    const response = await apiClient.patch<Drug>(`/api/pharmacy/drugs/${id}/`, data);
    return parseResponse(DrugSchema, response.data, { context: 'pharmacyApi.updateDrug' });
  },

  /**
   * Delete a drug.
   */
  async deleteDrug(id: number): Promise<void> {
    await apiClient.delete(`/api/pharmacy/drugs/${id}/`);
  },

  // ============ Stock Batches ============

  /**
   * Get paginated list of stock batches.
   */
  async listStockBatches(params?: StockBatchListParams): Promise<PaginatedResponse<StockBatch>> {
    const response = await apiClient.get<PaginatedResponse<StockBatch>>('/api/pharmacy/stock/', {
      params,
    });
    return parseResponse(PaginatedStockBatchSchema, response.data, { context: 'pharmacyApi.listStockBatches' });
  },

  /**
   * Get a single stock batch by ID.
   */
  async getStockBatch(id: number): Promise<StockBatch> {
    const response = await apiClient.get<StockBatch>(`/api/pharmacy/stock/${id}/`);
    return parseResponse(StockBatchSchema, response.data, { context: 'pharmacyApi.getStockBatch' });
  },

  /**
   * Get stock batches for a specific drug.
   */
  async getDrugStockBatches(drugId: number): Promise<StockBatch[]> {
    const response = await apiClient.get<StockBatch[]>('/api/pharmacy/stock/by_drug/', {
      params: { drug_id: drugId },
    });
    return parseResponse(z.array(StockBatchSchema), response.data, { context: 'pharmacyApi.getDrugStockBatches' });
  },

  /**
   * Create a new stock batch (receive stock).
   */
  async createStockBatch(data: StockBatchCreateData): Promise<StockBatch> {
    const response = await apiClient.post<StockBatch>('/api/pharmacy/stock/', data);
    return parseResponse(StockBatchSchema, response.data, { context: 'pharmacyApi.createStockBatch' });
  },

  /**
   * Update a stock batch.
   */
  async updateStockBatch(id: number, data: Partial<StockBatchCreateData>): Promise<StockBatch> {
    const response = await apiClient.patch<StockBatch>(`/api/pharmacy/stock/${id}/`, data);
    return parseResponse(StockBatchSchema, response.data, { context: 'pharmacyApi.updateStockBatch' });
  },

  // ============ Stock Alerts ============

  /**
   * Get paginated list of stock alerts.
   */
  async listAlerts(params?: StockAlertListParams): Promise<PaginatedResponse<StockAlert>> {
    const response = await apiClient.get<PaginatedResponse<StockAlert>>('/api/pharmacy/alerts/', {
      params,
    });
    return parseResponse(PaginatedStockAlertSchema, response.data, { context: 'pharmacyApi.listAlerts' });
  },

  /**
   * Get a single alert by ID.
   */
  async getAlert(id: number): Promise<StockAlert> {
    const response = await apiClient.get<StockAlert>(`/api/pharmacy/alerts/${id}/`);
    return parseResponse(StockAlertSchema, response.data, { context: 'pharmacyApi.getAlert' });
  },

  /**
   * Get low stock alerts.
   */
  async getLowStockAlerts(): Promise<StockAlert[]> {
    const response = await apiClient.get<StockAlert[]>('/api/pharmacy/alerts/low_stock/');
    return parseResponse(z.array(StockAlertSchema), response.data, { context: 'pharmacyApi.getLowStockAlerts' });
  },

  /**
   * Get expiring stock alerts.
   */
  async getExpiringAlerts(): Promise<StockAlert[]> {
    const response = await apiClient.get<StockAlert[]>('/api/pharmacy/alerts/expiring/');
    return parseResponse(z.array(StockAlertSchema), response.data, { context: 'pharmacyApi.getExpiringAlerts' });
  },

  /**
   * Acknowledge an alert.
   */
  async acknowledgeAlert(id: number): Promise<StockAlert> {
    const response = await apiClient.post<StockAlert>(`/api/pharmacy/alerts/${id}/acknowledge/`);
    return parseResponse(StockAlertSchema, response.data, { context: 'pharmacyApi.acknowledgeAlert' });
  },

  /**
   * Resolve an alert.
   */
  async resolveAlert(id: number, notes?: string): Promise<StockAlert> {
    const response = await apiClient.post<StockAlert>(`/api/pharmacy/alerts/${id}/resolve/`, {
      notes,
    });
    return parseResponse(StockAlertSchema, response.data, { context: 'pharmacyApi.resolveAlert' });
  },

  // ============ Prescriptions ============

  /**
   * Get paginated list of prescriptions.
   */
  async listPrescriptions(params?: PrescriptionListParams): Promise<PaginatedResponse<Prescription>> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params,
    });
    return parseResponse(PaginatedPrescriptionSchema, response.data, { context: 'pharmacyApi.listPrescriptions' });
  },

  /**
   * Get a single prescription by ID.
   */
  async getPrescription(id: number): Promise<Prescription> {
    const response = await apiClient.get<Prescription>(`/api/pharmacy/prescriptions/${id}/`);
    return parseResponse(PrescriptionSchema, response.data, { context: 'pharmacyApi.getPrescription' });
  },

  /**
   * Get prescriptions for a patient.
   */
  async getPatientPrescriptions(patientId: number): Promise<Prescription[]> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params: { patient: patientId },
    });
    const parsed = parseResponse(PaginatedPrescriptionSchema, response.data, { context: 'pharmacyApi.getPatientPrescriptions' });
    return parsed.results;
  },

  /**
   * Get prescriptions for an encounter.
   */
  async getEncounterPrescriptions(encounterId: number): Promise<Prescription[]> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params: { encounter: encounterId },
    });
    const parsed = parseResponse(PaginatedPrescriptionSchema, response.data, { context: 'pharmacyApi.getEncounterPrescriptions' });
    return parsed.results;
  },

  /**
   * Get pending prescriptions (for dispensing queue).
   */
  async getPendingPrescriptions(): Promise<Prescription[]> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params: { status: 'PENDING', page_size: 100 },
    });
    const parsed = parseResponse(PaginatedPrescriptionSchema, response.data, { context: 'pharmacyApi.getPendingPrescriptions' });
    return parsed.results;
  },

  /**
   * Create a new prescription.
   */
  async createPrescription(data: PrescriptionCreateData): Promise<Prescription> {
    const response = await apiClient.post<Prescription>('/api/pharmacy/prescriptions/', data);
    return parseResponse(PrescriptionSchema, response.data, { context: 'pharmacyApi.createPrescription' });
  },

  /**
   * Cancel a prescription.
   */
  async cancelPrescription(id: number, reason: string): Promise<Prescription> {
    const response = await apiClient.post<Prescription>(`/api/pharmacy/prescriptions/${id}/cancel/`, {
      reason,
    });
    return parseResponse(PrescriptionSchema, response.data, { context: 'pharmacyApi.cancelPrescription' });
  },

  // ============ Dispensing ============

  /**
   * Get paginated list of dispensing records.
   */
  async listDispensings(params?: DispensingListParams): Promise<PaginatedResponse<Dispensing>> {
    const response = await apiClient.get<PaginatedResponse<Dispensing>>('/api/pharmacy/dispensings/', {
      params,
    });
    return parseResponse(PaginatedDispensingSchema, response.data, { context: 'pharmacyApi.listDispensings' });
  },

  /**
   * Get a single dispensing record by ID.
   */
  async getDispensing(id: number): Promise<Dispensing> {
    const response = await apiClient.get<Dispensing>(`/api/pharmacy/dispensings/${id}/`);
    return parseResponse(DispensingSchema, response.data, { context: 'pharmacyApi.getDispensing' });
  },

  /**
   * Create a new dispensing record.
   */
  async createDispensing(data: DispensingCreateData): Promise<Dispensing> {
    const response = await apiClient.post<Dispensing>('/api/pharmacy/dispensings/', data);
    return parseResponse(DispensingSchema, response.data, { context: 'pharmacyApi.createDispensing' });
  },

  /**
   * Dispense from prescription using FEFO.
   * Returns array of dispensing records (may span multiple batches).
   */
  async dispenseFromPrescription(data: {
    drug_id: number;
    quantity: number;
    patient_id: number;
    prescription_item_id?: number;
    counseling_notes?: string;
  }): Promise<Dispensing[]> {
    const response = await apiClient.post<Dispensing[]>('/api/pharmacy/dispensings/dispense/', data);
    return parseResponse(z.array(DispensingSchema), response.data, { context: 'pharmacyApi.dispenseFromPrescription' });
  },

  /**
   * Get available batches for a drug (for manual batch selection).
   */
  async getBatchesForDrug(drugId: number): Promise<StockBatch[]> {
    const response = await apiClient.get<PaginatedResponse<StockBatch>>('/api/pharmacy/stock/', {
      params: {
        drug: drugId,
        status: 'AVAILABLE',
        page_size: 100,
        ordering: 'expiry_date', // FEFO ordering
      },
    });
    const parsed = parseResponse(PaginatedStockBatchSchema, response.data, { context: 'pharmacyApi.getBatchesForDrug' });
    return parsed.results;
  },

  /**
   * Return dispensed drugs.
   */
  async returnDispensing(id: number, quantity: number, reason: string): Promise<Dispensing> {
    const response = await apiClient.post<Dispensing>(`/api/pharmacy/dispensings/${id}/return_stock/`, {
      quantity,
      reason,
    });
    return parseResponse(DispensingSchema, response.data, { context: 'pharmacyApi.returnDispensing' });
  },

  /**
   * Verify controlled drug dispensing (requires different user than dispenser).
   */
  async verifyDispensing(id: number): Promise<Dispensing> {
    const response = await apiClient.post<Dispensing>(`/api/pharmacy/dispensings/${id}/verify/`);
    return parseResponse(DispensingSchema, response.data, { context: 'pharmacyApi.verifyDispensing' });
  },

  // ============ Stock Adjustments ============

  /**
   * Get paginated list of stock adjustments.
   */
  async listAdjustments(params?: { page?: number; page_size?: number; stock_batch?: number }): Promise<
    PaginatedResponse<StockAdjustment>
  > {
    const response = await apiClient.get<PaginatedResponse<StockAdjustment>>('/api/pharmacy/adjustments/', {
      params,
    });
    return parseResponse(PaginatedStockAdjustmentSchema, response.data, { context: 'pharmacyApi.listAdjustments' });
  },

  /**
   * Create a stock adjustment.
   */
  async createAdjustment(data: StockAdjustmentCreateData): Promise<StockAdjustment> {
    const response = await apiClient.post<StockAdjustment>('/api/pharmacy/adjustments/', data);
    return parseResponse(StockAdjustmentSchema, response.data, { context: 'pharmacyApi.createAdjustment' });
  },

  // ============ Reports ============

  /**
   * Get stock summary report.
   */
  async getStockSummaryReport(): Promise<{ results: StockSummaryItem[] }> {
    const response = await apiClient.get<{ results: StockSummaryItem[] }>('/api/pharmacy/reports/stock-summary/');
    return parseResponse(z.object({ results: z.array(StockSummaryItemSchema) }), response.data, { context: 'pharmacyApi.getStockSummaryReport' });
  },

  /**
   * Get expiry report.
   */
  async getExpiryReport(params?: { days?: number }): Promise<ExpiryReportItem[]> {
    const response = await apiClient.get<{ results: ExpiryReportItem[] }>('/api/pharmacy/reports/expiry-report/', {
      params,
    });
    const parsed = parseResponse(z.object({ results: z.array(ExpiryReportItemSchema) }), response.data, { context: 'pharmacyApi.getExpiryReport' });
    return parsed.results;
  },

  /**
   * Get dispensing report.
   */
  async getDispensingReport(params?: { date_from?: string; date_to?: string }): Promise<DispensingReportSummary> {
    const response = await apiClient.get<DispensingReportSummary>('/api/pharmacy/reports/dispensing/', {
      params,
    });
    return parseResponse(DispensingReportSummarySchema, response.data, { context: 'pharmacyApi.getDispensingReport' });
  },

  /**
   * Get stock movement report.
   */
  async getStockMovementReport(params?: { date_from?: string; date_to?: string }): Promise<{ results: any[] }> {
    const response = await apiClient.get('/api/pharmacy/reports/movement/', {
      params,
    });
    return parseResponse(StockMovementReportSchema, response.data, { context: 'pharmacyApi.getStockMovementReport' });
  },

  // ============ Alert Settings ============

  /**
   * Get alert settings.
   */
  async getAlertSettings(): Promise<any> {
    const response = await apiClient.get('/api/pharmacy/alert-settings/');
    return parseResponse(AlertSettingsSchema, response.data, { context: 'pharmacyApi.getAlertSettings' });
  },

  /**
   * Update alert settings.
   */
  async updateAlertSettings(data: {
    low_stock_threshold?: number;
    expiry_warning_days?: number;
    expiry_critical_days?: number;
    enable_email_notifications?: boolean;
    notification_email_recipients?: string;
  }): Promise<any> {
    const response = await apiClient.patch('/api/pharmacy/alert-settings/', data);
    return parseResponse(AlertSettingsSchema, response.data, { context: 'pharmacyApi.updateAlertSettings' });
  },

  // ============ HPT Registry ============

  /**
   * Search the DHA HPT Registry for drug products.
   */
  async hptSearch(query: string): Promise<{ count: number; results: HptSearchResult[] }> {
    const response = await apiClient.get('/api/pharmacy/drugs/hpt-search/', {
      params: { q: query },
    });
    return parseResponse(HptSearchResponseSchema, response.data, { context: 'pharmacyApi.hptSearch' });
  },

  /**
   * Map a local drug to an HPT registry entry.
   */
  async mapHpt(drugId: number, data: HptMapData): Promise<Drug> {
    const response = await apiClient.post(`/api/pharmacy/drugs/${drugId}/map-hpt/`, data);
    return parseResponse(DrugSchema, response.data, { context: 'pharmacyApi.mapHpt' });
  },
};
