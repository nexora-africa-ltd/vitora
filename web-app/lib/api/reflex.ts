/**
 * Reflexive Testing API client.
 * Phase L6.1
 */

import { apiClient } from './client';
import type {
  ReflexRule,
  ReflexRuleCreateData,
  ReflexExecution,
  ReflexActionData,
} from '@/lib/types/reflex';
import { parseResponse } from '@/lib/schemas/validation';
import {
  ReflexRuleSchema,
  PaginatedReflexRuleSchema,
  ReflexExecutionSchema,
  PaginatedReflexExecutionSchema,
} from '@/lib/schemas/reflex.schema';

const BASE = '/api/lab/reflex';

export const reflexApi = {
  // ===========================================================================
  // Reflex Rules
  // ===========================================================================

  async listRules(params?: { trigger_test?: number; is_active?: boolean; action?: string }) {
    const response = await apiClient.get(`${BASE}/rules/`, { params });
    return parseResponse(PaginatedReflexRuleSchema, response.data, {
      context: 'reflexApi.listRules',
    });
  },

  async getRule(id: number): Promise<ReflexRule> {
    const response = await apiClient.get(`${BASE}/rules/${id}/`);
    return parseResponse(ReflexRuleSchema, response.data, {
      context: 'reflexApi.getRule',
    });
  },

  async createRule(data: ReflexRuleCreateData): Promise<ReflexRule> {
    const response = await apiClient.post(`${BASE}/rules/`, data);
    return parseResponse(ReflexRuleSchema, response.data, {
      context: 'reflexApi.createRule',
    });
  },

  async updateRule(id: number, data: Partial<ReflexRuleCreateData>): Promise<ReflexRule> {
    const response = await apiClient.patch(`${BASE}/rules/${id}/`, data);
    return parseResponse(ReflexRuleSchema, response.data, {
      context: 'reflexApi.updateRule',
    });
  },

  async deleteRule(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/rules/${id}/`);
  },

  async seedDefaults(): Promise<{ created: number; message: string }> {
    const response = await apiClient.post(`${BASE}/rules/seed_defaults/`);
    return response.data;
  },

  async evaluate(resultId: number): Promise<ReflexExecution[]> {
    const response = await apiClient.post(`${BASE}/rules/evaluate/`, {
      result_id: resultId,
    });
    return response.data;
  },

  // ===========================================================================
  // Reflex Executions
  // ===========================================================================

  async listExecutions(params?: { status?: string; rule?: number }) {
    const response = await apiClient.get(`${BASE}/executions/`, { params });
    return parseResponse(PaginatedReflexExecutionSchema, response.data, {
      context: 'reflexApi.listExecutions',
    });
  },

  async getExecution(id: number): Promise<ReflexExecution> {
    const response = await apiClient.get(`${BASE}/executions/${id}/`);
    return parseResponse(ReflexExecutionSchema, response.data, {
      context: 'reflexApi.getExecution',
    });
  },

  async approveExecution(id: number, data?: ReflexActionData): Promise<ReflexExecution> {
    const response = await apiClient.post(`${BASE}/executions/${id}/approve/`, data || {});
    return parseResponse(ReflexExecutionSchema, response.data, {
      context: 'reflexApi.approveExecution',
    });
  },

  async rejectExecution(id: number, data?: ReflexActionData): Promise<ReflexExecution> {
    const response = await apiClient.post(`${BASE}/executions/${id}/reject/`, data || {});
    return parseResponse(ReflexExecutionSchema, response.data, {
      context: 'reflexApi.rejectExecution',
    });
  },
};
