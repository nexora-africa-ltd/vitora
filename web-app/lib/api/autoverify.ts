/**
 * Auto-Verification & Delta Check API client.
 * Phase L2: Delta Checks & Auto-Verification
 */

import { apiClient } from './client';
import type {
  DeltaCheckRule,
  DeltaCheckRuleCreateData,
  DeltaCheckResult,
  AutoVerifyRule,
  AutoVerifyRuleCreateData,
  AutoVerifyConfig,
  AutoVerifyLog,
  AutoVerifyStats,
} from '@/lib/types/autoverify';
import { parseResponse } from '@/lib/schemas/validation';
import {
  DeltaCheckRuleSchema,
  PaginatedDeltaCheckRuleSchema,
  DeltaCheckResultSchema,
  PaginatedDeltaCheckResultSchema,
  AutoVerifyRuleSchema,
  PaginatedAutoVerifyRuleSchema,
  AutoVerifyConfigSchema,
  AutoVerifyLogSchema,
  PaginatedAutoVerifyLogSchema,
  AutoVerifyStatsSchema,
} from '@/lib/schemas/autoverify.schema';

const BASE = '/api/lab/autoverify';

export const autoverifyApi = {
  // ===========================================================================
  // Delta Check Rules
  // ===========================================================================

  async listDeltaRules(params?: { test?: number; is_active?: boolean; action?: string }) {
    const response = await apiClient.get(`${BASE}/delta-rules/`, { params });
    return parseResponse(PaginatedDeltaCheckRuleSchema, response.data, {
      context: 'autoverifyApi.listDeltaRules',
    });
  },

  async getDeltaRule(id: number): Promise<DeltaCheckRule> {
    const response = await apiClient.get(`${BASE}/delta-rules/${id}/`);
    return parseResponse(DeltaCheckRuleSchema, response.data, {
      context: 'autoverifyApi.getDeltaRule',
    });
  },

  async createDeltaRule(data: DeltaCheckRuleCreateData): Promise<DeltaCheckRule> {
    const response = await apiClient.post(`${BASE}/delta-rules/`, data);
    return parseResponse(DeltaCheckRuleSchema, response.data, {
      context: 'autoverifyApi.createDeltaRule',
    });
  },

  async updateDeltaRule(id: number, data: Partial<DeltaCheckRuleCreateData>): Promise<DeltaCheckRule> {
    const response = await apiClient.patch(`${BASE}/delta-rules/${id}/`, data);
    return parseResponse(DeltaCheckRuleSchema, response.data, {
      context: 'autoverifyApi.updateDeltaRule',
    });
  },

  async deleteDeltaRule(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/delta-rules/${id}/`);
  },

  async seedDeltaDefaults(): Promise<{ created: number; message: string }> {
    const response = await apiClient.post(`${BASE}/delta-rules/seed_defaults/`);
    return response.data;
  },

  // ===========================================================================
  // Delta Check Results
  // ===========================================================================

  async listDeltaResults(params?: { outcome?: string; result?: number }) {
    const response = await apiClient.get(`${BASE}/delta-results/`, { params });
    return parseResponse(PaginatedDeltaCheckResultSchema, response.data, {
      context: 'autoverifyApi.listDeltaResults',
    });
  },

  async evaluateDelta(resultId: number): Promise<DeltaCheckResult | { message: string }> {
    const response = await apiClient.post(`${BASE}/delta-results/evaluate/`, {
      result_id: resultId,
    });
    // May return a DeltaCheckResult or a message if no rule
    if (response.data.message) return response.data;
    return parseResponse(DeltaCheckResultSchema, response.data, {
      context: 'autoverifyApi.evaluateDelta',
    });
  },

  // ===========================================================================
  // Auto-Verify Rules
  // ===========================================================================

  async listRules(params?: { test?: number; is_active?: boolean; condition_type?: string }) {
    const response = await apiClient.get(`${BASE}/rules/`, { params });
    return parseResponse(PaginatedAutoVerifyRuleSchema, response.data, {
      context: 'autoverifyApi.listRules',
    });
  },

  async getRule(id: number): Promise<AutoVerifyRule> {
    const response = await apiClient.get(`${BASE}/rules/${id}/`);
    return parseResponse(AutoVerifyRuleSchema, response.data, {
      context: 'autoverifyApi.getRule',
    });
  },

  async createRule(data: AutoVerifyRuleCreateData): Promise<AutoVerifyRule> {
    const response = await apiClient.post(`${BASE}/rules/`, data);
    return parseResponse(AutoVerifyRuleSchema, response.data, {
      context: 'autoverifyApi.createRule',
    });
  },

  async updateRule(id: number, data: Partial<AutoVerifyRuleCreateData>): Promise<AutoVerifyRule> {
    const response = await apiClient.patch(`${BASE}/rules/${id}/`, data);
    return parseResponse(AutoVerifyRuleSchema, response.data, {
      context: 'autoverifyApi.updateRule',
    });
  },

  async deleteRule(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/rules/${id}/`);
  },

  async seedRuleDefaults(testId: number): Promise<{ created: number; test: string }> {
    const response = await apiClient.post(`${BASE}/rules/seed_defaults/`, { test_id: testId });
    return response.data;
  },

  // ===========================================================================
  // Auto-Verify Config
  // ===========================================================================

  async getConfig(): Promise<AutoVerifyConfig> {
    const response = await apiClient.get(`${BASE}/config/current/`);
    return parseResponse(AutoVerifyConfigSchema, response.data, {
      context: 'autoverifyApi.getConfig',
    });
  },

  async updateConfig(id: number, data: Partial<AutoVerifyConfig>): Promise<AutoVerifyConfig> {
    const response = await apiClient.patch(`${BASE}/config/${id}/`, data);
    return parseResponse(AutoVerifyConfigSchema, response.data, {
      context: 'autoverifyApi.updateConfig',
    });
  },

  // ===========================================================================
  // Auto-Verify Logs
  // ===========================================================================

  async listLogs(params?: { outcome?: string; result?: number; date_from?: string; date_to?: string }) {
    const response = await apiClient.get(`${BASE}/logs/`, { params });
    return parseResponse(PaginatedAutoVerifyLogSchema, response.data, {
      context: 'autoverifyApi.listLogs',
    });
  },

  async evaluateAutoVerify(resultId: number): Promise<AutoVerifyLog> {
    const response = await apiClient.post(`${BASE}/logs/evaluate/`, {
      result_id: resultId,
    });
    return parseResponse(AutoVerifyLogSchema, response.data, {
      context: 'autoverifyApi.evaluateAutoVerify',
    });
  },

  async getStats(params?: { date_from?: string; date_to?: string }): Promise<AutoVerifyStats> {
    const response = await apiClient.get(`${BASE}/logs/stats/`, { params });
    return parseResponse(AutoVerifyStatsSchema, response.data, {
      context: 'autoverifyApi.getStats',
    });
  },
};
