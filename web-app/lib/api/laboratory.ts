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
  Specimen,
  ResultValidation,
  ResultValidationCreateData,
  Instrument,
  AnalyzerRun,
  DiagnosticReport,
  DiagnosticReportCreateData,
  DiagnosticReportStatus,
  TurnaroundTimeReport,
  WorkloadReport,
  CriticalValuesReport,
  SampleRejectionReport,
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
  SpecimenSchema,
  ResultValidationSchema,
  InstrumentSchema,
  AnalyzerRunSchema,
  DiagnosticReportSchema,
  TurnaroundTimeReportSchema,
  WorkloadReportSchema,
  CriticalValuesReportSchema,
  SampleRejectionReportSchema,
  SpecimenArraySchema,
  ResultValidationArraySchema,
  InstrumentArraySchema,
  AnalyzerRunArraySchema,
  DiagnosticReportArraySchema,
} from '@/lib/schemas/laboratory.schema';

export const laboratoryApi = {
  // ============ Test Catalog ============

  /**
   * Get paginated list of lab tests.
   */
  async listTests(params?: TestCatalogListParams): Promise<PaginatedResponse<TestCatalogListItem>> {
    const response = await apiClient.get<PaginatedResponse<TestCatalogListItem>>(
      '/api/lab/tests/',
      {
        params,
      }
    );
    return parseResponse(PaginatedLabTestCatalogSchema, response.data, {
      context: 'laboratoryApi.listTests',
    });
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
    const response = await apiClient.get<PaginatedResponse<TestCatalogListItem>>(
      '/api/lab/tests/',
      {
        params: { search: query, is_active: true },
      }
    );
    const validated = parseResponse(PaginatedLabTestCatalogSchema, response.data, {
      context: 'laboratoryApi.searchTests',
    });
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
    return parseResponse(PaginatedLabOrderSchema, response.data, {
      context: 'laboratoryApi.listOrders',
    });
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
    const response = await apiClient.get<{ results: LabOrder[] } | LabOrder[]>(
      `/api/patients/${patientId}/lab-orders/`
    );
    // Handle both paginated and non-paginated responses
    if (Array.isArray(response.data)) {
      return parseResponse(z.array(LabOrderSchema), response.data, {
        context: 'laboratoryApi.getPatientOrders',
      });
    }
    return parseResponse(z.array(LabOrderSchema), response.data.results || [], {
      context: 'laboratoryApi.getPatientOrders',
    });
  },

  /**
   * Get lab orders for a specific encounter.
   */
  async getEncounterOrders(encounterId: number): Promise<LabOrder[]> {
    const response = await apiClient.get<{ results: LabOrder[] } | LabOrder[]>(
      `/api/encounters/${encounterId}/lab-orders/`
    );
    // Handle both paginated and non-paginated responses
    if (Array.isArray(response.data)) {
      return parseResponse(z.array(LabOrderSchema), response.data, {
        context: 'laboratoryApi.getEncounterOrders',
      });
    }
    return parseResponse(z.array(LabOrderSchema), response.data.results || [], {
      context: 'laboratoryApi.getEncounterOrders',
    });
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
    return parseResponse(LabOrderSchema, response.data, {
      context: 'laboratoryApi.collectSpecimen',
    });
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
    const response = await apiClient.post<LabOrderItem>(`/api/lab/orders/${orderNumber}/items/`, {
      test: testId,
      special_instructions: specialInstructions,
    });
    return parseResponse(LabOrderItemSchema, response.data, {
      context: 'laboratoryApi.addOrderItem',
    });
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
    const response = await apiClient.get<CriticalAlert[]>(`/api/lab/orders/${orderNumber}/alerts/`);
    return parseResponse(CriticalAlertArraySchema, response.data, {
      context: 'laboratoryApi.getCriticalAlerts',
    });
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
    const response = await apiClient.get<LabResult[]>(`/api/lab/orders/${orderNumber}/results/`);
    return parseResponse(z.array(LabResultSchema), response.data, {
      context: 'laboratoryApi.getOrderResults',
    });
  },

  /**
   * Get results for a patient.
   */
  async getPatientResults(patientId: number): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>(`/api/patients/${patientId}/lab-results/`);
    return parseResponse(z.array(LabResultSchema), response.data, {
      context: 'laboratoryApi.getPatientResults',
    });
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
  async verifyResult(
    resultId: number,
    approved: boolean = true,
    comments?: string
  ): Promise<LabResult> {
    const response = await apiClient.post<LabResult>(`/api/lab/results/${resultId}/verify/`, {
      approved,
      comments: comments || '',
    });
    return parseResponse(LabResultSchema, response.data, { context: 'laboratoryApi.verifyResult' });
  },

  /**
   * Upload external result attachment.
   */
  async listResultAttachments(
    resultId: number
  ): Promise<Array<{ id: number; file: string; file_name: string; uploaded_at?: string }>> {
    const response = await apiClient.get<
      Array<{ id: number; file: string; file_name: string; uploaded_at?: string }>
    >(`/api/lab/results/${resultId}/attachments/`);
    return parseResponse(LabResultAttachmentArraySchema, response.data, {
      context: 'laboratoryApi.listResultAttachments',
    });
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
      return parseResponse(LabResultSchema, response.data, {
        context: 'laboratoryApi.uploadResultAttachment',
      });
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
      return parseResponse(LabResultSchema, response.data, {
        context: 'laboratoryApi.uploadResultAttachment.fallback',
      });
    }
  },

  /**
   * Get results pending verification.
   */
  async getPendingVerification(): Promise<LabResult[]> {
    const response = await apiClient.get<LabResult[]>('/api/lab/results/pending-verification/');
    return parseResponse(z.array(LabResultSchema), response.data, {
      context: 'laboratoryApi.getPendingVerification',
    });
  },

  // ============ Specimens ============

  /**
   * Get a specimen by barcode.
   */
  async getSpecimen(barcode: string): Promise<Specimen> {
    const response = await apiClient.get<Specimen>(`/api/lab/specimens/${barcode}/`);
    return parseResponse(SpecimenSchema, response.data, { context: 'laboratoryApi.getSpecimen' });
  },

  /**
   * List specimens for a lab order.
   */
  async listOrderSpecimens(orderNumber: string): Promise<Specimen[]> {
    const response = await apiClient.get<Specimen[]>(`/api/lab/orders/${orderNumber}/specimens/`);
    return parseResponse(SpecimenArraySchema, response.data, {
      context: 'laboratoryApi.listOrderSpecimens',
    });
  },

  // ============ Result Validations (Two-Stage) ============

  /**
   * Get validation history for a result.
   */
  async getResultValidations(resultId: number): Promise<ResultValidation[]> {
    const response = await apiClient.get<ResultValidation[]>(
      `/api/lab/results/${resultId}/validations/`
    );
    return parseResponse(ResultValidationArraySchema, response.data, {
      context: 'laboratoryApi.getResultValidations',
    });
  },

  /**
   * Add a validation record for a result.
   */
  async createResultValidation(
    resultId: number,
    data: ResultValidationCreateData
  ): Promise<ResultValidation> {
    const response = await apiClient.post<ResultValidation>(
      `/api/lab/results/${resultId}/validate/`,
      data
    );
    return parseResponse(ResultValidationSchema, response.data, {
      context: 'laboratoryApi.createResultValidation',
    });
  },

  // ============ Instruments ============

  /**
   * List instruments (optionally filtered).
   */
  async listInstruments(params?: { is_active?: boolean; search?: string }): Promise<Instrument[]> {
    const response = await apiClient.get<Instrument[] | { results: Instrument[] }>(
      '/api/lab/instruments/',
      { params }
    );
    if (Array.isArray(response.data)) {
      return parseResponse(InstrumentArraySchema, response.data, {
        context: 'laboratoryApi.listInstruments',
      });
    }
    return parseResponse(InstrumentArraySchema, response.data.results || [], {
      context: 'laboratoryApi.listInstruments',
    });
  },

  /**
   * Get a single instrument.
   */
  async getInstrument(id: number): Promise<Instrument> {
    const response = await apiClient.get<Instrument>(`/api/lab/instruments/${id}/`);
    return parseResponse(InstrumentSchema, response.data, {
      context: 'laboratoryApi.getInstrument',
    });
  },

  /**
   * Create a new instrument.
   */
  async createInstrument(data: Partial<Instrument>): Promise<Instrument> {
    const response = await apiClient.post<Instrument>('/api/lab/instruments/', data);
    return parseResponse(InstrumentSchema, response.data, {
      context: 'laboratoryApi.createInstrument',
    });
  },

  /**
   * Update an instrument.
   */
  async updateInstrument(id: number, data: Partial<Instrument>): Promise<Instrument> {
    const response = await apiClient.patch<Instrument>(`/api/lab/instruments/${id}/`, data);
    return parseResponse(InstrumentSchema, response.data, {
      context: 'laboratoryApi.updateInstrument',
    });
  },

  // ============ Analyzer Runs ============

  /**
   * List analyzer runs, optionally filtered by specimen.
   */
  async listAnalyzerRuns(specimenId?: number): Promise<AnalyzerRun[]> {
    const params = specimenId ? { specimen: specimenId } : undefined;
    const response = await apiClient.get<AnalyzerRun[] | { results: AnalyzerRun[] }>(
      '/api/lab/analyzer-runs/',
      { params }
    );
    if (Array.isArray(response.data)) {
      return parseResponse(AnalyzerRunArraySchema, response.data, {
        context: 'laboratoryApi.listAnalyzerRuns',
      });
    }
    return parseResponse(AnalyzerRunArraySchema, response.data.results || [], {
      context: 'laboratoryApi.listAnalyzerRuns',
    });
  },

  /**
   * Get a single analyzer run.
   */
  async getAnalyzerRun(id: number): Promise<AnalyzerRun> {
    const response = await apiClient.get<AnalyzerRun>(`/api/lab/analyzer-runs/${id}/`);
    return parseResponse(AnalyzerRunSchema, response.data, {
      context: 'laboratoryApi.getAnalyzerRun',
    });
  },

  /**
   * Mark an analyzer run as failed.
   */
  async markAnalyzerRunError(id: number, errorMessage: string): Promise<AnalyzerRun> {
    const response = await apiClient.post<AnalyzerRun>(`/api/lab/analyzer-runs/${id}/mark_error/`, {
      error_message: errorMessage,
    });
    return parseResponse(AnalyzerRunSchema, response.data, {
      context: 'laboratoryApi.markAnalyzerRunError',
    });
  },

  // ============ Diagnostic Reports ============

  /**
   * List diagnostic reports (optionally filtered).
   */
  async listDiagnosticReports(params?: {
    lab_order?: number;
    status?: DiagnosticReportStatus;
  }): Promise<DiagnosticReport[]> {
    const response = await apiClient.get<DiagnosticReport[] | { results: DiagnosticReport[] }>(
      '/api/lab/diagnostic-reports/',
      { params }
    );
    if (Array.isArray(response.data)) {
      return parseResponse(DiagnosticReportArraySchema, response.data, {
        context: 'laboratoryApi.listDiagnosticReports',
      });
    }
    return parseResponse(DiagnosticReportArraySchema, response.data.results || [], {
      context: 'laboratoryApi.listDiagnosticReports',
    });
  },

  /**
   * Get a single diagnostic report.
   */
  async getDiagnosticReport(id: number | string): Promise<DiagnosticReport> {
    const response = await apiClient.get<DiagnosticReport>(`/api/lab/diagnostic-reports/${id}/`);
    return parseResponse(DiagnosticReportSchema, response.data, {
      context: 'laboratoryApi.getDiagnosticReport',
    });
  },

  /**
   * Create a diagnostic report.
   */
  async createDiagnosticReport(data: DiagnosticReportCreateData): Promise<DiagnosticReport> {
    const response = await apiClient.post<DiagnosticReport>('/api/lab/diagnostic-reports/', data);
    return parseResponse(DiagnosticReportSchema, response.data, {
      context: 'laboratoryApi.createDiagnosticReport',
    });
  },

  /**
   * Update a diagnostic report.
   */
  async updateDiagnosticReport(
    id: number,
    data: Partial<DiagnosticReport>
  ): Promise<DiagnosticReport> {
    const response = await apiClient.patch<DiagnosticReport>(
      `/api/lab/diagnostic-reports/${id}/`,
      data
    );
    return parseResponse(DiagnosticReportSchema, response.data, {
      context: 'laboratoryApi.updateDiagnosticReport',
    });
  },

  /**
   * Finalize a diagnostic report.
   */
  async finalizeDiagnosticReport(id: number): Promise<DiagnosticReport> {
    const response = await apiClient.post<DiagnosticReport>(
      `/api/lab/diagnostic-reports/${id}/finalize/`
    );
    return parseResponse(DiagnosticReportSchema, response.data, {
      context: 'laboratoryApi.finalizeDiagnosticReport',
    });
  },

  /**
   * Amend a diagnostic report.
   */
  async amendDiagnosticReport(id: number, conclusion: string): Promise<DiagnosticReport> {
    const response = await apiClient.post<DiagnosticReport>(
      `/api/lab/diagnostic-reports/${id}/amend/`,
      {
        conclusion,
      }
    );
    return parseResponse(DiagnosticReportSchema, response.data, {
      context: 'laboratoryApi.amendDiagnosticReport',
    });
  },

  /**
   * Cancel a diagnostic report.
   */
  async cancelDiagnosticReport(id: number, reason: string): Promise<DiagnosticReport> {
    const response = await apiClient.post<DiagnosticReport>(
      `/api/lab/diagnostic-reports/${id}/cancel/`,
      {
        reason,
      }
    );
    return parseResponse(DiagnosticReportSchema, response.data, {
      context: 'laboratoryApi.cancelDiagnosticReport',
    });
  },

  /**
   * Generate and download a diagnostic report PDF.
   */
  async downloadDiagnosticReportPdf(id: number): Promise<Blob> {
    const pdfResponse = await apiClient.post<{ pdf_url?: string | null }>(
      `/api/lab/diagnostic-reports/${id}/generate_pdf/`
    );
    const pdfData = parseResponse(
      z.object({ pdf_url: z.string().nullable().optional() }),
      pdfResponse.data,
      { context: 'laboratoryApi.downloadDiagnosticReportPdf' }
    );
    if (!pdfData.pdf_url) {
      throw new Error('Diagnostic report PDF URL was not returned.');
    }
    const fileResponse = await apiClient.get<Blob>(pdfData.pdf_url, { responseType: 'blob' });
    return fileResponse.data;
  },

  // ============ Lab Operational Reports ============

  /**
   * Get turnaround time report.
   */
  async getTurnaroundTimeReport(startDate: string, endDate: string): Promise<TurnaroundTimeReport> {
    const response = await apiClient.get<TurnaroundTimeReport>(
      '/api/lab/reports/turnaround-time/',
      {
        params: { start: startDate, end: endDate },
      }
    );
    return parseResponse(TurnaroundTimeReportSchema, response.data, {
      context: 'laboratoryApi.getTurnaroundTimeReport',
    });
  },

  /**
   * Get workload report.
   */
  async getWorkloadReport(startDate: string, endDate: string): Promise<WorkloadReport> {
    const response = await apiClient.get<WorkloadReport>('/api/lab/reports/workload/', {
      params: { start: startDate, end: endDate },
    });
    return parseResponse(WorkloadReportSchema, response.data, {
      context: 'laboratoryApi.getWorkloadReport',
    });
  },

  /**
   * Get critical values report.
   */
  async getCriticalValuesReport(startDate: string, endDate: string): Promise<CriticalValuesReport> {
    const response = await apiClient.get<CriticalValuesReport>(
      '/api/lab/reports/critical-values/',
      {
        params: { start: startDate, end: endDate },
      }
    );
    return parseResponse(CriticalValuesReportSchema, response.data, {
      context: 'laboratoryApi.getCriticalValuesReport',
    });
  },

  /**
   * Get sample rejection report.
   */
  async getSampleRejectionReport(
    startDate: string,
    endDate: string
  ): Promise<SampleRejectionReport> {
    const response = await apiClient.get<SampleRejectionReport>('/api/lab/reports/rejections/', {
      params: { start: startDate, end: endDate },
    });
    return parseResponse(SampleRejectionReportSchema, response.data, {
      context: 'laboratoryApi.getSampleRejectionReport',
    });
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
    const response = await apiClient.get<LabQueue[] | { results: LabQueue[] }>('/api/lab/queue/', {
      params,
    });
    // Handle both paginated and non-paginated responses
    if (Array.isArray(response.data)) {
      return parseResponse(z.array(LabQueueSchema), response.data, {
        context: 'laboratoryApi.getQueue',
      });
    }
    return parseResponse(z.array(LabQueueSchema), response.data.results || [], {
      context: 'laboratoryApi.getQueue',
    });
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
    return parseResponse(LabQueueSchema, response.data, {
      context: 'laboratoryApi.assignQueueEntry',
    });
  },

  /**
   * Start processing queue entry.
   */
  async startProcessing(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(
      `/api/lab/queue/${queueNumber}/start-processing/`
    );
    return parseResponse(LabQueueSchema, response.data, {
      context: 'laboratoryApi.startProcessing',
    });
  },

  /**
   * Submit results for review.
   */
  async submitForReview(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/submit-review/`);
    return parseResponse(LabQueueSchema, response.data, {
      context: 'laboratoryApi.submitForReview',
    });
  },

  /**
   * Release results after review.
   */
  async releaseResults(queueNumber: string): Promise<LabQueue> {
    const response = await apiClient.post<LabQueue>(`/api/lab/queue/${queueNumber}/release/`);
    return parseResponse(LabQueueSchema, response.data, {
      context: 'laboratoryApi.releaseResults',
    });
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
    return parseResponse(LabQueueSchema, response.data, {
      context: 'laboratoryApi.lookupByBarcode',
    });
  },

  /**
   * Get available lab technicians.
   */
  async getTechnicians(): Promise<Array<{ id: number; username: string; full_name: string }>> {
    const response = await apiClient.get('/api/lab/queue/technicians/');
    return parseResponse(LabTechnicianArraySchema, response.data, {
      context: 'laboratoryApi.getTechnicians',
    });
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
    return parseResponse(LabQueueStatsSchema, response.data, {
      context: 'laboratoryApi.getQueueStats',
    });
  },
};
