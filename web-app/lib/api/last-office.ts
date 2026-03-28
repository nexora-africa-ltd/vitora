/**
 * Last Office (Death Records) API client
 *
 * All responses validated with Zod schemas.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  DeathRecordSchema,
  PaginatedDeathRecordSchema,
} from '@/lib/schemas/last-office.schema';
import type {
  DeathRecord,
  DeathRecordListItem,
  DeathRecordCreateData,
  DeathRecordListParams,
  CertifyData,
  ReleaseBodyData,
  VoidData,
} from '@/lib/types/last-office';
import type { PaginatedResponse } from '@/lib/types';

export const lastOfficeApi = {
  /**
   * Get paginated list of death records
   */
  async list(params: DeathRecordListParams = {}): Promise<PaginatedResponse<DeathRecordListItem>> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.page_size) searchParams.set('page_size', String(params.page_size));
    if (params.search) searchParams.set('search', params.search);
    if (params.status) searchParams.set('status', params.status);
    if (params.body_status) searchParams.set('body_status', params.body_status);
    if (params.manner_of_death) searchParams.set('manner_of_death', params.manner_of_death);
    if (params.place_of_death) searchParams.set('place_of_death', params.place_of_death);
    if (params.patient) searchParams.set('patient', String(params.patient));
    if (params.ordering) searchParams.set('ordering', params.ordering);

    const response = await apiClient.get(`/api/death-records/?${searchParams.toString()}`);
    return parseResponse(PaginatedDeathRecordSchema, response.data, {
      context: 'lastOfficeApi.list',
    }) as PaginatedResponse<DeathRecordListItem>;
  },

  /**
   * Get a single death record by ID
   */
  async get(id: number): Promise<DeathRecord> {
    const response = await apiClient.get(`/api/death-records/${id}/`);
    return parseResponse(DeathRecordSchema, response.data, {
      context: 'lastOfficeApi.get',
    }) as DeathRecord;
  },

  /**
   * Create a new death record
   */
  async create(data: DeathRecordCreateData): Promise<DeathRecord> {
    const response = await apiClient.post('/api/death-records/', data);
    return response.data;
  },

  /**
   * Certify a death record
   */
  async certify(id: number, data: CertifyData = {}): Promise<DeathRecord> {
    const response = await apiClient.post(`/api/death-records/${id}/certify/`, data);
    return parseResponse(DeathRecordSchema, response.data, {
      context: 'lastOfficeApi.certify',
    }) as DeathRecord;
  },

  /**
   * Release body to family
   */
  async releaseBody(id: number, data: ReleaseBodyData): Promise<DeathRecord> {
    const response = await apiClient.post(`/api/death-records/${id}/release-body/`, data);
    return parseResponse(DeathRecordSchema, response.data, {
      context: 'lastOfficeApi.releaseBody',
    }) as DeathRecord;
  },

  /**
   * Report to civil registry
   */
  async reportToCivilRegistry(id: number): Promise<DeathRecord> {
    const response = await apiClient.post(`/api/death-records/${id}/report-to-civil-registry/`);
    return parseResponse(DeathRecordSchema, response.data, {
      context: 'lastOfficeApi.reportToCivilRegistry',
    }) as DeathRecord;
  },

  /**
   * Void a death record (entered in error)
   */
  async void(id: number, data: VoidData): Promise<DeathRecord> {
    const response = await apiClient.post(`/api/death-records/${id}/void/`, data);
    return parseResponse(DeathRecordSchema, response.data, {
      context: 'lastOfficeApi.void',
    }) as DeathRecord;
  },
};
