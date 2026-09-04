/**
 * API client for standalone LIS operations.
 */

import { apiClient } from './client';
import { z } from 'zod';
import { parseResponse } from '@/lib/schemas/validation';
import {
  WalkInPatientSchema,
  WalkInPatientListSchema,
  ExternalOrderRequestSchema,
  ExternalOrderListSchema,
  LISOnboardingStatusSchema,
  LISOnboardingSeedResultSchema,
  LISOnboardingImportResultSchema,
  LISOnboardingWorkflowImportResultSchema,
  LISOnboardingAnalyzerImportResultSchema,
  LISOnboardingReferenceRangeImportResultSchema,
  InboundIngestionEventListSchema,
  CrosswalkEntryListSchema,
  ResultDeliveryLogListSchema,
  InboundIngestResponseSchema,
  ResultDeliveryLogSchema,
  MessageMappingConfigListSchema,
  MessageMappingConfigSchema,
  MessageMappingValidationResultSchema,
  StandaloneBillingInvoiceListSchema,
  StandaloneBillingReconciliationSchema,
} from '@/lib/schemas/standalone-lis.schema';
import { LabOrderSchema } from '@/lib/schemas/laboratory.schema';
import type {
  WalkInPatient,
  WalkInPatientCreateData,
  StandaloneOrderCreateData,
  ExternalOrderRequest,
  LISOnboardingStatus,
  LISOnboardingSeedResult,
  LISOnboardingImportResult,
  LISOnboardingWorkflowImportResult,
  LISOnboardingAnalyzerImportResult,
  LISOnboardingReferenceRangeImportResult,
  InboundIngestionEvent,
  CrosswalkEntry,
  ResultDeliveryLog,
  InboundIngestResponse,
  MessageMappingConfig,
  MessageMappingValidationResult,
  StandaloneBillingInvoice,
  StandaloneBillingReconciliation,
} from '@/lib/types/standalone-lis';
import type { LabOrder } from '@/lib/types/laboratory';

const BASE = '/api/lab/standalone';

const PromoteWalkInResponseSchema = z.object({
  walkin: WalkInPatientSchema,
  patient_id: z.number(),
  mrn: z.string(),
});

const AcceptExternalOrderResponseSchema = z
  .object({
    external_order: ExternalOrderRequestSchema.optional(),
    walkin_patient: WalkInPatientSchema.optional(),
    lab_order: LabOrderSchema.optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const standaloneLisApi = {
  async getOnboardingStatus(): Promise<LISOnboardingStatus> {
    const response = await apiClient.get(`${BASE}/onboarding/status/`);
    return parseResponse(LISOnboardingStatusSchema, response.data, {
      context: 'standaloneLisApi.getOnboardingStatus',
    });
  },

  async completeOnboarding(): Promise<LISOnboardingStatus> {
    const response = await apiClient.post(`${BASE}/onboarding/status/`, {});
    return parseResponse(LISOnboardingStatusSchema, response.data, {
      context: 'standaloneLisApi.completeOnboarding',
    });
  },

  async seedOnboardingDefaults(
    archetype: 'small' | 'medium' | 'reference'
  ): Promise<LISOnboardingSeedResult> {
    const response = await apiClient.post(`${BASE}/onboarding/seed-defaults/`, { archetype });
    return parseResponse(LISOnboardingSeedResultSchema, response.data, {
      context: 'standaloneLisApi.seedOnboardingDefaults',
    });
  },

  async downloadTemplate(templateName: 'test-catalog' | 'specimen-workflow' | 'analyzer-channel' | 'reference-ranges'): Promise<string> {
    const response = await apiClient.get(`${BASE}/onboarding/templates/${templateName}/`, {
      responseType: 'text',
    });
    return String(response.data ?? '');
  },

  async importTestCatalog(file: File): Promise<LISOnboardingImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`${BASE}/onboarding/import/test-catalog/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return parseResponse(LISOnboardingImportResultSchema, response.data, {
      context: 'standaloneLisApi.importTestCatalog',
    });
  },

  async importSpecimenWorkflow(file: File): Promise<LISOnboardingWorkflowImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`${BASE}/onboarding/import/specimen-workflow/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return parseResponse(LISOnboardingWorkflowImportResultSchema, response.data, {
      context: 'standaloneLisApi.importSpecimenWorkflow',
    });
  },

  async importAnalyzerChannel(file: File): Promise<LISOnboardingAnalyzerImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`${BASE}/onboarding/import/analyzer-channel/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return parseResponse(LISOnboardingAnalyzerImportResultSchema, response.data, {
      context: 'standaloneLisApi.importAnalyzerChannel',
    });
  },

  async importReferenceRanges(file: File): Promise<LISOnboardingReferenceRangeImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(
      `${BASE}/onboarding/import/reference-ranges/`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return parseResponse(LISOnboardingReferenceRangeImportResultSchema, response.data, {
      context: 'standaloneLisApi.importReferenceRanges',
    });
  },

  // Walk-in Patients
  async listWalkInPatients(params?: { search?: string; page?: number }) {
    const response = await apiClient.get(`${BASE}/walkin-patients/`, { params });
    return parseResponse(WalkInPatientListSchema, response.data, {
      context: 'standaloneLisApi.listWalkInPatients',
    });
  },

  async getWalkInPatient(id: number): Promise<WalkInPatient> {
    const response = await apiClient.get(`${BASE}/walkin-patients/${id}/`);
    return parseResponse(WalkInPatientSchema, response.data, {
      context: 'standaloneLisApi.getWalkInPatient',
    });
  },

  async createWalkInPatient(data: WalkInPatientCreateData): Promise<WalkInPatient> {
    const response = await apiClient.post(`${BASE}/walkin-patients/`, data);
    return parseResponse(WalkInPatientSchema, response.data, {
      context: 'standaloneLisApi.createWalkInPatient',
    });
  },

  async updateWalkInPatient(
    id: number,
    data: Partial<WalkInPatientCreateData>
  ): Promise<WalkInPatient> {
    const response = await apiClient.patch(`${BASE}/walkin-patients/${id}/`, data);
    return parseResponse(WalkInPatientSchema, response.data, {
      context: 'standaloneLisApi.updateWalkInPatient',
    });
  },

  async linkWalkInToPatient(walkInId: number, patientId: number): Promise<WalkInPatient> {
    const response = await apiClient.post(`${BASE}/walkin-patients/${walkInId}/link-patient/`, {
      patient_id: patientId,
    });
    return parseResponse(WalkInPatientSchema, response.data, {
      context: 'standaloneLisApi.linkWalkInToPatient',
    });
  },

  async promoteWalkInToPatient(
    walkInId: number,
    data?: {
      county?: number;
      sub_county?: number;
      ward?: number;
      date_of_birth?: string;
      identification_type?: string;
      title?: string;
      middle_name?: string;
      phone_number?: string;
      email?: string;
      village?: string;
    }
  ): Promise<{ walkin: WalkInPatient; patient_id: number; mrn: string }> {
    const response = await apiClient.post(
      `${BASE}/walkin-patients/${walkInId}/promote/`,
      data ?? {}
    );
    return parseResponse(PromoteWalkInResponseSchema, response.data, {
      context: 'standaloneLisApi.promoteWalkInToPatient',
    });
  },

  // Standalone Orders
  async createStandaloneOrder(data: StandaloneOrderCreateData): Promise<LabOrder> {
    const response = await apiClient.post(`${BASE}/orders/create/`, data);
    return parseResponse(LabOrderSchema, response.data, {
      context: 'standaloneLisApi.createStandaloneOrder',
    });
  },

  // External Order Requests
  async listExternalOrders(params?: { status?: string; page?: number }) {
    const response = await apiClient.get(`${BASE}/external-orders/`, { params });
    return parseResponse(ExternalOrderListSchema, response.data, {
      context: 'standaloneLisApi.listExternalOrders',
    });
  },

  async getExternalOrder(id: number): Promise<ExternalOrderRequest> {
    const response = await apiClient.get(`${BASE}/external-orders/${id}/`);
    return parseResponse(ExternalOrderRequestSchema, response.data, {
      context: 'standaloneLisApi.getExternalOrder',
    });
  },

  async acceptExternalOrder(
    id: number,
    options?: {
      auto_create_walkin?: boolean;
      enable_billing?: boolean;
      payer_type?: 'cash' | 'sha' | 'private_insurance' | 'corporate' | 'mixed';
      diagnostic_package?: '' | 'BASIC' | 'COMPREHENSIVE' | 'EMPLOYMENT' | 'REFERRAL';
    }
  ) {
    const response = await apiClient.post(`${BASE}/external-orders/${id}/accept/`, {
      auto_create_walkin: options?.auto_create_walkin ?? true,
      enable_billing: options?.enable_billing ?? true,
      payer_type: options?.payer_type ?? 'cash',
      diagnostic_package: options?.diagnostic_package ?? '',
    });
    return parseResponse(AcceptExternalOrderResponseSchema, response.data, {
      context: 'standaloneLisApi.acceptExternalOrder',
    });
  },

  async getBillingReconciliation(): Promise<StandaloneBillingReconciliation> {
    const response = await apiClient.get(`${BASE}/billing/reconciliation/`);
    return parseResponse(StandaloneBillingReconciliationSchema, response.data, {
      context: 'standaloneLisApi.getBillingReconciliation',
    });
  },

  async listBillingInvoices(): Promise<StandaloneBillingInvoice[]> {
    const response = await apiClient.get(`${BASE}/billing/invoices/`);
    return parseResponse(StandaloneBillingInvoiceListSchema, response.data, {
      context: 'standaloneLisApi.listBillingInvoices',
    });
  },

  async downloadInvoicePdf(invoiceId: number): Promise<Blob> {
    const response = await apiClient.get(`${BASE}/billing/invoices/${invoiceId}/pdf/`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  async downloadPaymentReceiptPdf(paymentId: number): Promise<Blob> {
    const response = await apiClient.get(`${BASE}/billing/payments/${paymentId}/receipt-pdf/`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  async rejectExternalOrder(id: number, reason: string) {
    const response = await apiClient.post(`${BASE}/external-orders/${id}/reject/`, { reason });
    return parseResponse(ExternalOrderRequestSchema, response.data, {
      context: 'standaloneLisApi.rejectExternalOrder',
    });
  },

  async ingestInboundOrder(
    data:
      | { source_system: string; channel?: 'API' | 'HL7'; message_format: 'HL7'; hl7_message: string }
      | { source_system: string; channel?: 'API' | 'HL7'; message_format: 'JSON'; payload: unknown },
    idempotencyKey?: string
  ): Promise<InboundIngestResponse> {
    const response = await apiClient.post(`${BASE}/interop/inbound-orders/`, data, {
      headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    });
    return parseResponse(InboundIngestResponseSchema, response.data, {
      context: 'standaloneLisApi.ingestInboundOrder',
    });
  },

  async listInboundEvents(params?: { status?: string; page?: number }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: InboundIngestionEvent[];
  }> {
    const response = await apiClient.get(`${BASE}/interop/inbound-events/`, { params });
    return parseResponse(InboundIngestionEventListSchema, response.data, {
      context: 'standaloneLisApi.listInboundEvents',
    });
  },

  async replayInboundEvent(eventId: number): Promise<unknown> {
    const response = await apiClient.post(`${BASE}/interop/inbound-events/${eventId}/replay/`, {});
    return response.data;
  },

  async listCrosswalk(params?: { page?: number }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: CrosswalkEntry[];
  }> {
    const response = await apiClient.get(`${BASE}/interop/crosswalk/`, { params });
    return parseResponse(CrosswalkEntryListSchema, response.data, {
      context: 'standaloneLisApi.listCrosswalk',
    });
  },

  async deliverResult(
    externalOrderId: number,
    data: { channel: 'WEBHOOK' | 'PDF_PACKAGE' | 'HL7_FHIR'; destination?: string }
  ): Promise<ResultDeliveryLog> {
    const response = await apiClient.post(
      `${BASE}/external-orders/${externalOrderId}/deliver-result/`,
      data
    );
    return parseResponse(ResultDeliveryLogSchema, response.data, {
      context: 'standaloneLisApi.deliverResult',
    });
  },

  async listDeliveryLogs(params?: { status?: string; channel?: string; page?: number }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: ResultDeliveryLog[];
  }> {
    const response = await apiClient.get(`${BASE}/interop/delivery-logs/`, { params });
    return parseResponse(ResultDeliveryLogListSchema, response.data, {
      context: 'standaloneLisApi.listDeliveryLogs',
    });
  },

  async downloadDeliveryPdf(deliveryLogId: number): Promise<Blob> {
    const response = await apiClient.get(`${BASE}/interop/delivery-logs/${deliveryLogId}/download-pdf/`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  async listMessageMappings(codeSystem?: string): Promise<MessageMappingConfig[]> {
    const response = await apiClient.get(`${BASE}/interop/mappings/`, {
      params: codeSystem ? { code_system: codeSystem } : undefined,
    });
    return parseResponse(MessageMappingConfigListSchema, response.data, {
      context: 'standaloneLisApi.listMessageMappings',
    });
  },

  async upsertMessageMapping(data: {
    code_system: string;
    external_code: string;
    external_display?: string;
    relationship: 'EQUIVALENT' | 'BROADER' | 'NARROWER' | 'RELATED';
    is_active?: boolean;
    notes?: string;
    test_code: string;
  }): Promise<MessageMappingConfig> {
    const response = await apiClient.post(`${BASE}/interop/mappings/`, data);
    return parseResponse(MessageMappingConfigSchema, response.data, {
      context: 'standaloneLisApi.upsertMessageMapping',
    });
  },

  async validateMessageMappings(data: {
    source_system: string;
    message_format: 'HL7' | 'JSON';
    hl7_message?: string;
    payload?: unknown;
  }): Promise<MessageMappingValidationResult> {
    const response = await apiClient.post(`${BASE}/interop/mappings/validate/`, data);
    return parseResponse(MessageMappingValidationResultSchema, response.data, {
      context: 'standaloneLisApi.validateMessageMappings',
    });
  },

  async deleteMessageMapping(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/interop/mappings/${id}/`);
  },
};
