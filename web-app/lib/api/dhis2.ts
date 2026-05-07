/**
 * DHIS2 Configuration API client.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  DHIS2ConfigDetailSchema,
  DHIS2ConnectionTestResultSchema,
  PaginatedDHIS2ConfigListSchema,
} from '@/lib/schemas/dhis2.schema';
import type {
  DHIS2ConfigCreateData,
  DHIS2ConfigDetail,
  DHIS2ConfigListItem,
  DHIS2ConfigUpdateData,
  DHIS2ConnectionTestResult,
} from '@/lib/types/dhis2';

export const dhis2Api = {
  async list(params?: {
    search?: string;
  }): Promise<{ count: number; results: DHIS2ConfigListItem[] }> {
    const response = await apiClient.get('/api/dhis2-configs/', { params });
    return parseResponse(PaginatedDHIS2ConfigListSchema, response.data, {
      context: 'dhis2Api.list',
    });
  },

  async get(id: number): Promise<DHIS2ConfigDetail> {
    const response = await apiClient.get(`/api/dhis2-configs/${id}/`);
    return parseResponse(DHIS2ConfigDetailSchema, response.data, {
      context: 'dhis2Api.get',
    });
  },

  async create(data: DHIS2ConfigCreateData): Promise<DHIS2ConfigDetail> {
    const response = await apiClient.post('/api/dhis2-configs/', data);
    return parseResponse(DHIS2ConfigDetailSchema, response.data, {
      context: 'dhis2Api.create',
    });
  },

  async update(
    id: number,
    data: DHIS2ConfigUpdateData
  ): Promise<DHIS2ConfigDetail> {
    const response = await apiClient.patch(`/api/dhis2-configs/${id}/`, data);
    return parseResponse(DHIS2ConfigDetailSchema, response.data, {
      context: 'dhis2Api.update',
    });
  },

  async remove(id: number): Promise<void> {
    await apiClient.delete(`/api/dhis2-configs/${id}/`);
  },

  async testConnection(id: number): Promise<DHIS2ConnectionTestResult> {
    const response = await apiClient.post(
      `/api/dhis2-configs/${id}/test-connection/`
    );
    return parseResponse(DHIS2ConnectionTestResultSchema, response.data, {
      context: 'dhis2Api.testConnection',
    });
  },
};
