/**
 * Counselling API Client
 * Sprint Allied Health - Counselling
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  CounsellingReferralSchema,
  CounsellingSessionSchema,
  CounsellingTypeSchema,
  PaginatedCounsellingReferralListSchema,
  PaginatedCounsellingSessionListSchema,
  PaginatedCounsellingTypeSchema,
} from '@/lib/schemas/counselling.schema';
import type {
  CounsellingReferral,
  CounsellingReferralListItem,
  CounsellingReferralCreateData,
  CounsellingReferralUpdateData,
  CounsellingReferralListParams,
  CounsellingSession,
  CounsellingSessionListItem,
  CounsellingSessionCreateData,
  CounsellingSessionCompleteData,
  CounsellingSessionListParams,
  CounsellingType,
  CounsellingTypeListParams,
} from '@/lib/types/counselling';
import type { PaginatedResponse } from '@/lib/types/allied-health';

const BASE_URL = '/api/counselling';

export const counsellingApi = {
  // ============ Counselling Types ============

  listTypes: async (
    params?: CounsellingTypeListParams
  ): Promise<PaginatedResponse<CounsellingType>> => {
    const response = await apiClient.get(`${BASE_URL}/types/`, { params });
    return parseResponse(PaginatedCounsellingTypeSchema, response.data, {
      context: 'counsellingApi.listTypes',
    });
  },

  getType: async (id: number): Promise<CounsellingType> => {
    const response = await apiClient.get(`${BASE_URL}/types/${id}/`);
    return parseResponse(CounsellingTypeSchema, response.data, {
      context: 'counsellingApi.getType',
    });
  },

  // ============ Referrals ============

  listReferrals: async (
    params?: CounsellingReferralListParams
  ): Promise<PaginatedResponse<CounsellingReferralListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/referrals/`, { params });
    return parseResponse(PaginatedCounsellingReferralListSchema, response.data, {
      context: 'counsellingApi.listReferrals',
    });
  },

  getReferral: async (id: number): Promise<CounsellingReferral> => {
    const response = await apiClient.get(`${BASE_URL}/referrals/${id}/`);
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.getReferral',
    });
  },

  getReferralByNumber: async (referralNumber: string): Promise<CounsellingReferral> => {
    const response = await apiClient.get(`${BASE_URL}/referrals/`, {
      params: { referral_number: referralNumber },
    });
    const paginated = parseResponse(PaginatedCounsellingReferralListSchema, response.data, {
      context: 'counsellingApi.getReferralByNumber',
    });
    const firstResult = paginated.results[0];
    if (!firstResult) {
      throw new Error(`Referral ${referralNumber} not found`);
    }
    return counsellingApi.getReferral(firstResult.id);
  },

  createReferral: async (data: CounsellingReferralCreateData): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/`, data);
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.createReferral',
    });
  },

  updateReferral: async (
    id: number,
    data: CounsellingReferralUpdateData
  ): Promise<CounsellingReferral> => {
    const response = await apiClient.patch(`${BASE_URL}/referrals/${id}/`, data);
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.updateReferral',
    });
  },

  deleteReferral: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/referrals/${id}/`);
  },

  // Referral Actions
  acceptReferral: async (id: number): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/accept/`);
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.acceptReferral',
    });
  },

  rejectReferral: async (id: number, reason?: string): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/reject/`, { reason });
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.rejectReferral',
    });
  },

  assignCounsellor: async (id: number, counsellorId: number): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/assign_counsellor/`, {
      counsellor_id: counsellorId,
    });
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.assignCounsellor',
    });
  },

  generateSessions: async (
    id: number,
    count?: number
  ): Promise<{ sessions_created: number; sessions: CounsellingSessionListItem[] }> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/generate_sessions/`, {
      count,
    });
    return response.data;
  },

  startReferral: async (id: number): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/start/`);
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.startReferral',
    });
  },

  completeReferral: async (id: number): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/complete/`);
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.completeReferral',
    });
  },

  cancelReferral: async (id: number, reason?: string): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/cancel/`, { reason });
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.cancelReferral',
    });
  },

  putReferralOnHold: async (id: number, reason?: string): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/hold/`, { reason });
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.putReferralOnHold',
    });
  },

  resumeReferral: async (id: number): Promise<CounsellingReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/resume/`);
    return parseResponse(CounsellingReferralSchema, response.data, {
      context: 'counsellingApi.resumeReferral',
    });
  },

  // ============ Sessions ============

  listSessions: async (
    params?: CounsellingSessionListParams
  ): Promise<PaginatedResponse<CounsellingSessionListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/sessions/`, { params });
    return parseResponse(PaginatedCounsellingSessionListSchema, response.data, {
      context: 'counsellingApi.listSessions',
    });
  },

  getSession: async (id: number): Promise<CounsellingSession> => {
    const response = await apiClient.get(`${BASE_URL}/sessions/${id}/`);
    return parseResponse(CounsellingSessionSchema, response.data, {
      context: 'counsellingApi.getSession',
    });
  },

  createSession: async (data: CounsellingSessionCreateData): Promise<CounsellingSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/`, data);
    return parseResponse(CounsellingSessionSchema, response.data, {
      context: 'counsellingApi.createSession',
    });
  },

  startSession: async (id: number): Promise<CounsellingSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/start/`);
    return parseResponse(CounsellingSessionSchema, response.data, {
      context: 'counsellingApi.startSession',
    });
  },

  completeSession: async (
    id: number,
    data: CounsellingSessionCompleteData
  ): Promise<CounsellingSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/complete/`, data);
    return parseResponse(CounsellingSessionSchema, response.data, {
      context: 'counsellingApi.completeSession',
    });
  },

  cancelSession: async (id: number, reason?: string): Promise<CounsellingSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/cancel/`, { reason });
    return parseResponse(CounsellingSessionSchema, response.data, {
      context: 'counsellingApi.cancelSession',
    });
  },

  markNoShow: async (id: number): Promise<CounsellingSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/no_show/`);
    return parseResponse(CounsellingSessionSchema, response.data, {
      context: 'counsellingApi.markNoShow',
    });
  },

  rescheduleSession: async (
    id: number,
    newDate: string,
    newTime?: string
  ): Promise<CounsellingSession> => {
    const response = await apiClient.post(`${BASE_URL}/sessions/${id}/reschedule/`, {
      scheduled_date: newDate,
      scheduled_time: newTime,
    });
    return parseResponse(CounsellingSessionSchema, response.data, {
      context: 'counsellingApi.rescheduleSession',
    });
  },

  // ============ Referral Sessions ============

  getReferralSessions: async (
    referralId: number
  ): Promise<PaginatedResponse<CounsellingSessionListItem>> => {
    return counsellingApi.listSessions({ referral_id: referralId });
  },
};
