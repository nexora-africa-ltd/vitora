import { z } from 'zod';

import type {
  ExternalProcedureOrderRequest,
  ProcedureAvailableSlotsResponse,
  ProcedureCatalogDetail,
  ProcedureOrderListItem,
} from '@/lib/types/procedure';
import type { PaginatedResponse } from '@/lib/types';
import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedProcedureCatalogSchema,
  ProcedureCatalogDetailSchema,
  PaginatedProcedureOrderSchema,
  ExternalProcedureOrderRequestSchema,
  PaginatedExternalProcedureRequestSchema,
  ProcedureDashboardSchema,
} from '@/lib/schemas/procedure.schema';

const ProcedureOrderDetailSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  procedure: z.union([
    z.number(),
    z.object({
      id: z.number(),
      code: z.string(),
      name: z.string(),
    }),
  ]),
  patient: z.number(),
  status: z.enum(['ORDERED', 'CONSENT_PENDING', 'SCHEDULED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  priority: z.enum(['EMERGENCY', 'URGENT', 'ROUTINE', 'ELECTIVE']),
  indication: z.string().optional().default(''),
  clinical_notes: z.string().optional().default(''),
  body_site: z.string().optional().default(''),
  laterality: z.string().optional().default(''),
  scheduled_date: z.string().nullable(),
  scheduled_time: z.string().nullable(),
  scheduled_location: z.string().optional().default(''),
  scheduled_clinic: z.number().nullable(),
  scheduled_clinic_name: z.string().nullable(),
  ordered_at: z.string().optional(),
  is_overdue: z.boolean().optional(),
});

const ProcedureConsentSchema = z.object({
  id: z.number(),
  status: z.enum(['PENDING', 'SIGNED', 'DECLINED', 'WITHDRAWN']),
  consent_type: z.string(),
  consent_text: z.string(),
  procedure_explained: z.boolean(),
  risks_explained: z.boolean(),
  alternatives_explained: z.boolean(),
  questions_answered: z.boolean(),
  signed_by_patient: z.boolean(),
  patient_signed_at: z.string().nullable(),
  signed_by_guardian: z.boolean(),
  guardian_name: z.string(),
  obtained_by: z.number(),
  obtained_at: z.string().nullable(),
});

const ProcedureConsumableSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  quantity: z.number(),
  unit_cost: z.number().nullable(),
  total_cost: z.number().nullable(),
});

const ProcedureOutcomeSchema = z.object({
  id: z.number(),
  assessment_date: z.string(),
  outcome: z.string(),
  findings: z.string(),
  notes: z.string(),
  next_follow_up: z.string().nullable(),
  follow_up_notes: z.string(),
});

const ProcedureAvailableSlotsResponseSchema = z.object({
  slots: z.array(z.object({
    clinic_id: z.number(),
    clinic_name: z.string(),
    date: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    duration_minutes: z.number(),
    available: z.boolean(),
  })),
  message: z.string().optional(),
});

export const proceduresApi = {
  // ---- Catalog ----
  listCatalog: async (params?: Record<string, string>) => {
    const response = await apiClient.get('/api/procedures/catalog/', { params });
    return parseResponse(PaginatedProcedureCatalogSchema, response.data, {
      context: 'proceduresApi.listCatalog',
    });
  },

  getCatalogEntry: async (id: number): Promise<ProcedureCatalogDetail> => {
    const response = await apiClient.get(`/api/procedures/catalog/${id}/`);
    return parseResponse(ProcedureCatalogDetailSchema, response.data, {
      context: 'proceduresApi.getCatalogEntry',
    });
  },

  createCatalogEntry: async (data: Record<string, unknown>): Promise<ProcedureCatalogDetail> => {
    const response = await apiClient.post('/api/procedures/catalog/', data);
    return parseResponse(ProcedureCatalogDetailSchema, response.data, {
      context: 'proceduresApi.createCatalogEntry',
    });
  },

  updateCatalogEntry: async (id: number, data: Record<string, unknown>): Promise<ProcedureCatalogDetail> => {
    const response = await apiClient.patch(`/api/procedures/catalog/${id}/`, data);
    return parseResponse(ProcedureCatalogDetailSchema, response.data, {
      context: 'proceduresApi.updateCatalogEntry',
    });
  },

  // ---- Orders ----
  listOrders: async (
    params?: Record<string, string>
  ): Promise<PaginatedResponse<ProcedureOrderListItem>> => {
    const response = await apiClient.get('/api/procedures/orders/', { params });
    return parseResponse(PaginatedProcedureOrderSchema, response.data, {
      context: 'proceduresApi.listOrders',
    });
  },

  createOrder: async (data: Record<string, unknown>) => {
    const response = await apiClient.post('/api/procedures/orders/', data);
    return parseResponse(ProcedureOrderDetailSchema, response.data, {
      context: 'proceduresApi.createOrder',
    }) as any;
  },

  // ---- External Requests ----
  listExternalRequests: async (
    params?: Record<string, string>
  ): Promise<PaginatedResponse<ExternalProcedureOrderRequest>> => {
    const response = await apiClient.get('/api/procedures/external-requests/', { params });
    return parseResponse(PaginatedExternalProcedureRequestSchema, response.data, {
      context: 'proceduresApi.listExternalRequests',
    });
  },

  createExternalRequest: async (data: Record<string, unknown>): Promise<ExternalProcedureOrderRequest> => {
    const response = await apiClient.post('/api/procedures/external-requests/', data);
    return parseResponse(ExternalProcedureOrderRequestSchema, response.data, {
      context: 'proceduresApi.createExternalRequest',
    });
  },

  acceptExternalRequest: async (id: number): Promise<ExternalProcedureOrderRequest> => {
    const response = await apiClient.post(`/api/procedures/external-requests/${id}/accept/`);
    return parseResponse(ExternalProcedureOrderRequestSchema, response.data, {
      context: 'proceduresApi.acceptExternalRequest',
    });
  },

  rejectExternalRequest: async (id: number, reason: string): Promise<ExternalProcedureOrderRequest> => {
    const response = await apiClient.post(`/api/procedures/external-requests/${id}/reject/`, {
      reason,
    });
    return parseResponse(ExternalProcedureOrderRequestSchema, response.data, {
      context: 'proceduresApi.rejectExternalRequest',
    });
  },

  getOrder: async (id: number) => {
    const response = await apiClient.get(`/api/procedures/orders/${id}/`);
    return parseResponse(ProcedureOrderDetailSchema, response.data, {
      context: 'proceduresApi.getOrder',
    }) as any;
  },

  // ---- Workflow Actions ----
  scheduleOrder: async (
    id: number,
    data: { scheduled_date: string; scheduled_time?: string; scheduled_location?: string; scheduled_clinic?: number | null },
  ) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/schedule/`,
      data,
    );
    return parseResponse(ProcedureOrderDetailSchema, response.data, {
      context: 'proceduresApi.scheduleOrder',
    }) as any;
  },

  rescheduleOrder: async (
    id: number,
    data: { scheduled_date: string; scheduled_time?: string; scheduled_location?: string; scheduled_clinic?: number | null },
  ) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/reschedule/`,
      data,
    );
    return parseResponse(ProcedureOrderDetailSchema, response.data, {
      context: 'proceduresApi.rescheduleOrder',
    }) as any;
  },

  startProcedure: async (id: number, data?: { location?: string }) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/start/`,
      data || {},
    );
    return parseResponse(ProcedureOrderDetailSchema, response.data, {
      context: 'proceduresApi.startProcedure',
    }) as any;
  },

  completeProcedure: async (id: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/complete/`,
      data,
    );
    return parseResponse(ProcedureOrderDetailSchema, response.data, {
      context: 'proceduresApi.completeProcedure',
    }) as any;
  },

  cancelOrder: async (id: number, reason: string) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/cancel/`,
      { reason },
    );
    return parseResponse(ProcedureOrderDetailSchema, response.data, {
      context: 'proceduresApi.cancelOrder',
    }) as any;
  },

  // ---- Consent ----
  getConsent: async (orderId: number) => {
    const response = await apiClient.get(
      `/api/procedures/orders/${orderId}/consent/`,
    );
    return parseResponse(ProcedureConsentSchema, response.data, {
      context: 'proceduresApi.getConsent',
    });
  },

  createConsent: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consent/create/`,
      data,
    );
    return parseResponse(ProcedureConsentSchema, response.data, {
      context: 'proceduresApi.createConsent',
    });
  },

  signConsent: async (orderId: number) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consent/sign/`,
    );
    return parseResponse(ProcedureConsentSchema, response.data, {
      context: 'proceduresApi.signConsent',
    });
  },

  declineConsent: async (orderId: number, reason?: string) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consent/decline/`,
      { reason: reason || '' },
    );
    return parseResponse(ProcedureConsentSchema, response.data, {
      context: 'proceduresApi.declineConsent',
    });
  },

  // ---- Consumables ----
  listConsumables: async (orderId: number) => {
    const response = await apiClient.get(
      `/api/procedures/orders/${orderId}/consumables/`,
    );
    return parseResponse(z.array(ProcedureConsumableSchema), response.data, {
      context: 'proceduresApi.listConsumables',
    });
  },

  addConsumable: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consumables/add/`,
      data,
    );
    return parseResponse(ProcedureConsumableSchema, response.data, {
      context: 'proceduresApi.addConsumable',
    });
  },

  // ---- Outcomes ----
  listOutcomes: async (orderId: number) => {
    const response = await apiClient.get(
      `/api/procedures/orders/${orderId}/outcomes/`,
    );
    return parseResponse(z.array(ProcedureOutcomeSchema), response.data, {
      context: 'proceduresApi.listOutcomes',
    });
  },

  addOutcome: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/outcomes/add/`,
      data,
    );
    return parseResponse(ProcedureOutcomeSchema, response.data, {
      context: 'proceduresApi.addOutcome',
    });
  },

  // ---- Dashboard ----
  getDashboard: async () => {
    const response = await apiClient.get('/api/procedures/dashboard/');
    return parseResponse(ProcedureDashboardSchema, response.data, {
      context: 'proceduresApi.getDashboard',
    });
  },

  // ---- Slot Discovery ----
  getAvailableSlots: async (catalogId: number, date: string): Promise<ProcedureAvailableSlotsResponse> => {
    const response = await apiClient.get(
      `/api/procedures/catalog/${catalogId}/available-slots/`,
      { params: { date } },
    );
    return parseResponse(ProcedureAvailableSlotsResponseSchema, response.data, {
      context: 'proceduresApi.getAvailableSlots',
    });
  },
};
