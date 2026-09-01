/**
 * Dialysis API client
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import type {
  VascularAccess,
  VascularAccessCreateData,
  VascularAccessListParams,
  DialysisOrder,
  DialysisOrderCreateData,
  DialysisOrderListParams,
  DialysisSession,
  DialysisSessionCreateData,
  DialysisSessionListParams,
} from '@/lib/types/dialysis';
import type { PaginatedResponse } from '@/lib/types';

const VascularAccessSchema = z.object({
  id: z.number(),
  patient: z.number(),
  access_type: z.enum(['AVF', 'AVG', 'CVC_TEMPORARY', 'CVC_TUNNELED', 'PD_CATHETER']),
  status: z.enum(['ACTIVE', 'MATURING', 'FAILED', 'REMOVED', 'INFECTED']),
  site: z.string(),
  placed_date: z.string(),
  placed_by: z.number().nullable(),
  last_assessment_date: z.string().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const DialysisOrderSchema = z.object({
  id: z.number(),
  patient: z.number(),
  ordered_by: z.number(),
  vascular_access: z.number().nullable(),
  dialysis_type: z.enum(['HEMODIALYSIS', 'PERITONEAL', 'CRRT']),
  frequency: z.enum(['TWICE_WEEKLY', 'THRICE_WEEKLY', 'DAILY', 'AS_NEEDED']),
  status: z.enum(['ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED']),
  target_duration_minutes: z.number(),
  blood_flow_rate: z.number(),
  dialysate_flow_rate: z.number(),
  target_uf_volume: z.number().nullable(),
  dialysate_composition: z.string(),
  anticoagulation: z.string(),
  dry_weight_kg: z.number().nullable(),
  clinical_indication: z.string(),
  notes: z.string(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const DialysisSessionSchema = z.object({
  id: z.number(),
  session_number: z.string(),
  patient: z.number(),
  order: z.number().nullable(),
  encounter: z.number().nullable(),
  vascular_access: z.number().nullable(),
  dialysis_type: z.enum(['HEMODIALYSIS', 'PERITONEAL', 'CRRT']),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ABORTED']),
  scheduled_date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  actual_duration_minutes: z.number().nullable(),
  blood_flow_rate: z.number().nullable(),
  dialysate_flow_rate: z.number().nullable(),
  uf_goal_ml: z.number().nullable(),
  uf_achieved_ml: z.number().nullable(),
  pre_weight_kg: z.number().nullable(),
  pre_bp: z.string(),
  pre_pulse: z.number().nullable(),
  pre_temperature: z.number().nullable(),
  post_weight_kg: z.number().nullable(),
  post_bp: z.string(),
  post_pulse: z.number().nullable(),
  complications: z.string(),
  machine_number: z.string(),
  performed_by: z.number().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

function paginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });
}

const PaginatedVascularAccessSchema = paginatedSchema(VascularAccessSchema);
const PaginatedDialysisOrderSchema = paginatedSchema(DialysisOrderSchema);
const PaginatedDialysisSessionSchema = paginatedSchema(DialysisSessionSchema);

function buildParams<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

export const dialysisApi = {
  // Vascular Access
  async listAccesses(
    params: VascularAccessListParams = {}
  ): Promise<PaginatedResponse<VascularAccess>> {
    const response = await apiClient.get(`/api/dialysis/accesses/${buildParams(params)}`);
    return parseResponse(PaginatedVascularAccessSchema, response.data, {
      context: 'dialysisApi.listAccesses',
    });
  },

  async getAccess(id: number): Promise<VascularAccess> {
    const response = await apiClient.get(`/api/dialysis/accesses/${id}/`);
    return parseResponse(VascularAccessSchema, response.data, { context: 'dialysisApi.getAccess' });
  },

  async createAccess(data: VascularAccessCreateData): Promise<VascularAccess> {
    const response = await apiClient.post('/api/dialysis/accesses/', data);
    return parseResponse(VascularAccessSchema, response.data, {
      context: 'dialysisApi.createAccess',
    });
  },

  async updateAccess(id: number, data: Partial<VascularAccessCreateData>): Promise<VascularAccess> {
    const response = await apiClient.patch(`/api/dialysis/accesses/${id}/`, data);
    return parseResponse(VascularAccessSchema, response.data, {
      context: 'dialysisApi.updateAccess',
    });
  },

  // Orders
  async listOrders(
    params: DialysisOrderListParams = {}
  ): Promise<PaginatedResponse<DialysisOrder>> {
    const response = await apiClient.get(`/api/dialysis/orders/${buildParams(params)}`);
    return parseResponse(PaginatedDialysisOrderSchema, response.data, {
      context: 'dialysisApi.listOrders',
    });
  },

  async getOrder(id: number): Promise<DialysisOrder> {
    const response = await apiClient.get(`/api/dialysis/orders/${id}/`);
    return parseResponse(DialysisOrderSchema, response.data, { context: 'dialysisApi.getOrder' });
  },

  async createOrder(data: DialysisOrderCreateData): Promise<DialysisOrder> {
    const response = await apiClient.post('/api/dialysis/orders/', data);
    return parseResponse(DialysisOrderSchema, response.data, {
      context: 'dialysisApi.createOrder',
    });
  },

  async suspendOrder(id: number): Promise<DialysisOrder> {
    const response = await apiClient.post(`/api/dialysis/orders/${id}/suspend/`);
    return parseResponse(DialysisOrderSchema, response.data, {
      context: 'dialysisApi.suspendOrder',
    });
  },

  async resumeOrder(id: number): Promise<DialysisOrder> {
    const response = await apiClient.post(`/api/dialysis/orders/${id}/resume/`);
    return parseResponse(DialysisOrderSchema, response.data, {
      context: 'dialysisApi.resumeOrder',
    });
  },

  // Sessions
  async listSessions(
    params: DialysisSessionListParams = {}
  ): Promise<PaginatedResponse<DialysisSession>> {
    const response = await apiClient.get(`/api/dialysis/sessions/${buildParams(params)}`);
    return parseResponse(PaginatedDialysisSessionSchema, response.data, {
      context: 'dialysisApi.listSessions',
    });
  },

  async getSession(id: number): Promise<DialysisSession> {
    const response = await apiClient.get(`/api/dialysis/sessions/${id}/`);
    return parseResponse(DialysisSessionSchema, response.data, {
      context: 'dialysisApi.getSession',
    });
  },

  async createSession(data: DialysisSessionCreateData): Promise<DialysisSession> {
    const response = await apiClient.post('/api/dialysis/sessions/', data);
    return parseResponse(DialysisSessionSchema, response.data, {
      context: 'dialysisApi.createSession',
    });
  },

  async startSession(id: number): Promise<DialysisSession> {
    const response = await apiClient.post(`/api/dialysis/sessions/${id}/start/`);
    return parseResponse(DialysisSessionSchema, response.data, {
      context: 'dialysisApi.startSession',
    });
  },

  async completeSession(
    id: number,
    postVitals?: Record<string, unknown>
  ): Promise<DialysisSession> {
    const response = await apiClient.post(
      `/api/dialysis/sessions/${id}/complete/`,
      postVitals || {}
    );
    return parseResponse(DialysisSessionSchema, response.data, {
      context: 'dialysisApi.completeSession',
    });
  },

  async abortSession(id: number, reason: string): Promise<DialysisSession> {
    const response = await apiClient.post(`/api/dialysis/sessions/${id}/abort/`, { reason });
    return parseResponse(DialysisSessionSchema, response.data, {
      context: 'dialysisApi.abortSession',
    });
  },
};
