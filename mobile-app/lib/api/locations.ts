/**
 * Locations API Module
 *
 * Provides methods for fetching Kenya location hierarchy:
 * Counties → Sub-Counties → Wards
 *
 * Includes caching for counties since they rarely change.
 *
 * @module lib/api/locations
 */

import { getApiClient } from './client';

/**
 * Kenya County type
 */
export interface County {
  id: number;
  code: number;
  name: string;
}

/**
 * Kenya Sub-County type
 */
export interface SubCounty {
  id: number;
  name: string;
  county: number;
}

/**
 * Kenya Ward type
 */
export interface Ward {
  id: number;
  name: string;
  sub_county: number;
}

// Cache for counties (rarely change)
let countiesCache: County[] | null = null;

/**
 * Locations API methods
 */
export const locationsApi = {
  /**
   * Get all 47 Kenya counties
   *
   * @param force - Force refresh from server (bypass cache)
   * @returns Array of counties
   */
  async getCounties(force: boolean = false): Promise<County[]> {
    if (!force && countiesCache) {
      return countiesCache;
    }

    const client = getApiClient();
    const response = await client.get<County[]>('/api/locations/counties/');
    countiesCache = response.data;
    return response.data;
  },

  /**
   * Get sub-counties for a county
   *
   * @param countyId - County ID
   * @returns Array of sub-counties
   */
  async getSubCounties(countyId: number): Promise<SubCounty[]> {
    const client = getApiClient();
    const response = await client.get<SubCounty[]>(
      '/api/locations/sub-counties/',
      {
        params: { county: countyId },
      }
    );
    return response.data;
  },

  /**
   * Get wards for a sub-county
   *
   * @param subCountyId - Sub-County ID
   * @returns Array of wards
   */
  async getWards(subCountyId: number): Promise<Ward[]> {
    const client = getApiClient();
    const response = await client.get<Ward[]>('/api/locations/wards/', {
      params: { sub_county: subCountyId },
    });
    return response.data;
  },

  /**
   * Get a single county by ID
   *
   * @param id - County ID
   * @returns County details
   */
  async getCountyById(id: number): Promise<County> {
    const client = getApiClient();
    const response = await client.get<County>(`/api/locations/counties/${id}/`);
    return response.data;
  },

  /**
   * Get a single sub-county by ID
   *
   * @param id - Sub-County ID
   * @returns Sub-County details
   */
  async getSubCountyById(id: number): Promise<SubCounty> {
    const client = getApiClient();
    const response = await client.get<SubCounty>(
      `/api/locations/sub-counties/${id}/`
    );
    return response.data;
  },

  /**
   * Get a single ward by ID
   *
   * @param id - Ward ID
   * @returns Ward details
   */
  async getWardById(id: number): Promise<Ward> {
    const client = getApiClient();
    const response = await client.get<Ward>(`/api/locations/wards/${id}/`);
    return response.data;
  },

  /**
   * Search counties by name
   *
   * @param query - Search query
   * @returns Matching counties
   */
  async searchCounties(query: string): Promise<County[]> {
    const client = getApiClient();
    const response = await client.get<County[]>('/api/locations/counties/', {
      params: { search: query },
    });
    return response.data;
  },

  /**
   * Clear the counties cache
   */
  clearCache(): void {
    countiesCache = null;
  },
};
