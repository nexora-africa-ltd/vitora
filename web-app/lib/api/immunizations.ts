/**
 * Immunizations API Client
 *
 * Typed API methods for the standalone immunizations module.
 * All responses validated with Zod schemas via parseResponse().
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  VaccineDefinitionArraySchema,
  VaccineDefinitionSchema,
  PaginatedImmunizationRecordListSchema,
  ImmunizationRecordSchema,
  ImmunizationRecordListItemArraySchema,
  PaginatedVaccineCampaignListSchema,
  VaccineCampaignSchema,
  PaginatedAEFIListSchema,
  AEFIReportSchema,
  CoverageStatsSchema,
} from '@/lib/schemas/immunizations.schema';
import type {
  VaccineDefinition,
  ImmunizationRecord,
  ImmunizationRecordListItem,
  AdministerVaccineData,
  ImmunizationRecordListParams,
  GenerateAdultScheduleData,
  VaccineCampaign,
  VaccineCampaignCreateData,
  VaccineCampaignListParams,
  AEFIReport,
  AEFICreateData,
  AEFIListParams,
  CoverageStats,
  PaginatedImmunizationRecords,
  PaginatedVaccineCampaigns,
  PaginatedAEFIReports,
} from '@/lib/types/immunizations';

const BASE_URL = '/api/immunizations';

// =============================================================================
// VACCINE DEFINITIONS API
// =============================================================================

export const vaccineDefinitionsApi = {
  list: async (params?: {
    program?: string;
    target_population?: string;
    series_name?: string;
  }): Promise<VaccineDefinition[]> => {
    const response = await apiClient.get(`${BASE_URL}/vaccines/`, { params });
    return parseResponse(VaccineDefinitionArraySchema, response.data, {
      context: 'vaccineDefinitionsApi.list',
    });
  },

  get: async (id: number): Promise<VaccineDefinition> => {
    const response = await apiClient.get(`${BASE_URL}/vaccines/${id}/`);
    return parseResponse(VaccineDefinitionSchema, response.data, {
      context: 'vaccineDefinitionsApi.get',
    });
  },
};

// =============================================================================
// IMMUNIZATION RECORDS API
// =============================================================================

export const immunizationRecordsApi = {
  list: async (params?: ImmunizationRecordListParams): Promise<PaginatedImmunizationRecords> => {
    const response = await apiClient.get(`${BASE_URL}/records/`, { params });
    return parseResponse(PaginatedImmunizationRecordListSchema, response.data, {
      context: 'immunizationRecordsApi.list',
    });
  },

  get: async (id: number): Promise<ImmunizationRecord> => {
    const response = await apiClient.get(`${BASE_URL}/records/${id}/`);
    return parseResponse(ImmunizationRecordSchema, response.data, {
      context: 'immunizationRecordsApi.get',
    });
  },

  create: async (data: {
    patient: number;
    vaccine: number;
    dose_number: number;
    scheduled_date: string;
    status?: string;
  }): Promise<ImmunizationRecord> => {
    const response = await apiClient.post(`${BASE_URL}/records/`, data);
    return parseResponse(ImmunizationRecordSchema, response.data, {
      context: 'immunizationRecordsApi.create',
    });
  },

  administer: async (id: number, data: AdministerVaccineData): Promise<ImmunizationRecord> => {
    const response = await apiClient.post(`${BASE_URL}/records/${id}/administer/`, data);
    return parseResponse(ImmunizationRecordSchema, response.data, {
      context: 'immunizationRecordsApi.administer',
    });
  },

  generateKepiSchedule: async (patientId: number): Promise<ImmunizationRecordListItem[]> => {
    const response = await apiClient.post(`${BASE_URL}/records/generate-kepi-schedule/`, {
      patient: patientId,
    });
    return parseResponse(ImmunizationRecordListItemArraySchema, response.data, {
      context: 'immunizationRecordsApi.generateKepiSchedule',
    });
  },

  generateAdultSchedule: async (data: GenerateAdultScheduleData): Promise<ImmunizationRecordListItem[]> => {
    const response = await apiClient.post(`${BASE_URL}/records/generate-adult-schedule/`, data);
    return parseResponse(ImmunizationRecordListItemArraySchema, response.data, {
      context: 'immunizationRecordsApi.generateAdultSchedule',
    });
  },
};

// =============================================================================
// VACCINE CAMPAIGNS API
// =============================================================================

export const vaccineCampaignsApi = {
  list: async (params?: VaccineCampaignListParams): Promise<PaginatedVaccineCampaigns> => {
    const response = await apiClient.get(`${BASE_URL}/campaigns/`, { params });
    return parseResponse(PaginatedVaccineCampaignListSchema, response.data, {
      context: 'vaccineCampaignsApi.list',
    });
  },

  get: async (id: number): Promise<VaccineCampaign> => {
    const response = await apiClient.get(`${BASE_URL}/campaigns/${id}/`);
    return parseResponse(VaccineCampaignSchema, response.data, {
      context: 'vaccineCampaignsApi.get',
    });
  },

  create: async (data: VaccineCampaignCreateData): Promise<VaccineCampaign> => {
    const response = await apiClient.post(`${BASE_URL}/campaigns/`, data);
    return parseResponse(VaccineCampaignSchema, response.data, {
      context: 'vaccineCampaignsApi.create',
    });
  },

  update: async (id: number, data: Partial<VaccineCampaignCreateData>): Promise<VaccineCampaign> => {
    const response = await apiClient.patch(`${BASE_URL}/campaigns/${id}/`, data);
    return parseResponse(VaccineCampaignSchema, response.data, {
      context: 'vaccineCampaignsApi.update',
    });
  },
};

// =============================================================================
// AEFI API
// =============================================================================

export const aefiApi = {
  list: async (params?: AEFIListParams): Promise<PaginatedAEFIReports> => {
    const response = await apiClient.get(`${BASE_URL}/aefi/`, { params });
    return parseResponse(PaginatedAEFIListSchema, response.data, {
      context: 'aefiApi.list',
    });
  },

  get: async (id: number): Promise<AEFIReport> => {
    const response = await apiClient.get(`${BASE_URL}/aefi/${id}/`);
    return parseResponse(AEFIReportSchema, response.data, {
      context: 'aefiApi.get',
    });
  },

  create: async (data: AEFICreateData): Promise<AEFIReport> => {
    const response = await apiClient.post(`${BASE_URL}/aefi/`, data);
    return parseResponse(AEFIReportSchema, response.data, {
      context: 'aefiApi.create',
    });
  },
};

// =============================================================================
// COVERAGE API
// =============================================================================

export const coverageApi = {
  get: async (params: {
    vaccine_code: string;
    start_date?: string;
    end_date?: string;
  }): Promise<CoverageStats> => {
    const response = await apiClient.get(`${BASE_URL}/coverage/`, { params });
    return parseResponse(CoverageStatsSchema, response.data, {
      context: 'coverageApi.get',
    });
  },
};

// =============================================================================
// COMBINED EXPORT
// =============================================================================

export const immunizationsModule = {
  vaccines: vaccineDefinitionsApi,
  records: immunizationRecordsApi,
  campaigns: vaccineCampaignsApi,
  aefi: aefiApi,
  coverage: coverageApi,
};
