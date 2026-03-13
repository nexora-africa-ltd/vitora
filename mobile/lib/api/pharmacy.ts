import { apiClient } from './client';
import {
  DispensationArraySchema,
  DrugProductSchema,
  HptSearchResponseSchema,
  PaginatedDrugProductSchema,
  PaginatedDispensationSchema,
  PaginatedPrescriptionSchema,
  PrescriptionSchema,
  StockBatchArraySchema,
} from '@/lib/schemas/pharmacy.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { Dispensation, DispensePayload, DrugProduct, HptMapData, HptSearchResult, PaginatedDispensationResponse, PaginatedPrescriptionResponse, Prescription, PrescriptionCreateData, PrescriptionListParams, StockBatch, StockLevel } from '@/lib/types/pharmacy';

function toStockLevel(drugId: number, batches: StockBatch[]): StockLevel {
  const availableQuantity = batches.reduce((total, batch) => total + batch.quantity_available, 0);
  const outOfStock = availableQuantity <= 0;
  const lowStock = batches.some((batch) => batch.is_low_stock || batch.is_low_stock_status) || (!outOfStock && availableQuantity < 10);

  return {
    drugId,
    availableQuantity,
    outOfStock,
    lowStock,
    batches,
  };
}

export const pharmacyApi = {
  async searchDrugs(query: string): Promise<DrugProduct[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const response = await apiClient.get('/api/pharmacy/drugs/', {
      params: { search: trimmed, page_size: 25 },
    });
    const parsed = parseResponse(PaginatedDrugProductSchema, response.data, {
      context: 'pharmacy.searchDrugs',
    });
    return parsed.results;
  },

  async listPrescriptions(params: PrescriptionListParams = {}): Promise<PaginatedPrescriptionResponse> {
    const response = await apiClient.get('/api/pharmacy/prescriptions/', {
      params: { page_size: 20, ...params },
    });
    return parseResponse(PaginatedPrescriptionSchema, response.data, {
      context: 'pharmacy.listPrescriptions',
    });
  },

  async getPrescription(id: number): Promise<Prescription> {
    const response = await apiClient.get(`/api/pharmacy/prescriptions/${id}/`);
    return parseResponse(PrescriptionSchema, response.data, {
      context: 'pharmacy.getPrescription',
    });
  },

  async createPrescription(data: PrescriptionCreateData): Promise<Prescription> {
    const response = await apiClient.post('/api/pharmacy/prescriptions/', data);
    return parseResponse(PrescriptionSchema, response.data, {
      context: 'pharmacy.createPrescription',
    });
  },

  async cancelPrescription(id: number, reason: string): Promise<Prescription> {
    const response = await apiClient.post(`/api/pharmacy/prescriptions/${id}/cancel/`, {
      reason,
    });
    return parseResponse(PrescriptionSchema, response.data, {
      context: 'pharmacy.cancelPrescription',
    });
  },

  async listDispensings(params: { page?: number; page_size?: number; patient?: number; prescription_item?: number } = {}): Promise<PaginatedDispensationResponse> {
    const response = await apiClient.get('/api/pharmacy/dispensings/', {
      params: { page_size: 20, ...params },
    });
    return parseResponse(PaginatedDispensationSchema, response.data, {
      context: 'pharmacy.listDispensings',
    });
  },

  async dispense(data: DispensePayload): Promise<Dispensation[]> {
    const response = await apiClient.post('/api/pharmacy/dispensings/dispense/', data);
    return parseResponse(DispensationArraySchema, response.data, {
      context: 'pharmacy.dispense',
    });
  },

  async getStockBatchesByDrug(drugId: number): Promise<StockBatch[]> {
    const response = await apiClient.get('/api/pharmacy/stock/by_drug/', {
      params: { drug_id: drugId },
    });
    return parseResponse(StockBatchArraySchema, response.data, {
      context: 'pharmacy.getStockBatchesByDrug',
    });
  },

  async getStockLevel(drugId: number): Promise<StockLevel> {
    const batches = await this.getStockBatchesByDrug(drugId);
    return toStockLevel(drugId, batches);
  },

  async hptSearch(query: string): Promise<{ count: number; results: HptSearchResult[] }> {
    const response = await apiClient.get('/api/pharmacy/drugs/hpt-search/', {
      params: { q: query },
    });
    return parseResponse(HptSearchResponseSchema, response.data, {
      context: 'pharmacy.hptSearch',
    });
  },

  async mapHpt(drugId: number, data: HptMapData): Promise<DrugProduct> {
    const response = await apiClient.post(`/api/pharmacy/drugs/${drugId}/map-hpt/`, data);
    return parseResponse(DrugProductSchema, response.data, {
      context: 'pharmacy.mapHpt',
    });
  },
};