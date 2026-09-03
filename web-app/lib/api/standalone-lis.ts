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

  async acceptExternalOrder(id: number, autoCreateWalkin = true) {
    const response = await apiClient.post(`${BASE}/external-orders/${id}/accept/`, {
      auto_create_walkin: autoCreateWalkin,
    });
    return parseResponse(AcceptExternalOrderResponseSchema, response.data, {
      context: 'standaloneLisApi.acceptExternalOrder',
    });
  },

  async rejectExternalOrder(id: number, reason: string) {
    const response = await apiClient.post(`${BASE}/external-orders/${id}/reject/`, { reason });
    return parseResponse(ExternalOrderRequestSchema, response.data, {
      context: 'standaloneLisApi.rejectExternalOrder',
    });
  },
};
