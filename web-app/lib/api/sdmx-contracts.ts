// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Zod-validated API client for Nexora-managed SDMX contracts and mappings. */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedSDMXContractListSchema,
  PaginatedFacilitySDMXConfigurationSchema,
  SDMXCodeMappingSchema,
  FacilitySDMXConfigurationSchema,
  SDMXContractDetailSchema,
} from '@/lib/schemas/sdmx-contract.schema';
import type { PaginatedResponse } from '@/lib/types';
import type {
  SDMXCodeMapping,
  SDMXContractCreateData,
  SDMXContractDetail,
  SDMXContractListItem,
  FacilitySDMXConfiguration,
  FacilitySDMXConfigurationCreateData,
} from '@/lib/types/sdmx-contract';

export const sdmxContractsApi = {
  async list(): Promise<PaginatedResponse<SDMXContractListItem>> {
    const response = await apiClient.get('/api/quality/sdmx/contracts/');
    return parseResponse(PaginatedSDMXContractListSchema, response.data, {
      context: 'sdmxContractsApi.list',
    });
  },

  async create(data: SDMXContractCreateData): Promise<SDMXContractDetail> {
    const response = await apiClient.post('/api/quality/sdmx/contracts/', data);
    return parseResponse(SDMXContractDetailSchema, response.data, {
      context: 'sdmxContractsApi.create',
    });
  },

  async createMapping(data: Omit<SDMXCodeMapping, 'id' | 'contract_name' | 'created_at' | 'updated_at'>): Promise<SDMXCodeMapping> {
    const response = await apiClient.post('/api/quality/sdmx/mappings/', data);
    return parseResponse(SDMXCodeMappingSchema, response.data, {
      context: 'sdmxContractsApi.createMapping',
    });
  },

  async listFacilityConfigurations(): Promise<PaginatedResponse<FacilitySDMXConfiguration>> {
    const response = await apiClient.get('/api/quality/sdmx/facility-configs/');
    return parseResponse(PaginatedFacilitySDMXConfigurationSchema, response.data, {
      context: 'sdmxContractsApi.listFacilityConfigurations',
    });
  },

  async enableFacility(
    data: FacilitySDMXConfigurationCreateData
  ): Promise<FacilitySDMXConfiguration> {
    const response = await apiClient.post('/api/quality/sdmx/facility-configs/', data);
    return parseResponse(FacilitySDMXConfigurationSchema, response.data, {
      context: 'sdmxContractsApi.enableFacility',
    });
  },
};
