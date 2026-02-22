/**
 * Surveillance API client.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  CountyReportSchema,
  ExceededThresholdListSchema,
  IDSRDashboardSchema,
  IDSRDHIS2PreviewSchema,
  IDSRSubmitResponseSchema,
  IDSRWeeklyReportSchema,
  NotifiableCaseDetailSchema,
  OutbreakThresholdSchema,
  PaginatedNotifiableCaseSchema,
  PaginatedOutbreakThresholdSchema,
  PaginatedSurveillanceAlertSchema,
  PaginatedIDSRWeeklyReportSchema,
  SurveillanceAlertListArraySchema,
  SurveillanceDashboardSchema,
} from '@/lib/schemas/surveillance.schema';
import type {
  CountyReport,
  ExceededThreshold,
  IDSRDashboard,
  IDSRDHIS2Preview,
  IDSRListParams,
  IDSRSubmitResponse,
  IDSRWeeklyReport,
  IDSRWeeklyReportListItem,
  NotifiableCaseDetail,
  NotifiableCaseListItem,
  NotifiableCaseListParams,
  OutbreakThreshold,
  SurveillanceAlertListItem,
  SurveillanceDashboard,
} from '@/lib/types/surveillance';
import type { PaginatedResponse } from '@/lib/types';

export interface AlertListParams {
  is_acknowledged?: boolean;
  alert_type?: string;
  page?: number;
  page_size?: number;
}

export interface ThresholdListParams {
  disease?: number;
  county?: number;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export const surveillanceApi = {
  // ─────────────────────────────────────────────────────────────────────────
  // Dashboard
  // ─────────────────────────────────────────────────────────────────────────
  async getDashboard(): Promise<SurveillanceDashboard> {
    const response = await apiClient.get<SurveillanceDashboard>('/api/surveillance/dashboard/');
    return parseResponse(SurveillanceDashboardSchema, response.data, {
      context: 'surveillanceApi.getDashboard',
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Notifiable Cases
  // ─────────────────────────────────────────────────────────────────────────
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

  async getNotifiableCase(id: number): Promise<NotifiableCaseDetail> {
    const response = await apiClient.get<NotifiableCaseDetail>(`/api/surveillance/cases/${id}/`);
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.getNotifiableCase',
    });
  },

  async notifyCounty(id: number, notes?: string): Promise<NotifiableCaseDetail> {
    const response = await apiClient.post<NotifiableCaseDetail>(
      `/api/surveillance/cases/${id}/notify_county/`,
      { notes: notes ?? '' }
    );
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.notifyCounty',
    });
  },

  async listPendingCases(
    params?: NotifiableCaseListParams
  ): Promise<PaginatedResponse<NotifiableCaseListItem>> {
    const response = await apiClient.get<PaginatedResponse<NotifiableCaseListItem>>(
      '/api/surveillance/cases/pending/',
      { params }
    );
    return parseResponse(PaginatedNotifiableCaseSchema, response.data, {
      context: 'surveillanceApi.listPendingCases',
    });
  },

  async listOverdueCases(
    params?: NotifiableCaseListParams
  ): Promise<PaginatedResponse<NotifiableCaseListItem>> {
    const response = await apiClient.get<PaginatedResponse<NotifiableCaseListItem>>(
      '/api/surveillance/cases/overdue/',
      { params }
    );
    return parseResponse(PaginatedNotifiableCaseSchema, response.data, {
      context: 'surveillanceApi.listOverdueCases',
    });
  },

  async listImmediateCases(
    params?: NotifiableCaseListParams
  ): Promise<PaginatedResponse<NotifiableCaseListItem>> {
    const response = await apiClient.get<PaginatedResponse<NotifiableCaseListItem>>(
      '/api/surveillance/cases/immediate/',
      { params }
    );
    return parseResponse(PaginatedNotifiableCaseSchema, response.data, {
      context: 'surveillanceApi.listImmediateCases',
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Alerts
  // ─────────────────────────────────────────────────────────────────────────
  async listAlerts(
    params?: AlertListParams
  ): Promise<PaginatedResponse<SurveillanceAlertListItem>> {
    const response = await apiClient.get<PaginatedResponse<SurveillanceAlertListItem>>(
      '/api/surveillance/alerts/',
      { params }
    );
    return parseResponse(PaginatedSurveillanceAlertSchema, response.data, {
      context: 'surveillanceApi.listAlerts',
    });
  },

  async listUnacknowledgedAlerts(): Promise<SurveillanceAlertListItem[]> {
    const response = await apiClient.get<SurveillanceAlertListItem[]>(
      '/api/surveillance/alerts/unacknowledged/'
    );
    return parseResponse(SurveillanceAlertListArraySchema, response.data, {
      context: 'surveillanceApi.listUnacknowledgedAlerts',
    });
  },

  async acknowledgeAlert(id: number): Promise<void> {
    await apiClient.post(`/api/surveillance/alerts/${id}/acknowledge/`);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Outbreak Thresholds
  // ─────────────────────────────────────────────────────────────────────────
  async listThresholds(
    params?: ThresholdListParams
  ): Promise<PaginatedResponse<OutbreakThreshold>> {
    const response = await apiClient.get<PaginatedResponse<OutbreakThreshold>>(
      '/api/surveillance/thresholds/',
      { params }
    );
    return parseResponse(PaginatedOutbreakThresholdSchema, response.data, {
      context: 'surveillanceApi.listThresholds',
    });
  },

  async getThreshold(id: number): Promise<OutbreakThreshold> {
    const response = await apiClient.get<OutbreakThreshold>(`/api/surveillance/thresholds/${id}/`);
    return parseResponse(OutbreakThresholdSchema, response.data, {
      context: 'surveillanceApi.getThreshold',
    });
  },

  async listExceededThresholds(): Promise<ExceededThreshold[]> {
    const response = await apiClient.get<ExceededThreshold[]>(
      '/api/surveillance/thresholds/exceeded/'
    );
    return parseResponse(ExceededThresholdListSchema, response.data, {
      context: 'surveillanceApi.listExceededThresholds',
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // County Reports
  // ─────────────────────────────────────────────────────────────────────────
  async getCountyReport(
    countyId: number,
    params?: { start_date?: string; end_date?: string }
  ): Promise<CountyReport> {
    const response = await apiClient.get<CountyReport>(
      `/api/surveillance/reports/county/${countyId}/`,
      { params }
    );
    return parseResponse(CountyReportSchema, response.data, {
      context: 'surveillanceApi.getCountyReport',
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IDSR Reports
  // ─────────────────────────────────────────────────────────────────────────
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
