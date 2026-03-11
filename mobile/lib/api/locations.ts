import { apiClient } from './client';
import { CountyArraySchema, SubCountyArraySchema, WardArraySchema } from '@/lib/schemas/location.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { County, SubCounty, Ward } from '@/lib/types/location';

export const locationsApi = {
  async getCounties(): Promise<County[]> {
    const response = await apiClient.get('/api/locations/counties/');
    return parseResponse(CountyArraySchema, response.data, { context: 'locations.getCounties' });
  },

  async getSubCounties(countyId: number): Promise<SubCounty[]> {
    const response = await apiClient.get('/api/locations/sub-counties/', { params: { county: countyId } });
    return parseResponse(SubCountyArraySchema, response.data, { context: 'locations.getSubCounties' });
  },

  async getAllSubCounties(): Promise<SubCounty[]> {
    const response = await apiClient.get('/api/locations/sub-counties/');
    return parseResponse(SubCountyArraySchema, response.data, { context: 'locations.getAllSubCounties' });
  },

  async getWards(subCountyId: number): Promise<Ward[]> {
    const response = await apiClient.get('/api/locations/wards/', { params: { sub_county: subCountyId } });
    return parseResponse(WardArraySchema, response.data, { context: 'locations.getWards' });
  },

  async getAllWards(): Promise<Ward[]> {
    const response = await apiClient.get('/api/locations/wards/');
    return parseResponse(WardArraySchema, response.data, { context: 'locations.getAllWards' });
  },
};