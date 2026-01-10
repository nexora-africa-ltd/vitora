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
} from '@/lib/types/pharmacy';
import { PaginatedResponse } from '@/lib/types';

export const pharmacyApi = {
  // ============ Drug Catalog ============

  /**
   * Get paginated list of drugs.
   */
  async listDrugs(params?: DrugListParams): Promise<PaginatedResponse<Drug>> {
    const response = await apiClient.get<PaginatedResponse<Drug>>('/api/pharmacy/drugs/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single drug by ID.
   */
  async getDrug(id: number): Promise<Drug> {
    const response = await apiClient.get<Drug>(`/api/pharmacy/drugs/${id}/`);
    return response.data;
  },

  /**
   * Search drugs by name or code.
   */
  async searchDrugs(query: string): Promise<Drug[]> {
    const response = await apiClient.get<PaginatedResponse<Drug>>('/api/pharmacy/drugs/', {
      params: { search: query, page_size: 20 },
    });
    return response.data.results;
  },

  /**
   * Create a new drug.
   */
  async createDrug(data: DrugCreateData): Promise<Drug> {
    const response = await apiClient.post<Drug>('/api/pharmacy/drugs/', data);
    return response.data;
  },

  /**
   * Update a drug.
   */
  async updateDrug(id: number, data: Partial<DrugCreateData>): Promise<Drug> {
    const response = await apiClient.patch<Drug>(`/api/pharmacy/drugs/${id}/`, data);
    return response.data;
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
    return response.data;
  },

  /**
   * Get a single stock batch by ID.
   */
  async getStockBatch(id: number): Promise<StockBatch> {
    const response = await apiClient.get<StockBatch>(`/api/pharmacy/stock/${id}/`);
    return response.data;
  },

  /**
   * Get stock batches for a specific drug.
   */
  async getDrugStockBatches(drugId: number): Promise<StockBatch[]> {
    const response = await apiClient.get<StockBatch[]>('/api/pharmacy/stock/by_drug/', {
      params: { drug_id: drugId },
    });
    return response.data;
  },

  /**
   * Create a new stock batch (receive stock).
   */
  async createStockBatch(data: StockBatchCreateData): Promise<StockBatch> {
    const response = await apiClient.post<StockBatch>('/api/pharmacy/stock/', data);
    return response.data;
  },

  /**
   * Update a stock batch.
   */
  async updateStockBatch(id: number, data: Partial<StockBatchCreateData>): Promise<StockBatch> {
    const response = await apiClient.patch<StockBatch>(`/api/pharmacy/stock/${id}/`, data);
    return response.data;
  },

  // ============ Stock Alerts ============

  /**
   * Get paginated list of stock alerts.
   */
  async listAlerts(params?: StockAlertListParams): Promise<PaginatedResponse<StockAlert>> {
    const response = await apiClient.get<PaginatedResponse<StockAlert>>('/api/pharmacy/alerts/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single alert by ID.
   */
  async getAlert(id: number): Promise<StockAlert> {
    const response = await apiClient.get<StockAlert>(`/api/pharmacy/alerts/${id}/`);
    return response.data;
  },

  /**
   * Get low stock alerts.
   */
  async getLowStockAlerts(): Promise<StockAlert[]> {
    const response = await apiClient.get<StockAlert[]>('/api/pharmacy/alerts/low_stock/');
    return response.data;
  },

  /**
   * Get expiring stock alerts.
   */
  async getExpiringAlerts(): Promise<StockAlert[]> {
    const response = await apiClient.get<StockAlert[]>('/api/pharmacy/alerts/expiring/');
    return response.data;
  },

  /**
   * Acknowledge an alert.
   */
  async acknowledgeAlert(id: number): Promise<StockAlert> {
    const response = await apiClient.post<StockAlert>(`/api/pharmacy/alerts/${id}/acknowledge/`);
    return response.data;
  },

  /**
   * Resolve an alert.
   */
  async resolveAlert(id: number, notes?: string): Promise<StockAlert> {
    const response = await apiClient.post<StockAlert>(`/api/pharmacy/alerts/${id}/resolve/`, {
      notes,
    });
    return response.data;
  },

  // ============ Prescriptions ============

  /**
   * Get paginated list of prescriptions.
   */
  async listPrescriptions(params?: PrescriptionListParams): Promise<PaginatedResponse<Prescription>> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single prescription by ID.
   */
  async getPrescription(id: number): Promise<Prescription> {
    const response = await apiClient.get<Prescription>(`/api/pharmacy/prescriptions/${id}/`);
    return response.data;
  },

  /**
   * Get prescriptions for a patient.
   */
  async getPatientPrescriptions(patientId: number): Promise<Prescription[]> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params: { patient: patientId },
    });
    return response.data.results;
  },

  /**
   * Get prescriptions for an encounter.
   */
  async getEncounterPrescriptions(encounterId: number): Promise<Prescription[]> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params: { encounter: encounterId },
    });
    return response.data.results;
  },

  /**
   * Get pending prescriptions (for dispensing queue).
   */
  async getPendingPrescriptions(): Promise<Prescription[]> {
    const response = await apiClient.get<PaginatedResponse<Prescription>>('/api/pharmacy/prescriptions/', {
      params: { status: 'PENDING', page_size: 100 },
    });
    return response.data.results;
  },

  /**
   * Create a new prescription.
   */
  async createPrescription(data: PrescriptionCreateData): Promise<Prescription> {
    const response = await apiClient.post<Prescription>('/api/pharmacy/prescriptions/', data);
    return response.data;
  },

  /**
   * Cancel a prescription.
   */
  async cancelPrescription(id: number, reason: string): Promise<Prescription> {
    const response = await apiClient.post<Prescription>(`/api/pharmacy/prescriptions/${id}/cancel/`, {
      reason,
    });
    return response.data;
  },

  // ============ Dispensing ============

  /**
   * Get paginated list of dispensing records.
   */
  async listDispensings(params?: DispensingListParams): Promise<PaginatedResponse<Dispensing>> {
    const response = await apiClient.get<PaginatedResponse<Dispensing>>('/api/pharmacy/dispensings/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single dispensing record by ID.
   */
  async getDispensing(id: number): Promise<Dispensing> {
    const response = await apiClient.get<Dispensing>(`/api/pharmacy/dispensings/${id}/`);
    return response.data;
  },

  /**
   * Create a new dispensing record.
   */
  async createDispensing(data: DispensingCreateData): Promise<Dispensing> {
    const response = await apiClient.post<Dispensing>('/api/pharmacy/dispensings/', data);
    return response.data;
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
    return response.data;
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
    return response.data.results;
  },

  /**
   * Return dispensed drugs.
   */
  async returnDispensing(id: number, quantity: number, reason: string): Promise<Dispensing> {
    const response = await apiClient.post<Dispensing>(`/api/pharmacy/dispensings/${id}/return_stock/`, {
      quantity,
      reason,
    });
    return response.data;
  },

  /**
   * Verify controlled drug dispensing (requires different user than dispenser).
   */
  async verifyDispensing(id: number): Promise<Dispensing> {
    const response = await apiClient.post<Dispensing>(`/api/pharmacy/dispensings/${id}/verify/`);
    return response.data;
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
    return response.data;
  },

  /**
   * Create a stock adjustment.
   */
  async createAdjustment(data: StockAdjustmentCreateData): Promise<StockAdjustment> {
    const response = await apiClient.post<StockAdjustment>('/api/pharmacy/adjustments/', data);
    return response.data;
  },

  // ============ Reports ============

  /**
   * Get stock summary report.
   */
  async getStockSummaryReport(): Promise<StockSummaryItem[]> {
    const response = await apiClient.get<StockSummaryItem[]>('/api/pharmacy/reports/stock-summary/');
    return response.data;
  },

  /**
   * Get expiry report.
   */
  async getExpiryReport(params?: { days?: number }): Promise<ExpiryReportItem[]> {
    const response = await apiClient.get<ExpiryReportItem[]>('/api/pharmacy/reports/expiry-report/', {
      params,
    });
    return response.data;
  },

  /**
   * Get dispensing report.
   */
  async getDispensingReport(params?: { date_from?: string; date_to?: string }): Promise<DispensingReportSummary> {
    const response = await apiClient.get<DispensingReportSummary>('/api/pharmacy/reports/dispensing/', {
      params,
    });
    return response.data;
  },

  /**
   * Get stock movement report.
   */
  async getStockMovementReport(params?: { date_from?: string; date_to?: string }): Promise<{ results: any[] }> {
    const response = await apiClient.get('/api/pharmacy/reports/movement/', {
      params,
    });
    return response.data;
  },

  // ============ Alert Settings ============

  /**
   * Get alert settings.
   */
  async getAlertSettings(): Promise<any> {
    const response = await apiClient.get('/api/pharmacy/alert-settings/');
    return response.data;
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
    return response.data;
  },
};
