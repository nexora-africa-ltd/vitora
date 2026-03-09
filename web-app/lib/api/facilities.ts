import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  FacilityDetailSchema,
  PaginatedFacilityListSchema,
} from '@/lib/schemas/facility.schema';
import type { UserFacility } from '@/lib/auth/context';
import type { PaginatedResponse } from '@/lib/types';
import type { FacilityDetail, FacilityListItem, FacilityUpdateData } from '@/lib/types/facility';

export const facilitiesApi = {
  async list(params?: Record<string, string | number | boolean | undefined>): Promise<PaginatedResponse<FacilityListItem>> {
    const response = await apiClient.get<PaginatedResponse<FacilityListItem>>('/api/facilities/', {
      params,
    });
    return parseResponse(PaginatedFacilityListSchema, response.data, {
      context: 'facilitiesApi.list',
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