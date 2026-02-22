/**
 * Surveillance API client.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  IDSRDashboardSchema,
  IDSRDHIS2PreviewSchema,
  IDSRSubmitResponseSchema,
  IDSRWeeklyReportSchema,
  PaginatedNotifiableCaseSchema,
  PaginatedIDSRWeeklyReportSchema,
} from '@/lib/schemas/surveillance.schema';
import type {
  IDSRDashboard,
  IDSRDHIS2Preview,
  IDSRListParams,
  IDSRSubmitResponse,
  IDSRWeeklyReport,
  IDSRWeeklyReportListItem,
  NotifiableCaseListItem,
  NotifiableCaseListParams,
} from '@/lib/types/surveillance';
import type { PaginatedResponse } from '@/lib/types';

export const surveillanceApi = {
  async listNotifiableCases(
    params?: NotifiableCaseListParams
  ): Promise<PaginatedResponse<NotifiableCaseListItem>> {
    const response = await apiClient.get<PaginatedResponse<NotifiableCaseListItem>>(
      '/api/surveillance/cases/',
      { params }
    );
    return parseResponse(PaginatedNotifiableCaseSchema, response.data, {
      context: 'surveillanceApi.listNotifiableCases',
    });
  },

  async listIDSRReports(
    params?: IDSRListParams
  ): Promise<PaginatedResponse<IDSRWeeklyReportListItem>> {
    const response = await apiClient.get<PaginatedResponse<IDSRWeeklyReportListItem>>(
      '/api/surveillance/idsr/',
      { params }
    );
    return parseResponse(PaginatedIDSRWeeklyReportSchema, response.data, {
      context: 'surveillanceApi.listIDSRReports',
    });
  },

  async getIDSRReport(id: number): Promise<IDSRWeeklyReport> {
    const response = await apiClient.get<IDSRWeeklyReport>(`/api/surveillance/idsr/${id}/`);
    return parseResponse(IDSRWeeklyReportSchema, response.data, {
      context: 'surveillanceApi.getIDSRReport',
    });
  },

  async generateIDSRReport(data?: { epi_year?: number; epi_week?: number }): Promise<IDSRWeeklyReport> {
    const response = await apiClient.post<IDSRWeeklyReport>(
      '/api/surveillance/idsr/generate/',
      data ?? {}
    );
    return parseResponse(IDSRWeeklyReportSchema, response.data, {
      context: 'surveillanceApi.generateIDSRReport',
    });
  },

  async approveIDSRReport(id: number, notes?: string): Promise<IDSRWeeklyReport> {
    const response = await apiClient.post<IDSRWeeklyReport>(
      `/api/surveillance/idsr/${id}/approve/`,
      { notes: notes ?? '' }
    );
    return parseResponse(IDSRWeeklyReportSchema, response.data, {
      context: 'surveillanceApi.approveIDSRReport',
    });
  },

  async submitIDSRReport(id: number): Promise<IDSRSubmitResponse> {
    const response = await apiClient.post<IDSRSubmitResponse>(
      `/api/surveillance/idsr/${id}/submit_to_dhis2/`
    );
    return parseResponse(IDSRSubmitResponseSchema, response.data, {
      context: 'surveillanceApi.submitIDSRReport',
    });
  },

  async getIDSRDashboard(): Promise<IDSRDashboard> {
    const response = await apiClient.get<IDSRDashboard>('/api/surveillance/idsr/dashboard/');
    return parseResponse(IDSRDashboardSchema, response.data, {
      context: 'surveillanceApi.getIDSRDashboard',
    });
  },

  async getDHIS2Preview(id: number): Promise<IDSRDHIS2Preview> {
    const response = await apiClient.get<IDSRDHIS2Preview>(
      `/api/surveillance/idsr/${id}/dhis2_preview/`
    );
    return parseResponse(IDSRDHIS2PreviewSchema, response.data, {
      context: 'surveillanceApi.getDHIS2Preview',
    });
  },
};
