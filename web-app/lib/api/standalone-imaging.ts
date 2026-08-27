/**
 * API client for standalone Imaging operations.
 */

import { apiClient } from './client';
import { z } from 'zod';
import { parseResponse } from '@/lib/schemas/validation';
import {
  WalkInImagingPatientSchema,
  WalkInImagingPatientListSchema,
  ExternalImagingOrderRequestSchema,
  ExternalImagingOrderListSchema,
} from '@/lib/schemas/standalone-imaging.schema';
import { ImagingOrderSchema } from '@/lib/schemas/imaging.schema';
import type {
  WalkInImagingPatient,
  WalkInImagingPatientCreateData,
  StandaloneImagingOrderCreateData,
  ExternalImagingOrderRequest,
} from '@/lib/types/standalone-imaging';

const BASE = '/api/imaging/standalone';

const AcceptExternalOrderResponseSchema = z
  .object({
    external_order: ExternalImagingOrderRequestSchema.optional(),
    walkin_patient: WalkInImagingPatientSchema.optional(),
    imaging_order: ImagingOrderSchema.optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const standaloneImagingApi = {
  // Walk-in Patients
  async listWalkInPatients(params?: { search?: string; page?: number }) {
    const response = await apiClient.get(`${BASE}/walkin-patients/`, { params });
    return parseResponse(WalkInImagingPatientListSchema, response.data, {
      context: 'standaloneImagingApi.listWalkInPatients',
    });
  },

  async getWalkInPatient(id: number): Promise<WalkInImagingPatient> {
    const response = await apiClient.get(`${BASE}/walkin-patients/${id}/`);
    return parseResponse(WalkInImagingPatientSchema, response.data, {
      context: 'standaloneImagingApi.getWalkInPatient',
    });
  },

  async createWalkInPatient(
    data: WalkInImagingPatientCreateData
  ): Promise<WalkInImagingPatient> {
    const response = await apiClient.post(`${BASE}/walkin-patients/`, data);
    return parseResponse(WalkInImagingPatientSchema, response.data, {
      context: 'standaloneImagingApi.createWalkInPatient',
    });
  },

  async updateWalkInPatient(
    id: number,
    data: Partial<WalkInImagingPatientCreateData>
  ): Promise<WalkInImagingPatient> {
    const response = await apiClient.patch(`${BASE}/walkin-patients/${id}/`, data);
    return parseResponse(WalkInImagingPatientSchema, response.data, {
      context: 'standaloneImagingApi.updateWalkInPatient',
    });
  },

  async linkWalkInToPatient(
    walkInId: number,
    patientId: number
  ): Promise<WalkInImagingPatient> {
    const response = await apiClient.post(
      `${BASE}/walkin-patients/${walkInId}/link-patient/`,
      { patient_id: patientId }
    );
    return parseResponse(WalkInImagingPatientSchema, response.data, {
      context: 'standaloneImagingApi.linkWalkInToPatient',
    });
  },

  // Standalone Order Creation
  async createStandaloneOrder(data: StandaloneImagingOrderCreateData) {
    const response = await apiClient.post(`${BASE}/orders/create/`, data);
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'standaloneImagingApi.createStandaloneOrder',
    });
  },

  // External Imaging Order Requests
  async listExternalOrders(params?: { status?: string; page?: number }) {
    const response = await apiClient.get(`${BASE}/external-orders/`, { params });
    return parseResponse(ExternalImagingOrderListSchema, response.data, {
      context: 'standaloneImagingApi.listExternalOrders',
    });
  },

  async getExternalOrder(id: number): Promise<ExternalImagingOrderRequest> {
    const response = await apiClient.get(`${BASE}/external-orders/${id}/`);
    return parseResponse(ExternalImagingOrderRequestSchema, response.data, {
      context: 'standaloneImagingApi.getExternalOrder',
    });
  },

  async acceptExternalOrder(id: number, autoCreateWalkin = true) {
    const response = await apiClient.post(`${BASE}/external-orders/${id}/accept/`, {
      auto_create_walkin: autoCreateWalkin,
    });
    return parseResponse(AcceptExternalOrderResponseSchema, response.data, {
      context: 'standaloneImagingApi.acceptExternalOrder',
    });
  },

  async rejectExternalOrder(id: number, reason: string) {
    const response = await apiClient.post(`${BASE}/external-orders/${id}/reject/`, {
      reason,
    });
    return parseResponse(ExternalImagingOrderRequestSchema, response.data, {
      context: 'standaloneImagingApi.rejectExternalOrder',
    });
  },
};
