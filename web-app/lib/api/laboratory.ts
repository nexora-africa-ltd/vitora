/**
 * Laboratory API client.
 * Sprint 1.5-1.6 Track B: Lab Workflow
 */

import { apiClient } from './client';
import {
  TestCatalog,
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

export const laboratoryApi = {
  // ============ Test Catalog ============

  /**
   * Get paginated list of lab tests.
   */
  async listTests(params?: TestCatalogListParams): Promise<PaginatedResponse<TestCatalog>> {
    const response = await apiClient.get<PaginatedResponse<TestCatalog>>('/api/lab/tests/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single test by code.
   */
  async getTest(code: string): Promise<TestCatalog> {
    const response = await apiClient.get<TestCatalog>(`/api/lab/tests/${code}/`);
    return response.data;
  },

  /**
   * Search tests by name or code.
   */
  async searchTests(query: string): Promise<TestCatalog[]> {
    const response = await apiClient.get<TestCatalog[]>('/api/lab/tests/search/', {
      params: { q: query },
    });
    return response.data;
  },

  // ============ Lab Orders ============

  /**
   * Get paginated list of lab orders.
   */
  async listOrders(params?: LabOrderListParams): Promise<PaginatedResponse<LabOrder>> {
    const response = await apiClient.get<PaginatedResponse<LabOrder>>('/api/lab/orders/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single lab order by order number.
   */
  async getOrder(orderNumber: string): Promise<LabOrder> {
    const response = await apiClient.get<LabOrder>(`/api/lab/orders/${orderNumber}/`);
    return response.data;
  },

  /**
   * Get lab orders for a specific patient.
   */
  async getPatientOrders(patientId: number): Promise<LabOrder[]> {
    const response = await apiClient.get<LabOrder[]>(`/api/patients/${patientId}/lab-orders/`);
    return response.data;
  },

  /**
   * Get lab orders for a specific encounter.
   */
  async getEncounterOrders(encounterId: number): Promise<LabOrder[]> {
    const response = await apiClient.get<{ results: LabOrder[] } | LabOrder[]>(`/api/encounters/${encounterId}/lab-orders/`);
    // Handle both paginated and non-paginated responses
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data.results || [];
  },

  /**
   * Create a new lab order.
   */
  async createOrder(data: LabOrderCreateData): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>('/api/lab/orders/', data);
    return response.data;
  },

  /**
   * Update a lab order.
   */
  async updateOrder(orderNumber: string, data: Partial<LabOrder>): Promise<LabOrder> {
    const response = await apiClient.patch<LabOrder>(`/api/lab/orders/${orderNumber}/`, data);
    return response.data;
  },

  /**
   * Submit an order for processing.
   */
  async submitOrder(orderNumber: string): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>(`/api/lab/orders/${orderNumber}/submit/`);
    return response.data;
  },

  /**
   * Mark specimen as collected.
   */
  async collectSpecimen(orderNumber: string, sampleId?: string): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>(
      `/api/lab/orders/${orderNumber}/collect-specimen/`,
      { sample_id: sampleId }
    );
    return response.data;
  },

  /**
   * Cancel a lab order.
   */
  async cancelOrder(orderNumber: string, reason: string): Promise<LabOrder> {
    const response = await apiClient.post<LabOrder>(`/api/lab/orders/${orderNumber}/cancel/`, {
      reason,
    });
    return response.data;
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
    return response.data;
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
    return response.data;
  },

  // ============ Lab Results ============

  /**
   * Get results for an order.
   */
  async getOrderResults(orderNumber: string): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>(
      `/api/lab/orders/${orderNumber}/results/`
    );
    return response.data;
  },

  /**
   * Get results for a patient.
   */
  async getPatientResults(patientId: number): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>(
      `/api/patients/${patientId}/lab-results/`
    );
    return response.data;
  },

  /**
   * Add result to order item.
   */
  async addResult(orderNumber: string, data: LabResultCreateData): Promise<LabResult> {
    const response = await apiClient.post<LabResult>(
      `/api/lab/orders/${orderNumber}/results/`,
      data
    );
    return response.data;
  },

  /**
   * Update a result.
   */
  async updateResult(resultId: number, data: Partial<LabResult>): Promise<LabResult> {
    const response = await apiClient.patch<LabResult>(`/api/lab/results/${resultId}/`, data);
    return response.data;
  },

  /**
   * Verify a result.
   */
  async verifyResult(resultId: number): Promise<LabResult> {
    const response = await apiClient.post<LabResult>(`/api/lab/results/${resultId}/verify/`);
    return response.data;
  },

  /**
   * Upload external result attachment.
   */
  async uploadResultAttachment(resultId: number, file: File): Promise<LabResult> {
    const formData = new FormData();
    formData.append('attachment', file);
    const response = await apiClient.post<LabResult>(
      `/api/lab/results/${resultId}/attachment/`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Get results pending verification.
   */
  async getPendingVerification(): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>('/api/lab/results/pending-verification/');
    return response.data;
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
      return response.data;
    }
    return response.data.results || [];
  },

  /**
   * Collect sample for queue entry.
   */
  async collectSample(queueNumber: string, sampleId?: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/collect/`, {
      sample_id: sampleId || '',
    });
    return response.data;
  },

  /**
   * Assign queue entry to technician.
   */
  async assignQueueEntry(queueNumber: string, technicianId: number | null): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/assign/`, {
      technician_id: technicianId,
    });
    return response.data;
  },

  /**
   * Start processing queue entry.
   */
  async startProcessing(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/start-processing/`);
    return response.data;
  },

  /**
   * Submit results for review.
   */
  async submitForReview(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/submit-review/`);
    return response.data;
  },

  /**
   * Release results after review.
   */
  async releaseResults(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/release/`);
    return response.data;
  },

  /**
   * Reject sample with reason.
   */
  async rejectSample(queueNumber: string, reason: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/reject/`, {
      reason,
    });
    return response.data;
  },

  /**
   * Add or update technician notes.
   */
  async updateNotes(queueNumber: string, notes: string, append?: boolean): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/notes/`, {
      notes,
      append: append ?? false,
    });
    return response.data;
  },

  /**
   * Lookup queue entry by barcode (sample_id or queue_number).
   */
  async lookupByBarcode(barcode: string): Promise<LabQueue> {
    const response = await apiClient.get<LabQueue>('/api/lab/queue/lookup/', {
      params: { barcode },
    });
    return response.data;
  },

  /**
   * Get available lab technicians.
   */
  async getTechnicians(): Promise<Array<{ id: number; username: string; full_name: string }>> {
    const response = await apiClient.get('/api/lab/queue/technicians/');
    return response.data;
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
    return response.data;
  },
};
