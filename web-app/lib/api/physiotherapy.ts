/**
 * Physiotherapy API Client
 * Sprint Allied Health - Physiotherapy
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PhysiotherapyOrderSchema,
  PhysiotherapySessionSchema,
  PhysiotherapyTreatmentTypeSchema,
  PaginatedPhysiotherapyOrderListSchema,
  PaginatedPhysiotherapySessionListSchema,
  PaginatedPhysiotherapyTreatmentTypeSchema,
  PhysiotherapyOrderListItemSchema,
  PhysiotherapySessionListItemSchema,
} from '@/lib/schemas/physiotherapy.schema';
import type {
  PhysiotherapyOrder,
  PhysiotherapyOrderListItem,
  PhysiotherapyOrderCreateData,
  PhysiotherapyOrderUpdateData,
  PhysiotherapyOrderListParams,
  PhysiotherapySession,
  PhysiotherapySessionListItem,
  PhysiotherapySessionCreateData,
  PhysiotherapySessionCompleteData,
  PhysiotherapySessionListParams,
  PhysiotherapyTreatmentType,
  PhysiotherapyTreatmentTypeListParams,
} from '@/lib/types/physiotherapy';
import type { PaginatedResponse } from '@/lib/types/allied-health';

const BASE_URL = '/api/physiotherapy';

export const physiotherapyApi = {
  // ============ Treatment Types ============

  listTreatmentTypes: async (
    params?: PhysiotherapyTreatmentTypeListParams
  ): Promise<PaginatedResponse<PhysiotherapyTreatmentType>> => {
    const response = await apiClient.get(`${BASE_URL}/treatment-types/`, { params });
    return parseResponse(PaginatedPhysiotherapyTreatmentTypeSchema, response.data, {
      context: 'physiotherapyApi.listTreatmentTypes',
    });
  },

  getTreatmentType: async (id: number): Promise<PhysiotherapyTreatmentType> => {
    const response = await apiClient.get(`${BASE_URL}/treatment-types/${id}/`);
    return parseResponse(PhysiotherapyTreatmentTypeSchema, response.data, {
      context: 'physiotherapyApi.getTreatmentType',
    });
  },

  // ============ Orders ============

  listOrders: async (
    params?: PhysiotherapyOrderListParams
  ): Promise<PaginatedResponse<PhysiotherapyOrderListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/orders/`, { params });
    return parseResponse(PaginatedPhysiotherapyOrderListSchema, response.data, {
      context: 'physiotherapyApi.listOrders',
    });
  },

  getOrder: async (id: number): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.get(`${BASE_URL}/orders/${id}/`);
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.getOrder',
    });
  },

  getOrderByNumber: async (orderNumber: string): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.get(`${BASE_URL}/orders/`, {
      params: { order_number: orderNumber },
    });
    const paginated = parseResponse(PaginatedPhysiotherapyOrderListSchema, response.data, {
      context: 'physiotherapyApi.getOrderByNumber',
    });
    const firstResult = paginated.results[0];
    if (!firstResult) {
      throw new Error(`Order ${orderNumber} not found`);
    }
    // Get full details
    return physiotherapyApi.getOrder(firstResult.id);
  },

  createOrder: async (data: PhysiotherapyOrderCreateData): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/`, data);
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.createOrder',
    });
  },

  updateOrder: async (
    id: number,
    data: PhysiotherapyOrderUpdateData
  ): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.patch(`${BASE_URL}/orders/${id}/`, data);
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.updateOrder',
    });
  },

  deleteOrder: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/orders/${id}/`);
  },

  // Order Actions
  approveOrder: async (id: number): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/approve/`);
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.approveOrder',
    });
  },

  rejectOrder: async (id: number, reason?: string): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/reject/`, { reason });
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.rejectOrder',
    });
  },

  assignTherapist: async (id: number, therapistId: number): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/assign_therapist/`, {
      therapist_id: therapistId,
    });
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.assignTherapist',
    });
  },

  generateSessions: async (
    id: number,
    count?: number
  ): Promise<{ sessions_created: number; sessions: PhysiotherapySessionListItem[] }> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/generate_sessions/`, {
      count,
    });
    return response.data;
  },

  startOrder: async (id: number): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/start/`);
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.startOrder',
    });
  },

  completeOrder: async (id: number): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/complete/`);
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.completeOrder',
    });
  },

  cancelOrder: async (id: number, reason?: string): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/cancel/`, { reason });
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.cancelOrder',
    });
  },

  putOrderOnHold: async (id: number, reason?: string): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/hold/`, { reason });
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.putOrderOnHold',
    });
  },

  resumeOrder: async (id: number): Promise<PhysiotherapyOrder> => {
    const response = await apiClient.post(`${BASE_URL}/orders/${id}/resume/`);
    return parseResponse(PhysiotherapyOrderSchema, response.data, {
      context: 'physiotherapyApi.resumeOrder',
    });
  },

  // ============ Sessions ============

  listSessions: async (
    params?: PhysiotherapySessionListParams
  ): Promise<PaginatedResponse<PhysiotherapySessionListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/sessions/`, { params });
    return parseResponse(PaginatedPhysiotherapySessionListSchema, response.data, {
      context: 'physiotherapyApi.listSessions',
    });
  },

  getSession: async (id: number): Promise<PhysiotherapySession> => {
    const response = await apiClient.get(`${BASE_URL}/sessions/${id}/`);
    return parseResponse(PhysiotherapySessionSchema, response.data, {
      context: 'physiotherapyApi.getSession',
    });
  },

  createSession: async (data: PhysiotherapySessionCreateData): Promise<PhysiotherapySession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/`, data);
    return parseResponse(PhysiotherapySessionSchema, response.data, {
      context: 'physiotherapyApi.createSession',
    });
  },

  startSession: async (id: number): Promise<PhysiotherapySession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/start/`);
    return parseResponse(PhysiotherapySessionSchema, response.data, {
      context: 'physiotherapyApi.startSession',
    });
  },

  completeSession: async (
    id: number,
    data: PhysiotherapySessionCompleteData
  ): Promise<PhysiotherapySession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/complete/`, data);
    return parseResponse(PhysiotherapySessionSchema, response.data, {
      context: 'physiotherapyApi.completeSession',
    });
  },

  cancelSession: async (id: number, reason?: string): Promise<PhysiotherapySession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/cancel/`, { reason });
    return parseResponse(PhysiotherapySessionSchema, response.data, {
      context: 'physiotherapyApi.cancelSession',
    });
  },

  markNoShow: async (id: number): Promise<PhysiotherapySession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/no_show/`);
    return parseResponse(PhysiotherapySessionSchema, response.data, {
      context: 'physiotherapyApi.markNoShow',
    });
  },

  rescheduleSession: async (
    id: number,
    newDate: string,
    newTime?: string
  ): Promise<PhysiotherapySession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/reschedule/`, {
      scheduled_date: newDate,
      scheduled_time: newTime,
    });
    return parseResponse(PhysiotherapySessionSchema, response.data, {
      context: 'physiotherapyApi.rescheduleSession',
    });
  },

  // ============ Order Sessions ============

  getOrderSessions: async (
    orderId: number
  ): Promise<PaginatedResponse<PhysiotherapySessionListItem>> => {
    return physiotherapyApi.listSessions({ order_id: orderId });
  },
};
