import { apiClient } from './client';
import {
  CDSAlertActionResponseSchema,
  CDSEvaluateResponseSchema,
  PaginatedCDSAlertSchema,
} from '@/lib/schemas/cds.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type {
  CDSAlertAcknowledgeData,
  CDSAlertActionResponse,
  CDSAlertListItem,
  CDSAlertOverrideData,
  CDSEvaluateResponse,
} from '@/lib/types/cds';

export const cdsApi = {
  /** List CDS alerts, optionally filtered by encounter. */
  async listAlerts(params: { encounter?: number; patient?: number; status?: string; page?: number; page_size?: number } = {}): Promise<{ count: number; results: CDSAlertListItem[] }> {
    const response = await apiClient.get('/api/cds/alerts/', {
      params: { page_size: 50, ...params },
    });
    const parsed = parseResponse(PaginatedCDSAlertSchema, response.data, {
      context: 'cds.listAlerts',
    });
    return { count: parsed.count, results: parsed.results };
  },

  /** Get pending alerts for a specific encounter. */
  async getEncounterAlerts(encounterId: number): Promise<CDSAlertListItem[]> {
    const response = await apiClient.get('/api/cds/alerts/', {
      params: { encounter: encounterId, status: 'PENDING', page_size: 50 },
    });
    const parsed = parseResponse(PaginatedCDSAlertSchema, response.data, {
      context: 'cds.getEncounterAlerts',
    });
    return parsed.results;
  },

  /** Acknowledge a CDS alert. */
  async acknowledgeAlert(alertId: number, data: CDSAlertAcknowledgeData = {}): Promise<CDSAlertActionResponse> {
    const response = await apiClient.post(`/api/cds/alerts/${alertId}/acknowledge/`, data);
    return parseResponse(CDSAlertActionResponseSchema, response.data, {
      context: 'cds.acknowledgeAlert',
    });
  },

  /** Override a CDS alert with a clinical reason. */
  async overrideAlert(alertId: number, data: CDSAlertOverrideData): Promise<CDSAlertActionResponse> {
    const response = await apiClient.post(`/api/cds/alerts/${alertId}/override/`, data);
    return parseResponse(CDSAlertActionResponseSchema, response.data, {
      context: 'cds.overrideAlert',
    });
  },

  /** Trigger CDS evaluation for an encounter. */
  async evaluateEncounter(encounterId: number): Promise<CDSEvaluateResponse> {
    const response = await apiClient.post('/api/cds/evaluate/', { encounter_id: encounterId });
    return parseResponse(CDSEvaluateResponseSchema, response.data, {
      context: 'cds.evaluateEncounter',
    });
  },
};
