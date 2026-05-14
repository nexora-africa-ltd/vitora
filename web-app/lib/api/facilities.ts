import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  FacilityDetailSchema,
  FacilityListItemSchema,
  PaginatedFacilityListSchema,
} from '@/lib/schemas/facility.schema';
import { z } from 'zod';
import type { UserFacility } from '@/lib/auth/context';
import type { PaginatedResponse } from '@/lib/types';
import type { FacilityCreateData, FacilityDetail, FacilityListItem, FacilityUpdateData } from '@/lib/types/facility';

const MyFacilitiesSchema = z.array(FacilityListItemSchema);

export const facilitiesApi = {
  async list(params?: Record<string, string | number | boolean | undefined>): Promise<PaginatedResponse<FacilityListItem>> {
    const response = await apiClient.get<PaginatedResponse<FacilityListItem>>('/api/facilities/', {
      params,
    });
    return parseResponse(PaginatedFacilityListSchema, response.data, {
      context: 'facilitiesApi.list',
    });
  },

  /** Facilities the current user is assigned to (primary + secondary). */
  async myFacilities(): Promise<FacilityListItem[]> {
    const response = await apiClient.get<FacilityListItem[]>('/api/facilities/my-facilities/');
    return parseResponse(MyFacilitiesSchema, response.data, {
      context: 'facilitiesApi.myFacilities',
    });
  },

  async get(id: number): Promise<FacilityDetail> {
    const response = await apiClient.get<FacilityDetail>(`/api/facilities/${id}/`);
    return parseResponse(FacilityDetailSchema, response.data, {
      context: 'facilitiesApi.get',
    });
  },

  async update(id: number, data: FacilityUpdateData): Promise<FacilityDetail> {
    const response = await apiClient.patch<FacilityDetail>(`/api/facilities/${id}/`, data);
    return parseResponse(FacilityDetailSchema, response.data, {
      context: 'facilitiesApi.update',
    });
  },

  async create(data: FacilityCreateData): Promise<FacilityDetail> {
    const response = await apiClient.post<FacilityDetail>('/api/facilities/', data);
    return parseResponse(FacilityDetailSchema, response.data, {
      context: 'facilitiesApi.create',
    });
  },

  async uploadLogo(id: number, file: File): Promise<FacilityDetail> {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await apiClient.patch<FacilityDetail>(`/api/facilities/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return parseResponse(FacilityDetailSchema, response.data, {
      context: 'facilitiesApi.uploadLogo',
    });
  },

  async removeLogo(id: number): Promise<FacilityDetail> {
    const response = await apiClient.patch<FacilityDetail>(`/api/facilities/${id}/`, { logo: null });
    return parseResponse(FacilityDetailSchema, response.data, {
      context: 'facilitiesApi.removeLogo',
    });
  },

  /** Fetch and cache DHA registry data for this facility. */
  async syncDhaRegistry(id: number): Promise<FacilityDetail> {
    const response = await apiClient.post<FacilityDetail>(`/api/facilities/${id}/sync-dha-registry/`);
    return parseResponse(FacilityDetailSchema, response.data, {
      context: 'facilitiesApi.syncDhaRegistry',
    });
  },
};

export function toUserFacility(facility: FacilityDetail): UserFacility {
  return {
    id: facility.id,
    mfl_code: facility.mfl_code,
    name: facility.name,
    level: facility.level,
    modules: facility.modules,
    sha_contracted: facility.sha_contracted,
  };
}
