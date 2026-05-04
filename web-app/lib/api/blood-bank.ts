/**
 * Blood Bank API client
 */

import { apiClient } from './client';
import type {
  BloodDonor,
  BloodDonorListItem,
  BloodDonorCreateData,
  BloodDonorListParams,
  BloodUnit,
  BloodUnitListItem,
  BloodUnitCreateData,
  BloodUnitListParams,
  BloodRequest,
  BloodRequestListItem,
  BloodRequestCreateData,
  BloodRequestListParams,
  CrossMatch,
  CrossMatchCreateData,
  BloodIssue,
  BloodIssueCreateData,
} from '@/lib/types/blood-bank';
import type { PaginatedResponse } from '@/lib/types';

function buildParams<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

export const bloodBankApi = {
  // Donors
  async listDonors(params: BloodDonorListParams = {}): Promise<PaginatedResponse<BloodDonorListItem>> {
    const response = await apiClient.get(`/api/blood-bank/donors/${buildParams(params)}`);
    return response.data;
  },

  async getDonor(id: number): Promise<BloodDonor> {
    const response = await apiClient.get(`/api/blood-bank/donors/${id}/`);
    return response.data;
  },

  async createDonor(data: BloodDonorCreateData): Promise<BloodDonor> {
    const response = await apiClient.post('/api/blood-bank/donors/', data);
    return response.data;
  },

  async updateDonor(id: number, data: Partial<BloodDonorCreateData>): Promise<BloodDonor> {
    const response = await apiClient.patch(`/api/blood-bank/donors/${id}/`, data);
    return response.data;
  },

  // Units
  async listUnits(params: BloodUnitListParams = {}): Promise<PaginatedResponse<BloodUnitListItem>> {
    const response = await apiClient.get(`/api/blood-bank/units/${buildParams(params)}`);
    return response.data;
  },

  async getUnit(id: number): Promise<BloodUnit> {
    const response = await apiClient.get(`/api/blood-bank/units/${id}/`);
    return response.data;
  },

  async createUnit(data: BloodUnitCreateData): Promise<BloodUnit> {
    const response = await apiClient.post('/api/blood-bank/units/', data);
    return response.data;
  },

  async markAvailable(id: number): Promise<BloodUnit> {
    const response = await apiClient.post(`/api/blood-bank/units/${id}/mark_available/`);
    return response.data;
  },

  async quarantine(id: number, reason: string): Promise<BloodUnit> {
    const response = await apiClient.post(`/api/blood-bank/units/${id}/quarantine/`, { reason });
    return response.data;
  },

  // Requests
  async listRequests(params: BloodRequestListParams = {}): Promise<PaginatedResponse<BloodRequestListItem>> {
    const response = await apiClient.get(`/api/blood-bank/requests/${buildParams(params)}`);
    return response.data;
  },

  async getRequest(id: number): Promise<BloodRequest> {
    const response = await apiClient.get(`/api/blood-bank/requests/${id}/`);
    return response.data;
  },

  async createRequest(data: BloodRequestCreateData): Promise<BloodRequest> {
    const response = await apiClient.post('/api/blood-bank/requests/', data);
    return response.data;
  },

  async cancelRequest(id: number, reason: string): Promise<BloodRequest> {
    const response = await apiClient.post(`/api/blood-bank/requests/${id}/cancel/`, { reason });
    return response.data;
  },

  // Cross-Match
  async listCrossMatches(requestId?: number): Promise<PaginatedResponse<CrossMatch>> {
    const params = requestId ? `?blood_request=${requestId}` : '';
    const response = await apiClient.get(`/api/blood-bank/crossmatches/${params}`);
    return response.data;
  },

  async createCrossMatch(data: CrossMatchCreateData): Promise<CrossMatch> {
    const response = await apiClient.post('/api/blood-bank/crossmatches/', data);
    return response.data;
  },

  async recordResult(id: number, result: 'COMPATIBLE' | 'INCOMPATIBLE'): Promise<CrossMatch> {
    const response = await apiClient.post(`/api/blood-bank/crossmatches/${id}/record_result/`, { result });
    return response.data;
  },

  // Issues
  async listIssues(): Promise<PaginatedResponse<BloodIssue>> {
    const response = await apiClient.get('/api/blood-bank/issues/');
    return response.data;
  },

  async createIssue(data: BloodIssueCreateData): Promise<BloodIssue> {
    const response = await apiClient.post('/api/blood-bank/issues/', data);
    return response.data;
  },

  async completeTransfusion(id: number, reaction: string, details: string): Promise<BloodIssue> {
    const response = await apiClient.post(`/api/blood-bank/issues/${id}/complete-transfusion/`, {
      reaction,
      details,
    });
    return response.data;
  },
};
