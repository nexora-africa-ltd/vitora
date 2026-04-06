/**
 * Scheduling API Client
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedResourceListSchema,
  ResourceSchema,
} from '@/lib/schemas/scheduling.schema';
import type {
  Resource,
  ResourceCreateData,
  ResourceListParams,
  ResourceListItem,
} from '@/lib/types/scheduling';

const BASE_URL = '/api/scheduling';

export interface PaginatedResources {
  count: number;
  next: string | null;
  previous: string | null;
  results: ResourceListItem[];
}

export const resourcesApi = {
  list: async (params?: ResourceListParams): Promise<PaginatedResources> => {
    const response = await apiClient.get(`${BASE_URL}/resources/`, { params });
    return parseResponse(PaginatedResourceListSchema, response.data, {
      context: 'resourcesApi.list',
    });
  },

  get: async (id: number): Promise<Resource> => {
    const response = await apiClient.get(`${BASE_URL}/resources/${id}/`);
    return parseResponse(ResourceSchema, response.data, {
      context: 'resourcesApi.get',
    });
  },

  create: async (data: ResourceCreateData): Promise<Resource> => {
    const response = await apiClient.post(`${BASE_URL}/resources/`, data);
    return parseResponse(ResourceSchema, response.data, {
      context: 'resourcesApi.create',
    });
  },

  update: async (id: number, data: Partial<ResourceCreateData>): Promise<Resource> => {
    const response = await apiClient.patch(`${BASE_URL}/resources/${id}/`, data);
    return parseResponse(ResourceSchema, response.data, {
      context: 'resourcesApi.update',
    });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/resources/${id}/`);
  },
};
