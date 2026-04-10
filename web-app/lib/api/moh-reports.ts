/**
 * MOH Reporting API client.
 */

import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import type { PaginatedResponse } from '@/lib/types';
import type {
  DHIS2Payload,
  MOH705Report,
  MOH705ReportListItem,
  MOH711Report,
  MOH711ReportListItem,
  MOH717Report,
  MOH717ReportListItem,
  MOHReportGenerateParams,
} from '@/lib/types/moh-reporting';
import {
  DHIS2PayloadSchema,
  MOH705ReportSchema,
  MOH711ReportSchema,
  MOH717ReportSchema,
  PaginatedMOH705ListSchema,
  PaginatedMOH711ListSchema,
  PaginatedMOH717ListSchema,
} from '@/lib/schemas/moh-reporting.schema';

const BASE = '/api/moh-reports';

export const mohReportsApi = {
  // -----------------------------------------------------------------------
  // MOH 705
  // -----------------------------------------------------------------------

  listMOH705: async (): Promise<PaginatedResponse<MOH705ReportListItem>> => {
    const response = await apiClient.get(`${BASE}/705/`);
    return parseResponse(PaginatedMOH705ListSchema, response.data, {
      context: 'mohReportsApi.listMOH705',
    });
  },

  getMOH705: async (id: number): Promise<MOH705Report> => {
    const response = await apiClient.get(`${BASE}/705/${id}/`);
    return parseResponse(MOH705ReportSchema, response.data, {
      context: 'mohReportsApi.getMOH705',
    });
  },

  generateMOH705: async (params?: MOHReportGenerateParams): Promise<MOH705Report> => {
    const response = await apiClient.post(`${BASE}/705/generate/`, params ?? {});
    return parseResponse(MOH705ReportSchema, response.data, {
      context: 'mohReportsApi.generateMOH705',
    });
  },

  approveMOH705: async (id: number, notes?: string): Promise<MOH705Report> => {
    const response = await apiClient.post(`${BASE}/705/${id}/approve/`, { notes: notes ?? '' });
    return parseResponse(MOH705ReportSchema, response.data, {
      context: 'mohReportsApi.approveMOH705',
    });
  },

  submitMOH705ToDHIS2: async (id: number) => {
    const response = await apiClient.post(`${BASE}/705/${id}/submit-to-dhis2/`);
    return response.data;
  },

  previewMOH705DHIS2: async (id: number): Promise<DHIS2Payload> => {
    const response = await apiClient.get(`${BASE}/705/${id}/dhis2-preview/`);
    return parseResponse(DHIS2PayloadSchema, response.data, {
      context: 'mohReportsApi.previewMOH705DHIS2',
    });
  },

  // -----------------------------------------------------------------------
  // MOH 711
  // -----------------------------------------------------------------------

  listMOH711: async (): Promise<PaginatedResponse<MOH711ReportListItem>> => {
    const response = await apiClient.get(`${BASE}/711/`);
    return parseResponse(PaginatedMOH711ListSchema, response.data, {
      context: 'mohReportsApi.listMOH711',
    });
  },

  getMOH711: async (id: number): Promise<MOH711Report> => {
    const response = await apiClient.get(`${BASE}/711/${id}/`);
    return parseResponse(MOH711ReportSchema, response.data, {
      context: 'mohReportsApi.getMOH711',
    });
  },

  generateMOH711: async (params?: MOHReportGenerateParams): Promise<MOH711Report> => {
    const response = await apiClient.post(`${BASE}/711/generate/`, params ?? {});
    return parseResponse(MOH711ReportSchema, response.data, {
      context: 'mohReportsApi.generateMOH711',
    });
  },

  approveMOH711: async (id: number, notes?: string): Promise<MOH711Report> => {
    const response = await apiClient.post(`${BASE}/711/${id}/approve/`, { notes: notes ?? '' });
    return parseResponse(MOH711ReportSchema, response.data, {
      context: 'mohReportsApi.approveMOH711',
    });
  },

  submitMOH711ToDHIS2: async (id: number) => {
    const response = await apiClient.post(`${BASE}/711/${id}/submit-to-dhis2/`);
    return response.data;
  },

  // -----------------------------------------------------------------------
  // MOH 717
  // -----------------------------------------------------------------------

  listMOH717: async (): Promise<PaginatedResponse<MOH717ReportListItem>> => {
    const response = await apiClient.get(`${BASE}/717/`);
    return parseResponse(PaginatedMOH717ListSchema, response.data, {
      context: 'mohReportsApi.listMOH717',
    });
  },

  getMOH717: async (id: number): Promise<MOH717Report> => {
    const response = await apiClient.get(`${BASE}/717/${id}/`);
    return parseResponse(MOH717ReportSchema, response.data, {
      context: 'mohReportsApi.getMOH717',
    });
  },

  generateMOH717: async (params?: MOHReportGenerateParams): Promise<MOH717Report> => {
    const response = await apiClient.post(`${BASE}/717/generate/`, params ?? {});
    return parseResponse(MOH717ReportSchema, response.data, {
      context: 'mohReportsApi.generateMOH717',
    });
  },

  approveMOH717: async (id: number, notes?: string): Promise<MOH717Report> => {
    const response = await apiClient.post(`${BASE}/717/${id}/approve/`, { notes: notes ?? '' });
    return parseResponse(MOH717ReportSchema, response.data, {
      context: 'mohReportsApi.approveMOH717',
    });
  },

  submitMOH717ToDHIS2: async (id: number) => {
    const response = await apiClient.post(`${BASE}/717/${id}/submit-to-dhis2/`);
    return response.data;
  },
};
