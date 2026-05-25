/**
 * API client for standalone LIS operations.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  WalkInPatientSchema,
  WalkInPatientListSchema,
  ExternalOrderRequestSchema,
  ExternalOrderListSchema,
} from '@/lib/schemas/standalone-lis.schema';
import type {
  WalkInPatient,
  WalkInPatientCreateData,
  StandaloneOrderCreateData,
  ExternalOrderRequest,
} from '@/lib/types/standalone-lis';
import type { LabOrder } from '@/lib/types/laboratory';

const BASE = '/api/lab/standalone';

export const standaloneLisApi = {
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

  async updateWalkInPatient(id: number, data: Partial<WalkInPatientCreateData>): Promise<WalkInPatient> {
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
    return response.data;
  },

  // Standalone Orders
  async createStandaloneOrder(data: StandaloneOrderCreateData): Promise<LabOrder> {
    const response = await apiClient.post(`${BASE}/orders/create/`, data);
    return response.data;
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
    return response.data;
  },

  async rejectExternalOrder(id: number, reason: string) {
    const response = await apiClient.post(`${BASE}/external-orders/${id}/reject/`, { reason });
    return parseResponse(ExternalOrderRequestSchema, response.data, {
      context: 'standaloneLisApi.rejectExternalOrder',
    });
  },
};
