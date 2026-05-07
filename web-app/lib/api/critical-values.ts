/**
 * Critical Value Notification API client.
 * Phase L6.2
 */

import { apiClient } from './client';
import type {
  CriticalValueRange,
  CriticalValueRangeCreateData,
  CriticalValueNotification,
  CriticalNotifyData,
  CriticalReadBackData,
  CriticalEscalateData,
  CriticalValueCompliance,
} from '@/lib/types/critical-values';
import { parseResponse } from '@/lib/schemas/validation';
import {
  CriticalValueRangeSchema,
  PaginatedCriticalValueRangeSchema,
  CriticalValueNotificationSchema,
  PaginatedCriticalValueNotificationSchema,
  CriticalValueComplianceSchema,
} from '@/lib/schemas/critical-values.schema';

const BASE = '/api/lab/critical-values';

export const criticalValuesApi = {
  // ===========================================================================
  // Critical Value Ranges
  // ===========================================================================

  async listRanges(params?: { test?: number; is_active?: boolean }) {
    const response = await apiClient.get(`${BASE}/ranges/`, { params });
    return parseResponse(PaginatedCriticalValueRangeSchema, response.data, {
      context: 'criticalValuesApi.listRanges',
    });
  },

  async getRange(id: number): Promise<CriticalValueRange> {
    const response = await apiClient.get(`${BASE}/ranges/${id}/`);
    return parseResponse(CriticalValueRangeSchema, response.data, {
      context: 'criticalValuesApi.getRange',
    });
  },

  async createRange(data: CriticalValueRangeCreateData): Promise<CriticalValueRange> {
    const response = await apiClient.post(`${BASE}/ranges/`, data);
    return parseResponse(CriticalValueRangeSchema, response.data, {
      context: 'criticalValuesApi.createRange',
    });
  },

  async updateRange(id: number, data: Partial<CriticalValueRangeCreateData>): Promise<CriticalValueRange> {
    const response = await apiClient.patch(`${BASE}/ranges/${id}/`, data);
    return parseResponse(CriticalValueRangeSchema, response.data, {
      context: 'criticalValuesApi.updateRange',
    });
  },

  async deleteRange(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/ranges/${id}/`);
  },

  async seedDefaults(): Promise<{ created: number; message: string }> {
    const response = await apiClient.post(`${BASE}/ranges/seed_defaults/`);
    return response.data;
  },

  // ===========================================================================
  // Notifications
  // ===========================================================================

  async listNotifications(params?: {
    status?: string;
    severity?: string;
    date_from?: string;
    date_to?: string;
    overdue?: boolean;
  }) {
    const response = await apiClient.get(`${BASE}/notifications/`, { params });
    return parseResponse(PaginatedCriticalValueNotificationSchema, response.data, {
      context: 'criticalValuesApi.listNotifications',
    });
  },

  async getNotification(id: number): Promise<CriticalValueNotification> {
    const response = await apiClient.get(`${BASE}/notifications/${id}/`);
    return parseResponse(CriticalValueNotificationSchema, response.data, {
      context: 'criticalValuesApi.getNotification',
    });
  },

  async notify(id: number, data: CriticalNotifyData): Promise<CriticalValueNotification> {
    const response = await apiClient.post(`${BASE}/notifications/${id}/notify/`, data);
    return parseResponse(CriticalValueNotificationSchema, response.data, {
      context: 'criticalValuesApi.notify',
    });
  },

  async readBack(id: number, data: CriticalReadBackData): Promise<CriticalValueNotification> {
    const response = await apiClient.post(`${BASE}/notifications/${id}/read_back/`, data);
    return parseResponse(CriticalValueNotificationSchema, response.data, {
      context: 'criticalValuesApi.readBack',
    });
  },

  async acknowledge(id: number): Promise<CriticalValueNotification> {
    const response = await apiClient.post(`${BASE}/notifications/${id}/acknowledge/`);
    return parseResponse(CriticalValueNotificationSchema, response.data, {
      context: 'criticalValuesApi.acknowledge',
    });
  },

  async escalate(id: number, data: CriticalEscalateData): Promise<CriticalValueNotification> {
    const response = await apiClient.post(`${BASE}/notifications/${id}/escalate/`, data);
    return parseResponse(CriticalValueNotificationSchema, response.data, {
      context: 'criticalValuesApi.escalate',
    });
  },

  async getCompliance(params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<CriticalValueCompliance> {
    const response = await apiClient.get(`${BASE}/notifications/compliance/`, { params });
    return parseResponse(CriticalValueComplianceSchema, response.data, {
      context: 'criticalValuesApi.getCompliance',
    });
  },
};
