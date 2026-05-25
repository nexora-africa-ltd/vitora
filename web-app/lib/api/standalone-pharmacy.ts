/**
 * API client for standalone Pharmacy operations.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  WalkInCustomerSchema,
  WalkInCustomerListSchema,
  ExternalPrescriptionRequestSchema,
  ExternalPrescriptionListSchema,
} from '@/lib/schemas/standalone-pharmacy.schema';
import type {
  WalkInCustomer,
  WalkInCustomerCreateData,
  StandalonePrescriptionCreateData,
  ExternalPrescriptionRequest,
} from '@/lib/types/standalone-pharmacy';

const BASE = '/api/pharmacy/standalone';

export const standalonePharmacyApi = {
  // Walk-in Customers
  async listWalkInCustomers(params?: { search?: string; page?: number }) {
    const response = await apiClient.get(`${BASE}/walkin-customers/`, { params });
    return parseResponse(WalkInCustomerListSchema, response.data, {
      context: 'standalonePharmacyApi.listWalkInCustomers',
    });
  },

  async getWalkInCustomer(id: number): Promise<WalkInCustomer> {
    const response = await apiClient.get(`${BASE}/walkin-customers/${id}/`);
    return parseResponse(WalkInCustomerSchema, response.data, {
      context: 'standalonePharmacyApi.getWalkInCustomer',
    });
  },

  async createWalkInCustomer(data: WalkInCustomerCreateData): Promise<WalkInCustomer> {
    const response = await apiClient.post(`${BASE}/walkin-customers/`, data);
    return parseResponse(WalkInCustomerSchema, response.data, {
      context: 'standalonePharmacyApi.createWalkInCustomer',
    });
  },

  async updateWalkInCustomer(
    id: number,
    data: Partial<WalkInCustomerCreateData>
  ): Promise<WalkInCustomer> {
    const response = await apiClient.patch(`${BASE}/walkin-customers/${id}/`, data);
    return parseResponse(WalkInCustomerSchema, response.data, {
      context: 'standalonePharmacyApi.updateWalkInCustomer',
    });
  },

  async linkWalkInToPatient(walkInId: number, patientId: number): Promise<WalkInCustomer> {
    const response = await apiClient.post(
      `${BASE}/walkin-customers/${walkInId}/link-patient/`,
      { patient_id: patientId }
    );
    return parseResponse(WalkInCustomerSchema, response.data, {
      context: 'standalonePharmacyApi.linkWalkInToPatient',
    });
  },

  // Standalone Prescription Creation
  async createStandalonePrescription(data: StandalonePrescriptionCreateData) {
    const response = await apiClient.post(`${BASE}/prescriptions/create/`, data);
    return response.data;
  },

  // External Prescription Requests
  async listExternalPrescriptions(params?: { status?: string; page?: number }) {
    const response = await apiClient.get(`${BASE}/external-prescriptions/`, { params });
    return parseResponse(ExternalPrescriptionListSchema, response.data, {
      context: 'standalonePharmacyApi.listExternalPrescriptions',
    });
  },

  async getExternalPrescription(id: number): Promise<ExternalPrescriptionRequest> {
    const response = await apiClient.get(`${BASE}/external-prescriptions/${id}/`);
    return parseResponse(ExternalPrescriptionRequestSchema, response.data, {
      context: 'standalonePharmacyApi.getExternalPrescription',
    });
  },

  async acceptExternalPrescription(id: number, autoCreateWalkin = true) {
    const response = await apiClient.post(
      `${BASE}/external-prescriptions/${id}/accept/`,
      { auto_create_walkin: autoCreateWalkin }
    );
    return response.data;
  },

  async rejectExternalPrescription(id: number, reason: string) {
    const response = await apiClient.post(
      `${BASE}/external-prescriptions/${id}/reject/`,
      { reason }
    );
    return parseResponse(ExternalPrescriptionRequestSchema, response.data, {
      context: 'standalonePharmacyApi.rejectExternalPrescription',
    });
  },
};
