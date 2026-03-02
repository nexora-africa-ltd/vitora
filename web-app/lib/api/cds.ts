/**
 * CDS (Clinical Decision Support) API Client
 *
 * Provides methods for CDS rules and alerts with Zod-validated responses.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedCDSRuleSchema,
  CDSRuleDetailSchema,
  PaginatedCDSAlertSchema,
  CDSAlertDetailSchema,
  CDSDashboardSchema,
  CDSRuleEvaluateResponseSchema,
  CDSEncounterEvaluateResponseSchema,
} from '@/lib/schemas/cds.schema';
import type {
  CDSRuleListItem,
  CDSRuleDetail,
  CDSRuleCreateData,
  CDSRuleListParams,
  CDSAlertListItem,
  CDSAlertDetail,
  CDSAlertListParams,
  CDSDashboard,
  CDSRuleEvaluateResponse,
  CDSEncounterEvaluateResponse,
} from '@/lib/types/cds';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const cdsApi = {
  // ──────────────────────────── Rules ────────────────────────────

  async listRules(params?: CDSRuleListParams): Promise<PaginatedResponse<CDSRuleListItem>> {
    const response = await apiClient.get('/api/cds/rules/', { params });
    return parseResponse(PaginatedCDSRuleSchema, response.data, { context: 'cdsApi.listRules' });
  },

  async getRule(id: number): Promise<CDSRuleDetail> {
    const response = await apiClient.get(`/api/cds/rules/${id}/`);
    return parseResponse(CDSRuleDetailSchema, response.data, { context: 'cdsApi.getRule' });
  },

  async createRule(data: CDSRuleCreateData): Promise<CDSRuleDetail> {
    const response = await apiClient.post('/api/cds/rules/', data);
    return parseResponse(CDSRuleDetailSchema, response.data, { context: 'cdsApi.createRule' });
  },

  async updateRule(id: number, data: Partial<CDSRuleCreateData>): Promise<CDSRuleDetail> {
    const response = await apiClient.patch(`/api/cds/rules/${id}/`, data);
    return parseResponse(CDSRuleDetailSchema, response.data, { context: 'cdsApi.updateRule' });
  },

  async deleteRule(id: number): Promise<void> {
    await apiClient.delete(`/api/cds/rules/${id}/`);
  },

  async activateRule(id: number): Promise<CDSRuleDetail> {
    const response = await apiClient.post(`/api/cds/rules/${id}/activate/`);
    return parseResponse(CDSRuleDetailSchema, response.data, { context: 'cdsApi.activateRule' });
  },

  async deactivateRule(id: number): Promise<CDSRuleDetail> {
    const response = await apiClient.post(`/api/cds/rules/${id}/deactivate/`);
    return parseResponse(CDSRuleDetailSchema, response.data, { context: 'cdsApi.deactivateRule' });
  },

  async retireRule(id: number): Promise<CDSRuleDetail> {
    const response = await apiClient.post(`/api/cds/rules/${id}/retire/`);
    return parseResponse(CDSRuleDetailSchema, response.data, { context: 'cdsApi.retireRule' });
  },

  async evaluateRule(id: number, encounterId: number): Promise<CDSRuleEvaluateResponse> {
    const response = await apiClient.post(`/api/cds/rules/${id}/evaluate/`, { encounter_id: encounterId });
    return parseResponse(CDSRuleEvaluateResponseSchema, response.data, { context: 'cdsApi.evaluateRule' });
  },

  // ──────────────────────────── Alerts ────────────────────────────

  async listAlerts(params?: CDSAlertListParams): Promise<PaginatedResponse<CDSAlertListItem>> {
    const response = await apiClient.get('/api/cds/alerts/', { params });
    return parseResponse(PaginatedCDSAlertSchema, response.data, { context: 'cdsApi.listAlerts' });
  },

  async getAlert(id: number): Promise<CDSAlertDetail> {
    const response = await apiClient.get(`/api/cds/alerts/${id}/`);
    return parseResponse(CDSAlertDetailSchema, response.data, { context: 'cdsApi.getAlert' });
  },

  async acknowledgeAlert(id: number): Promise<CDSAlertDetail> {
    const response = await apiClient.post(`/api/cds/alerts/${id}/acknowledge/`);
    return parseResponse(CDSAlertDetailSchema, response.data, { context: 'cdsApi.acknowledgeAlert' });
  },

  async acceptAlert(id: number): Promise<CDSAlertDetail> {
    const response = await apiClient.post(`/api/cds/alerts/${id}/accept/`);
    return parseResponse(CDSAlertDetailSchema, response.data, { context: 'cdsApi.acceptAlert' });
  },

  async overrideAlert(id: number, reason: string): Promise<CDSAlertDetail> {
    const response = await apiClient.post(`/api/cds/alerts/${id}/override/`, { reason });
    return parseResponse(CDSAlertDetailSchema, response.data, { context: 'cdsApi.overrideAlert' });
  },

  async dismissAlert(id: number): Promise<CDSAlertDetail> {
    const response = await apiClient.post(`/api/cds/alerts/${id}/dismiss/`);
    return parseResponse(CDSAlertDetailSchema, response.data, { context: 'cdsApi.dismissAlert' });
  },

  async getPendingAlerts(params?: { patient?: number; encounter?: number }): Promise<PaginatedResponse<CDSAlertListItem>> {
    const response = await apiClient.get('/api/cds/alerts/pending/', { params });
    return parseResponse(PaginatedCDSAlertSchema, response.data, { context: 'cdsApi.getPendingAlerts' });
  },

  async evaluateEncounter(encounterId: number): Promise<CDSEncounterEvaluateResponse> {
    const response = await apiClient.post('/api/cds/alerts/evaluate_encounter/', { encounter_id: encounterId });
    return parseResponse(CDSEncounterEvaluateResponseSchema, response.data, { context: 'cdsApi.evaluateEncounter' });
  },

  async getDashboard(): Promise<CDSDashboard> {
    const response = await apiClient.get('/api/cds/alerts/dashboard/');
    return parseResponse(CDSDashboardSchema, response.data, { context: 'cdsApi.getDashboard' });
  },
};
