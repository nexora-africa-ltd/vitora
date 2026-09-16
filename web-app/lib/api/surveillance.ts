/**
 * Surveillance API client.
 */

import { z } from 'zod';
import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  ContactTracingContactSchema,
  ContactTracingFollowUpSchema,
  CountyNotificationDeliveryListSchema,
  CountyReportSchema,
  ExceededThresholdListSchema,
  IDSRDashboardSchema,
  IDSRDHIS2PreviewSchema,
  IDSRSubmitResponseSchema,
  IDSRWeeklyReportSchema,
  IHRDashboardSchema,
  IHRNotificationDetailSchema,
  IHRNotificationListSchema,
  NotifiableCaseDetailSchema,
  NotifiableDiseaseListItemSchema,
  OutbreakThresholdSchema,
  PaginatedNotifiableCaseSchema,
  PaginatedOutbreakThresholdSchema,
  PaginatedSurveillanceAlertSchema,
  PaginatedIDSRWeeklyReportSchema,
  PaginatedIHRNotificationSchema,
  PaginatedContactTracingContactSchema,
  SurveillanceAlertListArraySchema,
  SurveillanceFacilitySettingsSchema,
  SurveillanceDashboardSchema,
} from '@/lib/schemas/surveillance.schema';
import type {
  ContactTracingContact,
  ContactTracingFollowUp,
  CountyNotificationDelivery,
  CountyReport,
  ExceededThreshold,
  IDSRDashboard,
  IDSRDHIS2Preview,
  IDSRListParams,
  IDSRSubmitResponse,
  IDSRWeeklyReport,
  IDSRWeeklyReportListItem,
  IHRDashboard,
  IHRNotificationDetail,
  IHRNotificationListItem,
  IHRNotificationListParams,
  NotifiableCaseDetail,
  NotifiableCaseListItem,
  NotifiableCaseListParams,
  NotifiableDiseaseListItem,
  OutbreakThreshold,
  SurveillanceAlertListItem,
  SurveillanceFacilitySettings,
  SurveillanceDashboard,
  NotifiableCaseSeverity,
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

  async updateCaseSeverity(id: number, severity: NotifiableCaseSeverity): Promise<NotifiableCaseDetail> {
    const response = await apiClient.patch<NotifiableCaseDetail>(`/api/surveillance/cases/${id}/`, {
      severity,
    });
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.updateCaseSeverity',
    });
  },

  async updateCaseOnsetDate(id: number, onsetDate: string): Promise<NotifiableCaseDetail> {
    const response = await apiClient.patch<NotifiableCaseDetail>(`/api/surveillance/cases/${id}/`, {
      onset_date: onsetDate,
    });
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.updateCaseOnsetDate',
    });
  },

  async updateCaseLaboratoryConfirmed(
    id: number,
    laboratoryConfirmed: boolean
  ): Promise<NotifiableCaseDetail> {
    const response = await apiClient.patch<NotifiableCaseDetail>(`/api/surveillance/cases/${id}/`, {
      laboratory_confirmed: laboratoryConfirmed,
    });
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.updateCaseLaboratoryConfirmed',
    });
  },

  async notifyCounty(id: number, notes?: string): Promise<NotifiableCaseDetail> {
    const response = await apiClient.post<NotifiableCaseDetail>(
      `/api/surveillance/cases/${id}/notify_county/`,
      { notification_notes: notes ?? '' }
    );
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.notifyCounty',
    });
  },

  async markCaseInvestigated(id: number, notes?: string): Promise<NotifiableCaseDetail> {
    const response = await apiClient.post<NotifiableCaseDetail>(
      `/api/surveillance/cases/${id}/mark_investigated/`,
      { notes: notes ?? '' }
    );
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.markCaseInvestigated',
    });
  },

  async closeCase(id: number, notes?: string): Promise<NotifiableCaseDetail> {
    const response = await apiClient.post<NotifiableCaseDetail>(
      `/api/surveillance/cases/${id}/close_case/`,
      { notes: notes ?? '' }
    );
    return parseResponse(NotifiableCaseDetailSchema, response.data, {
      context: 'surveillanceApi.closeCase',
    });
  },

  async listCaseNotificationDeliveries(id: number): Promise<CountyNotificationDelivery[]> {
    const response = await apiClient.get(`/api/surveillance/cases/${id}/notification_deliveries/`);
    return parseResponse(CountyNotificationDeliveryListSchema, response.data, {
      context: 'surveillanceApi.listCaseNotificationDeliveries',
    });
  },

  async retryCaseNotificationDeliveries(id: number): Promise<CountyNotificationDelivery[]> {
    const response = await apiClient.post(`/api/surveillance/cases/${id}/retry_county_notifications/`);
    return parseResponse(CountyNotificationDeliveryListSchema, response.data, {
      context: 'surveillanceApi.retryCaseNotificationDeliveries',
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
  // Facility Notification Settings
  // ─────────────────────────────────────────────────────────────────────────
  async getNotificationSettings(): Promise<SurveillanceFacilitySettings> {
    const response = await apiClient.get('/api/surveillance/settings/current/');
    return parseResponse(SurveillanceFacilitySettingsSchema, response.data, {
      context: 'surveillanceApi.getNotificationSettings',
    });
  },

  async updateNotificationSettings(
    id: number,
    payload: {
      notify_via_sms?: boolean;
      notify_via_email?: boolean;
      sms_recipient?: string;
      email_recipient?: string;
      include_patient_identifiers?: boolean;
      max_retry_attempts?: number;
      retry_backoff_minutes?: number;
      is_active?: boolean;
    }
  ): Promise<SurveillanceFacilitySettings> {
    const response = await apiClient.patch(`/api/surveillance/settings/${id}/`, payload);
    return parseResponse(SurveillanceFacilitySettingsSchema, response.data, {
      context: 'surveillanceApi.updateNotificationSettings',
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Contact Tracing Engine
  // ─────────────────────────────────────────────────────────────────────────
  async listContacts(params?: {
    case?: number;
    status?: string;
    risk_level?: string;
    search?: string;
    ordering?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<ContactTracingContact>> {
    const response = await apiClient.get('/api/surveillance/contacts/', { params });
    return parseResponse(PaginatedContactTracingContactSchema, response.data, {
      context: 'surveillanceApi.listContacts',
    });
  },

  async listCaseContacts(
    caseId: number
  ): Promise<PaginatedResponse<ContactTracingContact>> {
    return this.listContacts({ case: caseId });
  },

  async getContact(contactId: number): Promise<ContactTracingContact> {
    const response = await apiClient.get(`/api/surveillance/contacts/${contactId}/`);
    return parseResponse(ContactTracingContactSchema, response.data, {
      context: 'surveillanceApi.getContact',
    });
  },

  async createCaseContact(payload: {
    case: number;
    full_name: string;
    phone_number?: string;
    relationship_to_case?: string;
    risk_level?: 'HIGH' | 'MEDIUM' | 'LOW';
    exposure_date?: string;
    notes?: string;
  }): Promise<ContactTracingContact> {
    const response = await apiClient.post('/api/surveillance/contacts/', payload);
    return parseResponse(ContactTracingContactSchema, response.data, {
      context: 'surveillanceApi.createCaseContact',
    });
  },

  async transitionContactStatus(
    contactId: number,
    action: 'mark_contacted' | 'start_monitoring' | 'mark_symptomatic' | 'mark_cleared',
    payload?: { notes?: string; monitoring_days?: number }
  ): Promise<ContactTracingContact> {
    const response = await apiClient.post(`/api/surveillance/contacts/${contactId}/${action}/`, payload ?? {});
    return parseResponse(ContactTracingContactSchema, response.data, {
      context: 'surveillanceApi.transitionContactStatus',
    });
  },

  async recordContactFollowup(
    contactId: number,
    payload: {
      followup_date: string;
      next_followup_date?: string;
      method: 'PHONE' | 'HOME_VISIT' | 'SMS' | 'CLINIC';
      symptoms_present?: boolean;
      temperature_c?: string;
      notes?: string;
      outcome?: 'CONTINUE_MONITORING' | 'ESCALATE_TESTING' | 'ESCALATE_ISOLATION' | 'CLEARED';
    }
  ): Promise<ContactTracingFollowUp> {
    const response = await apiClient.post(`/api/surveillance/contacts/${contactId}/record_followup/`, payload);
    return parseResponse(ContactTracingFollowUpSchema, response.data, {
      context: 'surveillanceApi.recordContactFollowup',
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

  /** Seed default national outbreak thresholds (admin only, empty DB only). */
  async seedThresholds(): Promise<{ created: number; total: number }> {
    const response = await apiClient.post<{ created: number; total: number }>(
      '/api/surveillance/thresholds/seed/'
    );
    return parseResponse(z.object({ created: z.number(), total: z.number() }), response.data, {
      context: 'surveillanceApi.seedThresholds',
    });
  },

  async createThreshold(data: {
    disease: number;
    county?: number | null;
    case_threshold: number;
    period_days: number;
    is_active?: boolean;
  }): Promise<OutbreakThreshold> {
    const response = await apiClient.post<OutbreakThreshold>('/api/surveillance/thresholds/', data);
    return parseResponse(OutbreakThresholdSchema, response.data, {
      context: 'surveillanceApi.createThreshold',
    });
  },

  async updateThreshold(
    id: number,
    data: {
      disease?: number;
      county?: number | null;
      case_threshold?: number;
      period_days?: number;
      is_active?: boolean;
    }
  ): Promise<OutbreakThreshold> {
    const response = await apiClient.patch<OutbreakThreshold>(
      `/api/surveillance/thresholds/${id}/`,
      data
    );
    return parseResponse(OutbreakThresholdSchema, response.data, {
      context: 'surveillanceApi.updateThreshold',
    });
  },

  async deleteThreshold(id: number): Promise<void> {
    await apiClient.delete(`/api/surveillance/thresholds/${id}/`);
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

  async generateIDSRReport(data?: {
    epi_year?: number;
    epi_week?: number;
  }): Promise<IDSRWeeklyReport> {
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

  // ─────────────────────────────────────────────────────────────────────────
  // IHR Notifications
  // ─────────────────────────────────────────────────────────────────────────
  async listIHRNotifiableDiseases(): Promise<NotifiableDiseaseListItem[]> {
    const response = await apiClient.get('/api/surveillance/diseases/', {
      params: { is_ihr_notifiable: true, is_active: true, page_size: 200 },
    });
    const results = response.data?.results ?? response.data;
    return parseResponse(z.array(NotifiableDiseaseListItemSchema), results, {
      context: 'surveillanceApi.listIHRNotifiableDiseases',
    });
  },

  async listIHRNotifications(
    params?: IHRNotificationListParams
  ): Promise<PaginatedResponse<IHRNotificationListItem>> {
    const response = await apiClient.get<PaginatedResponse<IHRNotificationListItem>>(
      '/api/surveillance/ihr/',
      { params }
    );
    return parseResponse(PaginatedIHRNotificationSchema, response.data, {
      context: 'surveillanceApi.listIHRNotifications',
    });
  },

  async getIHRNotification(id: number): Promise<IHRNotificationDetail> {
    const response = await apiClient.get<IHRNotificationDetail>(`/api/surveillance/ihr/${id}/`);
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.getIHRNotification',
    });
  },

  async createIHRNotification(
    data: Partial<IHRNotificationDetail>
  ): Promise<IHRNotificationDetail> {
    const response = await apiClient.post<IHRNotificationDetail>('/api/surveillance/ihr/', data);
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.createIHRNotification',
    });
  },

  async submitIHRToCounty(id: number, notes?: string): Promise<IHRNotificationDetail> {
    const response = await apiClient.post<IHRNotificationDetail>(
      `/api/surveillance/ihr/${id}/submit_to_county/`,
      { notes: notes ?? '' }
    );
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.submitIHRToCounty',
    });
  },

  async escalateIHRToNational(id: number, notes?: string): Promise<IHRNotificationDetail> {
    const response = await apiClient.post<IHRNotificationDetail>(
      `/api/surveillance/ihr/${id}/escalate_to_national/`,
      { notes: notes ?? '' }
    );
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.escalateIHRToNational',
    });
  },

  async notifyIHRToWHO(id: number, referenceNumber?: string): Promise<IHRNotificationDetail> {
    const response = await apiClient.post<IHRNotificationDetail>(
      `/api/surveillance/ihr/${id}/notify_who/`,
      { reference_number: referenceNumber ?? '' }
    );
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.notifyIHRToWHO',
    });
  },

  async acknowledgeIHRWHO(id: number): Promise<IHRNotificationDetail> {
    const response = await apiClient.post<IHRNotificationDetail>(
      `/api/surveillance/ihr/${id}/acknowledge_who/`,
      {}
    );
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.acknowledgeIHRWHO',
    });
  },

  async closeIHRNotification(id: number, notes?: string): Promise<IHRNotificationDetail> {
    const response = await apiClient.post<IHRNotificationDetail>(
      `/api/surveillance/ihr/${id}/close/`,
      { notes: notes ?? '' }
    );
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.closeIHRNotification',
    });
  },

  async rejectIHRNotification(id: number, notes?: string): Promise<IHRNotificationDetail> {
    const response = await apiClient.post<IHRNotificationDetail>(
      `/api/surveillance/ihr/${id}/reject/`,
      { notes: notes ?? '' }
    );
    return parseResponse(IHRNotificationDetailSchema, response.data, {
      context: 'surveillanceApi.rejectIHRNotification',
    });
  },

  async listOverdueIHRNotifications(): Promise<IHRNotificationListItem[]> {
    const response = await apiClient.get<IHRNotificationListItem[]>(
      '/api/surveillance/ihr/overdue/'
    );
    return parseResponse(z.array(IHRNotificationListSchema), response.data, {
      context: 'surveillanceApi.listOverdueIHRNotifications',
    });
  },

  async getIHRDashboard(): Promise<IHRDashboard> {
    const response = await apiClient.get<IHRDashboard>('/api/surveillance/ihr/dashboard/');
    return parseResponse(IHRDashboardSchema, response.data, {
      context: 'surveillanceApi.getIHRDashboard',
    });
  },

  // ============ Interoperability Exports ============

  /**
   * Export an IDSR weekly report in ADX (Aggregate Data Exchange) XML format.
   * Triggers a file download.
   */
  async exportAdx(reportId: number): Promise<Blob> {
    const response = await apiClient.post(
      `/api/surveillance/idsr-reports/${reportId}/export_adx/`,
      {},
      { responseType: 'blob' }
    );
    return response.data as Blob;
  },

  /**
   * Export an IDSR weekly report in SDMX-ML 2.1 XML format.
   * Triggers a file download.
   */
  async exportSdmx(reportId: number): Promise<Blob> {
    const response = await apiClient.post(
      `/api/surveillance/idsr-reports/${reportId}/export_sdmx/`,
      {},
      { responseType: 'blob' }
    );
    return response.data as Blob;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Notifiable Diseases
  // ─────────────────────────────────────────────────────────────────────────

  /** List all notifiable diseases. */
  async listDiseases(): Promise<NotifiableDiseaseListItem[]> {
    const response = await apiClient.get('/api/surveillance/diseases/', {
      params: { page_size: 200 },
    });
    // Endpoint returns paginated response; extract results array
    const results = response.data?.results ?? response.data;
    return parseResponse(z.array(NotifiableDiseaseListItemSchema), results, {
      context: 'surveillanceApi.listDiseases',
    });
  },

  /** Seed MOH 502 notifiable diseases (admin only, empty DB only). */
  async seedDiseases(): Promise<{ created: number; total: number }> {
    const response = await apiClient.post<{ created: number; total: number }>(
      '/api/surveillance/diseases/seed/'
    );
    return parseResponse(z.object({ created: z.number(), total: z.number() }), response.data, {
      context: 'surveillanceApi.seedDiseases',
    });
  },
};
