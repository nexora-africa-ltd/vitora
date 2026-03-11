import { apiClient } from './client';
import {
  LabOrderSchema,
  LabResultArraySchema,
  LabResultSchema,
  PaginatedLabOrderSchema,
  PaginatedLabResultSchema,
  PaginatedLabTestSchema,
} from '@/lib/schemas/laboratory.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { LabOrder, LabOrderCreateData, LabOrderListParams, LabResult, LabTest, LabTestListParams, LabVerifyResultInput } from '@/lib/types/laboratory';

export const laboratoryApi = {
  async listTests(params: LabTestListParams = {}): Promise<LabTest[]> {
    const response = await apiClient.get('/api/lab/tests/', {
      params: { page_size: 100, ...params },
    });
    const parsed = parseResponse(PaginatedLabTestSchema, response.data, {
      context: 'laboratory.listTests',
    });
    return parsed.results;
  },

  async listOrders(params: LabOrderListParams = {}): Promise<{ count: number; next: string | null; previous: string | null; results: LabOrder[] }> {
    const response = await apiClient.get('/api/lab/orders/', {
      params: { page_size: 20, ...params },
    });
    return parseResponse(PaginatedLabOrderSchema, response.data, {
      context: 'laboratory.listOrders',
    });
  },

  async listEncounterOrders(encounterId: number): Promise<LabOrder[]> {
    const response = await apiClient.get(`/api/encounters/${encounterId}/lab-orders/`, {
      params: { page_size: 50 },
    });
    const parsed = parseResponse(PaginatedLabOrderSchema, response.data, {
      context: 'laboratory.listEncounterOrders',
    });
    return parsed.results;
  },

  async getOrder(orderNumber: string): Promise<LabOrder> {
    const response = await apiClient.get(`/api/lab/orders/${orderNumber}/`);
    return parseResponse(LabOrderSchema, response.data, {
      context: 'laboratory.getOrder',
    });
  },

  async createOrder(data: LabOrderCreateData): Promise<LabOrder> {
    const response = await apiClient.post('/api/lab/orders/', data);
    return parseResponse(LabOrderSchema, response.data, {
      context: 'laboratory.createOrder',
    });
  },

  async submitOrder(orderNumber: string): Promise<LabOrder> {
    const response = await apiClient.post(`/api/lab/orders/${orderNumber}/submit/`);
    return parseResponse(LabOrderSchema, response.data, {
      context: 'laboratory.submitOrder',
    });
  },

  async collectSpecimen(orderNumber: string): Promise<LabOrder> {
    const response = await apiClient.post(`/api/lab/orders/${orderNumber}/collect-specimen/`);
    return parseResponse(LabOrderSchema, response.data, {
      context: 'laboratory.collectSpecimen',
    });
  },

  async cancelOrder(orderNumber: string, reason: string): Promise<LabOrder> {
    const response = await apiClient.post(`/api/lab/orders/${orderNumber}/cancel/`, { reason });
    return parseResponse(LabOrderSchema, response.data, {
      context: 'laboratory.cancelOrder',
    });
  },

  async listOrderResults(orderNumber: string): Promise<LabResult[]> {
    const response = await apiClient.get(`/api/lab/orders/${orderNumber}/results/`);
    return parseResponse(LabResultArraySchema, response.data, {
      context: 'laboratory.listOrderResults',
    });
  },

  async listResults(params: { page?: number; page_size?: number; verification_status?: string } = {}): Promise<{ count: number; next: string | null; previous: string | null; results: LabResult[] }> {
    const response = await apiClient.get('/api/lab/results/', {
      params: { page_size: 20, ...params },
    });
    return parseResponse(PaginatedLabResultSchema, response.data, {
      context: 'laboratory.listResults',
    });
  },

  async getResult(id: number): Promise<LabResult> {
    const response = await apiClient.get(`/api/lab/results/${id}/`);
    return parseResponse(LabResultSchema, response.data, {
      context: 'laboratory.getResult',
    });
  },

  async verifyResult(id: number, data: LabVerifyResultInput): Promise<LabResult> {
    const response = await apiClient.post(`/api/lab/results/${id}/verify/`, data);
    return parseResponse(LabResultSchema, response.data, {
      context: 'laboratory.verifyResult',
    });
  },
};