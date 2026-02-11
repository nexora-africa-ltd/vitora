/**
 * Laboratory API client.
 * Sprint 1.5-1.6 Track B: Lab Workflow
 */

import { apiClient } from './client';
import {
  TestCatalog,
  TestCatalogListItem,
  LabOrder,
  LabOrderItem,
  LabResult,
  LabQueue,
  LabOrderCreateData,
  LabResultCreateData,
  TestCatalogListParams,
  LabOrderListParams,
  CriticalAlert,
} from '@/lib/types/laboratory';
import { PaginatedResponse } from '@/lib/types';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  LabResultSchema,
  LabTestCatalogSchema,
  LabTestCatalogListSchema,
  LabOrderSchema,
  LabOrderItemSchema,
  LabQueueSchema,
  PaginatedLabTestCatalogSchema,
  PaginatedLabOrderSchema,
  CriticalAlertArraySchema,
  LabTechnicianArraySchema,
  LabQueueStatsSchema,
  LabResultAttachmentArraySchema,
} from '@/lib/schemas/laboratory.schema';

export const laboratoryApi = {
  // ============ Test Catalog ============

  /**
   * Get paginated list of lab tests.
   */
  async listTests(params?: TestCatalogListParams): Promise<PaginatedResponse<TestCatalogListItem>> {
    const response = await apiClient.get<PaginatedResponse<TestCatalogListItem>>('/api/lab/tests/', {
      params,
    });
    return parseResponse(PaginatedLabTestCatalogSchema, response.data, { context: 'laboratoryApi.listTests' });
  },

  /**
   * Get a single test by code.
   */
  async getTest(code: string): Promise<TestCatalog> {
    const response = await apiClient.get<TestCatalog>(`/api/lab/tests/${code}/`);
    return parseResponse(LabTestCatalogSchema, response.data, { context: 'laboratoryApi.getTest' });
  },

  /**
   * Search tests by name or code.
   * Uses the list endpoint with search query param.
   */
  async searchTests(query: string): Promise<TestCatalogListItem[]> {
    const response = await apiClient.get<PaginatedResponse<TestCatalogListItem>>('/api/lab/tests/', {
      params: { search: query, is_active: true },
    });
    const validated = parseResponse(PaginatedLabTestCatalogSchema, response.data, { context: 'laboratoryApi.searchTests' });
    return validated.results;
  },

  // ============ Lab Orders ============

  /**
   * Get paginated list of lab orders.
   */
  async listOrders(params?: LabOrderListParams): Promise<PaginatedResponse<LabOrder>> {
    const response = await apiClient.get<PaginatedResponse<LabOrder>>('/api/lab/orders/', {
      params,
    });
    return parseResponse(PaginatedLabOrderSchema, response.data, { context: 'laboratoryApi.listOrders' });
  },

  /**
   * Get a single lab order by order number.
   */
  async getOrder(orderNumber: string): Promise<LabOrder> {
    const response = await apiClient.get<LabOrder>(`/api/lab/orders/${orderNumber}/`);
    return parseResponse(LabOrderSchema, response.data, { context: 'laboratoryApi.getOrder' });
  },

  /**
   * Get lab orders for a specific patient.
   */
  async getPatientOrders(patientId: number): Promise<LabOrder[]> {
    const response = await apiClient.get<LabOrder[]>(`/api/patients/${patientId}/lab-orders/`);
    return parseResponse(z.array(LabOrderSchema), response.data, { context: 'laboratoryApi.getPatientOrders' });
  },

  /**
   * Get lab orders for a specific encounter.
   */
  async getEncounterOrders(encounterId: number): Promise<LabOrder[]> {
    const response = await apiClient.get<{ results: LabOrder[] } | LabOrder[]>(`/api/encounters/${encounterId}/lab-orders/`);
    // Handle both paginated and non-paginated responses
    if (Array.isArray(response.data)) {
      return parseResponse(z.array(LabOrderSchema), response.data, { context: 'laboratoryApi.getEncounterOrders' });
    }
    return parseResponse(z.array(LabOrderSchema), response.data.results || [], { context: 'laboratoryApi.getEncounterOrders' });
  },

  /**
   * Create a new lab order.
   */
  async createOrder(data: LabOrderCreateData): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>('/api/lab/orders/', data);
    return parseResponse(LabOrderSchema, response.data, { context: 'laboratoryApi.createOrder' });
  },

  /**
   * Update a lab order.
   */
  async updateOrder(orderNumber: string, data: Partial<LabOrder>): Promise<LabOrder> {
    const response = await apiClient.patch<LabOrder>(`/api/lab/orders/${orderNumber}/`, data);
    return parseResponse(LabOrderSchema, response.data, { context: 'laboratoryApi.updateOrder' });
  },

  /**
   * Submit an order for processing.
   */
  async submitOrder(orderNumber: string): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>(`/api/lab/orders/${orderNumber}/submit/`);
    return parseResponse(LabOrderSchema, response.data, { context: 'laboratoryApi.submitOrder' });
  },

  /**
   * Mark specimen as collected.
   */
  async collectSpecimen(orderNumber: string, sampleId?: string): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>(
      `/api/lab/orders/${orderNumber}/collect-specimen/`,
      { sample_id: sampleId }
    );
    return parseResponse(LabOrderSchema, response.data, { context: 'laboratoryApi.collectSpecimen' });
  },

  /**
   * Cancel a lab order.
   */
  async cancelOrder(orderNumber: string, reason: string): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>(`/api/lab/orders/${orderNumber}/cancel/`, {
      reason,
    });
    return parseResponse(LabOrderSchema, response.data, { context: 'laboratoryApi.cancelOrder' });
  },

  /**
   * Add item to order.
   */
  async addOrderItem(
    orderNumber: string,
    testId: number,
    specialInstructions?: string
  ): Promise<LabOrderItem> {
    const response = await apiClient.post<LabOrderItem>(
      `/api/lab/orders/${orderNumber}/items/`,
      {
        test: testId,
        special_instructions: specialInstructions,
      }
    );
    return parseResponse(LabOrderItemSchema, response.data, { context: 'laboratoryApi.addOrderItem' });
  },

  /**
   * Remove item from order.
   */
  async removeOrderItem(orderNumber: string, itemId: number): Promise<void> {
    await apiClient.delete(`/api/lab/orders/${orderNumber}/items/${itemId}/`);
  },

  /**
   * Get PDF requisition for external order.
   */
  async getRequisitionPdf(orderNumber: string): Promise<Blob> {
    const response = await apiClient.get(`/api/lab/orders/${orderNumber}/requisition/`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Check for critical results alerts.
   */
  async getCriticalAlerts(orderNumber: string): Promise<CriticalAlert[]> {
    const response = await apiClient.get<CriticalAlert[]>(
      `/api/lab/orders/${orderNumber}/alerts/`
    );
    return parseResponse(CriticalAlertArraySchema, response.data, { context: 'laboratoryApi.getCriticalAlerts' });
  },

  // ============ Lab Results ============

  /**
   * Get a single lab result by result ID.
   */
  async getResult(resultId: number): Promise<LabResult> {
    const response = await apiClient.get<LabResult>(`/api/lab/results/${resultId}/`);
    return parseResponse(LabResultSchema, response.data, { context: 'laboratoryApi.getResult' });
  },

  /**
   * Get results for an order.
   */
  async getOrderResults(orderNumber: string): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>(
      `/api/lab/orders/${orderNumber}/results/`
    );
    return parseResponse(z.array(LabResultSchema), response.data, { context: 'laboratoryApi.getOrderResults' });
  },

  /**
   * Get results for a patient.
   */
  async getPatientResults(patientId: number): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>(
      `/api/patients/${patientId}/lab-results/`
    );
    return parseResponse(z.array(LabResultSchema), response.data, { context: 'laboratoryApi.getPatientResults' });
  },

  /**
   * Add result to order item.
   */
  async addResult(orderNumber: string, data: LabResultCreateData): Promise<LabResult> {
    const response = await apiClient.post<LabResult>(
      `/api/lab/orders/${orderNumber}/results/`,
      data
    );
    return parseResponse(LabResultSchema, response.data, { context: 'laboratoryApi.addResult' });
  },

  /**
   * Update a result.
   */
  async updateResult(resultId: number, data: Partial<LabResult>): Promise<LabResult> {
    const response = await apiClient.patch<LabResult>(`/api/lab/results/${resultId}/`, data);
    return parseResponse(LabResultSchema, response.data, { context: 'laboratoryApi.updateResult' });
  },

  /**
   * Verify a result.
   */
  async verifyResult(resultId: number, approved: boolean = true, comments?: string): Promise<LabResult> {
    const response = await apiClient.post<LabResult>(`/api/lab/results/${resultId}/verify/`, {
      approved,
      comments: comments || '',
    });
    return parseResponse(LabResultSchema, response.data, { context: 'laboratoryApi.verifyResult' });
  },

  /**
   * Upload external result attachment.
   */
  async listResultAttachments(resultId: number): Promise<Array<{ id: number; file: string; file_name: string; uploaded_at?: string }>> {
    const response = await apiClient.get<Array<{ id: number; file: string; file_name: string; uploaded_at?: string }>>(
      `/api/lab/results/${resultId}/attachments/`
    );
    return parseResponse(LabResultAttachmentArraySchema, response.data, { context: 'laboratoryApi.listResultAttachments' });
  },

  async uploadResultAttachment(resultId: number, file: File): Promise<LabResult> {
    const formData = new FormData();
    formData.append('attachment', file);
    // Prefer the plural endpoint (matches backend patterns and our E2E mocks),
    // and fall back to the singular endpoint for backward compatibility.
    try {
      const response = await apiClient.post<LabResult>(
        `/api/lab/results/${resultId}/attachments/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return parseResponse(LabResultSchema, response.data, { context: 'laboratoryApi.uploadResultAttachment' });
    } catch {
      const response = await apiClient.post<LabResult>(
        `/api/lab/results/${resultId}/attachment/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return parseResponse(LabResultSchema, response.data, { context: 'laboratoryApi.uploadResultAttachment.fallback' });
    }
  },

  /**
   * Get results pending verification.
   */
  async getPendingVerification(): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>('/api/lab/results/pending-verification/');
    return parseResponse(z.array(LabResultSchema), response.data, { context: 'laboratoryApi.getPendingVerification' });
  },

  // ============ Lab Queue ============

  /**
   * Get lab queue entries.
   */
  async getQueue(status?: string): Promise<LabQueue[]> {
    const params: Record<string, string> = {};
    if (status) {
      params.queue_status = status;
    }
    const response = await apiClient.get<LabQueue[] | { results: LabQueue[] }>('/api/lab/queue/', { params });
    // Handle both paginated and non-paginated responses
    if (Array.isArray(response.data)) {
      return parseResponse(z.array(LabQueueSchema), response.data, { context: 'laboratoryApi.getQueue' });
    }
    return parseResponse(z.array(LabQueueSchema), response.data.results || [], { context: 'laboratoryApi.getQueue' });
  },

  /**
   * Collect sample for queue entry.
   */
  async collectSample(queueNumber: string, sampleId?: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/collect/`, {
      sample_id: sampleId || '',
    });
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.collectSample' });
  },

  /**
   * Assign queue entry to technician.
   */
  async assignQueueEntry(queueNumber: string, technicianId: number | null): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/assign/`, {
      technician_id: technicianId,
    });
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.assignQueueEntry' });
  },

  /**
   * Start processing queue entry.
   */
  async startProcessing(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/start-processing/`);
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.startProcessing' });
  },

  /**
   * Submit results for review.
   */
  async submitForReview(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/submit-review/`);
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.submitForReview' });
  },

  /**
   * Release results after review.
   */
  async releaseResults(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/release/`);
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.releaseResults' });
  },

  /**
   * Reject sample with reason.
   */
  async rejectSample(queueNumber: string, reason: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/reject/`, {
      reason,
    });
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.rejectSample' });
  },

  /**
   * Add or update technician notes.
   */
  async updateNotes(queueNumber: string, notes: string, append?: boolean): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/notes/`, {
      notes,
      append: append ?? false,
    });
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.updateNotes' });
  },

  /**
   * Lookup queue entry by barcode (sample_id or queue_number).
   */
  async lookupByBarcode(barcode: string): Promise<LabQueue> {
    const response = await apiClient.get<LabQueue>('/api/lab/queue/lookup/', {
      params: { barcode },
    });
    return parseResponse(LabQueueSchema, response.data, { context: 'laboratoryApi.lookupByBarcode' });
  },

  /**
   * Get available lab technicians.
   */
  async getTechnicians(): Promise<Array<{ id: number; username: string; full_name: string }>> {
    const response = await apiClient.get('/api/lab/queue/technicians/');
    return parseResponse(LabTechnicianArraySchema, response.data, { context: 'laboratoryApi.getTechnicians' });
  },

  /**
   * Get queue statistics.
   */
  async getQueueStats(): Promise<{
    pending: number;
    collected: number;
    processing: number;
    review: number;
    released: number;
  }> {
    const response = await apiClient.get('/api/lab/queue/stats/');
    return parseResponse(LabQueueStatsSchema, response.data, { context: 'laboratoryApi.getQueueStats' });
  },
};
