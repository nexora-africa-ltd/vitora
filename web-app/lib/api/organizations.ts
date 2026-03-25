import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  OrganizationDetailSchema,
  PaginatedOrganizationListSchema,
} from '@/lib/schemas/organization.schema';
import { PaginatedFacilityListSchema } from '@/lib/schemas/facility.schema';
import type { PaginatedResponse } from '@/lib/types';
import type { FacilityListItem } from '@/lib/types/facility';
import type {
  OrganizationCreateData,
  OrganizationDetail,
  OrganizationListItem,
  OrganizationUpdateData,
} from '@/lib/types/organization';

export const organizationsApi = {
  async list(
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<PaginatedResponse<OrganizationListItem>> {
    const response = await apiClient.get('/api/organizations/', { params });
    return parseResponse(PaginatedOrganizationListSchema, response.data, {
      context: 'organizationsApi.list',
    });
  },

  async get(id: number): Promise<OrganizationDetail> {
    const response = await apiClient.get(`/api/organizations/${id}/`);
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.get',
    });
  },

  async create(data: OrganizationCreateData): Promise<OrganizationDetail> {
    const response = await apiClient.post('/api/organizations/', data);
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.create',
    });
  },

  async update(id: number, data: OrganizationUpdateData): Promise<OrganizationDetail> {
    const response = await apiClient.patch(`/api/organizations/${id}/`, data);
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.update',
    });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/organizations/${id}/`);
  },

  async listFacilities(
    orgId: number,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<PaginatedResponse<FacilityListItem>> {
    const response = await apiClient.get(`/api/organizations/${orgId}/facilities/`, { params });
    return parseResponse(PaginatedFacilityListSchema, response.data, {
      context: 'organizationsApi.listFacilities',
    });
  },
};
