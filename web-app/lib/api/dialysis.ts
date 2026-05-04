/**
 * Dialysis API client
 */

import { apiClient } from './client';
import type {
  VascularAccess,
  VascularAccessCreateData,
  VascularAccessListParams,
  DialysisOrder,
  DialysisOrderCreateData,
  DialysisOrderListParams,
  DialysisSession,
  DialysisSessionCreateData,
  DialysisSessionListParams,
} from '@/lib/types/dialysis';
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

export const dialysisApi = {
  // Vascular Access
  async listAccesses(params: VascularAccessListParams = {}): Promise<PaginatedResponse<VascularAccess>> {
    const response = await apiClient.get(`/api/dialysis/accesses/${buildParams(params)}`);
    return response.data;
  },

  async getAccess(id: number): Promise<VascularAccess> {
    const response = await apiClient.get(`/api/dialysis/accesses/${id}/`);
    return response.data;
  },

  async createAccess(data: VascularAccessCreateData): Promise<VascularAccess> {
    const response = await apiClient.post('/api/dialysis/accesses/', data);
    return response.data;
  },

  async updateAccess(id: number, data: Partial<VascularAccessCreateData>): Promise<VascularAccess> {
    const response = await apiClient.patch(`/api/dialysis/accesses/${id}/`, data);
    return response.data;
  },

  // Orders
  async listOrders(params: DialysisOrderListParams = {}): Promise<PaginatedResponse<DialysisOrder>> {
    const response = await apiClient.get(`/api/dialysis/orders/${buildParams(params)}`);
    return response.data;
  },

  async getOrder(id: number): Promise<DialysisOrder> {
    const response = await apiClient.get(`/api/dialysis/orders/${id}/`);
    return response.data;
  },

  async createOrder(data: DialysisOrderCreateData): Promise<DialysisOrder> {
    const response = await apiClient.post('/api/dialysis/orders/', data);
    return response.data;
  },

  async suspendOrder(id: number): Promise<DialysisOrder> {
    const response = await apiClient.post(`/api/dialysis/orders/${id}/suspend/`);
    return response.data;
  },

  async resumeOrder(id: number): Promise<DialysisOrder> {
    const response = await apiClient.post(`/api/dialysis/orders/${id}/resume/`);
    return response.data;
  },

  // Sessions
  async listSessions(params: DialysisSessionListParams = {}): Promise<PaginatedResponse<DialysisSession>> {
    const response = await apiClient.get(`/api/dialysis/sessions/${buildParams(params)}`);
    return response.data;
  },

  async getSession(id: number): Promise<DialysisSession> {
    const response = await apiClient.get(`/api/dialysis/sessions/${id}/`);
    return response.data;
  },

  async createSession(data: DialysisSessionCreateData): Promise<DialysisSession> {
    const response = await apiClient.post('/api/dialysis/sessions/', data);
    return response.data;
  },

  async startSession(id: number): Promise<DialysisSession> {
    const response = await apiClient.post(`/api/dialysis/sessions/${id}/start/`);
    return response.data;
  },

  async completeSession(id: number, postVitals?: Record<string, unknown>): Promise<DialysisSession> {
    const response = await apiClient.post(`/api/dialysis/sessions/${id}/complete/`, postVitals || {});
    return response.data;
  },

  async abortSession(id: number, reason: string): Promise<DialysisSession> {
    const response = await apiClient.post(`/api/dialysis/sessions/${id}/abort/`, { reason });
    return response.data;
  },
};
