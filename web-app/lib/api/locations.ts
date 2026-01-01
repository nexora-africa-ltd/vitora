import { apiClient } from './client';

export interface County {
  id: number;
  code: number;
  name: string;
}

export interface SubCounty {
  id: number;
  county: number;
  name: string;
}

export interface Ward {
  id: number;
  sub_county: number;
  name: string;
}

export const locationsApi = {
  /**
   * Get all 47 Kenya counties.
   */
  async getCounties(): Promise<County[]> {
    const response = await apiClient.get<County[]>('/api/locations/counties/');
    return response.data;
  },

  /**
   * Get sub-counties for a county.
   */
  async getSubCounties(countyId: number): Promise<SubCounty[]> {
    const response = await apiClient.get<SubCounty[]>(
      `/api/locations/sub-counties/`,
      { params: { county: countyId } }
    );
    return response.data;
  },

  /**
   * Get wards for a sub-county.
   */
  async getWards(subCountyId: number): Promise<Ward[]> {
    const response = await apiClient.get<Ward[]>(
      `/api/locations/wards/`,
      { params: { sub_county: subCountyId } }
    );
    return response.data;
  },
};
