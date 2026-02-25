/**
 * Occupational Therapy API Client
 * Sprint Allied Health - Occupational Therapy
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  OTOrderSchema,
  OTSessionSchema,
  OTTreatmentTypeSchema,
  PaginatedOTOrderListSchema,
  PaginatedOTSessionListSchema,
  PaginatedOTTreatmentTypeSchema,
} from '@/lib/schemas/occupational-therapy.schema';
import type {
  OTOrder,
  OTOrderListItem,
  OTOrderCreateData,
  OTOrderUpdateData,
  OTOrderListParams,
  OTSession,
  OTSessionListItem,
  OTSessionCreateData,
  OTSessionCompleteData,
  OTSessionListParams,
  OTTreatmentType,
  OTTreatmentTypeListParams,
} from '@/lib/types/occupational-therapy';
import type { PaginatedResponse } from '@/lib/types/allied-health';

const BASE_URL = '/api/occupational-therapy';

export const occupationalTherapyApi = {
  // ============ Treatment Types ============

  listTreatmentTypes: async (
    params?: OTTreatmentTypeListParams
  ): Promise<PaginatedResponse<OTTreatmentType>> => {
    const response = await apiClient.get(`${BASE_URL}/treatment-types/`, { params });
    return parseResponse(PaginatedOTTreatmentTypeSchema, response.data, {
      context: 'occupationalTherapyApi.listTreatmentTypes',
    });
  },

  getTreatmentType: async (id: number): Promise<OTTreatmentType> => {
    const response = await apiClient.get(`${BASE_URL}/treatment-types/${id}/`);
    return parseResponse(OTTreatmentTypeSchema, response.data, {
      context: 'occupationalTherapyApi.getTreatmentType',
    });
  },

  // ============ Orders ============

  listOrders: async (params?: OTOrderListParams): Promise<PaginatedResponse<OTOrderListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/orders/`, { params });
    return parseResponse(PaginatedOTOrderListSchema, response.data, {
      context: 'occupationalTherapyApi.listOrders',
    });
  },

  getOrder: async (id: number): Promise<OTOrder> => {
    const response = await apiClient.get(`${BASE_URL}/orders/${id}/`);
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.getOrder',
    });
  },

  getOrderByNumber: async (orderNumber: string): Promise<OTOrder> => {
    const response = await apiClient.get(`${BASE_URL}/orders/`, {
      params: { order_number: orderNumber },
    });
    const paginated = parseResponse(PaginatedOTOrderListSchema, response.data, {
      context: 'occupationalTherapyApi.getOrderByNumber',
    });
    const firstResult = paginated.results[0];
    if (!firstResult) {
      throw new Error(`Order ${orderNumber} not found`);
    }
    return occupationalTherapyApi.getOrder(firstResult.id);
  },

  createOrder: async (data: OTOrderCreateData): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/`, data);
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.createOrder',
    });
  },

  updateOrder: async (id: number, data: OTOrderUpdateData): Promise<OTOrder> => {
    const response = await apiClient.patch(`${BASE_URL}/orders/${id}/`, data);
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.updateOrder',
    });
  },

  deleteOrder: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/orders/${id}/`);
  },

  // Order Actions
  approveOrder: async (id: number): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/approve/`);
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.approveOrder',
    });
  },

  rejectOrder: async (id: number, reason?: string): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/reject/`, { reason });
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.rejectOrder',
    });
  },

  assignTherapist: async (id: number, therapistId: number): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/assign_therapist/`, {
      therapist_id: therapistId,
    });
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.assignTherapist',
    });
  },

  generateSessions: async (
    id: number,
    count?: number
  ): Promise<{ sessions_created: number; sessions: OTSessionListItem[] }> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/generate_sessions/`, {
      count,
    });
    return response.data;
  },

  startOrder: async (id: number): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/start/`);
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.startOrder',
    });
  },

  completeOrder: async (id: number): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/complete/`);
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.completeOrder',
    });
  },

  cancelOrder: async (id: number, reason?: string): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/cancel/`, { reason });
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.cancelOrder',
    });
  },

  putOrderOnHold: async (id: number, reason?: string): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/hold/`, { reason });
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.putOrderOnHold',
    });
  },

  resumeOrder: async (id: number): Promise<OTOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/resume/`);
    return parseResponse(OTOrderSchema, response.data, {
      context: 'occupationalTherapyApi.resumeOrder',
    });
  },

  // ============ Sessions ============

  listSessions: async (
    params?: OTSessionListParams
  ): Promise<PaginatedResponse<OTSessionListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/sessions/`, { params });
    return parseResponse(PaginatedOTSessionListSchema, response.data, {
      context: 'occupationalTherapyApi.listSessions',
    });
  },

  getSession: async (id: number): Promise<OTSession> => {
    const response = await apiClient.get(`${BASE_URL}/sessions/${id}/`);
    return parseResponse(OTSessionSchema, response.data, {
      context: 'occupationalTherapyApi.getSession',
    });
  },

  createSession: async (data: OTSessionCreateData): Promise<OTSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/`, data);
    return parseResponse(OTSessionSchema, response.data, {
      context: 'occupationalTherapyApi.createSession',
    });
  },

  startSession: async (id: number): Promise<OTSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/start/`);
    return parseResponse(OTSessionSchema, response.data, {
      context: 'occupationalTherapyApi.startSession',
    });
  },

  completeSession: async (id: number, data: OTSessionCompleteData): Promise<OTSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/complete/`, data);
    return parseResponse(OTSessionSchema, response.data, {
      context: 'occupationalTherapyApi.completeSession',
    });
  },

  cancelSession: async (id: number, reason?: string): Promise<OTSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/cancel/`, { reason });
    return parseResponse(OTSessionSchema, response.data, {
      context: 'occupationalTherapyApi.cancelSession',
    });
  },

  markNoShow: async (id: number): Promise<OTSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/no_show/`);
    return parseResponse(OTSessionSchema, response.data, {
      context: 'occupationalTherapyApi.markNoShow',
    });
  },

  rescheduleSession: async (
    id: number,
    newDate: string,
    newTime?: string
  ): Promise<OTSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/reschedule/`, {
      scheduled_date: newDate,
      scheduled_time: newTime,
    });
    return parseResponse(OTSessionSchema, response.data, {
      context: 'occupationalTherapyApi.rescheduleSession',
    });
  },

  // ============ Order Sessions ============

  getOrderSessions: async (orderId: number): Promise<PaginatedResponse<OTSessionListItem>> => {
    return occupationalTherapyApi.listSessions({ order_id: orderId });
  },
};
