/**
 * Referrals API Client
 * Unified referral system for all service types.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  ClinicalReferralSchema,
  ClinicalReferralListItemSchema,
  EncounterReferralItemSchema,
  PaginatedReferralListSchema,
  ReferralStatsSchema,
} from '@/lib/schemas/referral.schema';
import type {
  ClinicalReferral,
  ClinicalReferralListItem,
  EncounterReferralItem,
  ReferralCreateData,
  ReferralListParams,
  ReferralStats,
  PaginatedReferralResponse,
} from '@/lib/types/referral';
import { z } from 'zod';

const BASE_URL = '/api/referrals';

export const referralsApi = {
  // ============ CRUD ============

  /** List referrals with filtering/pagination */
  list: async (params?: ReferralListParams): Promise<PaginatedReferralResponse> => {
    const response = await apiClient.get(`${BASE_URL}/`, { params });
    return parseResponse(PaginatedReferralListSchema, response.data, {
      context: 'referralsApi.list',
    });
  },

  /** Get single referral detail */
  get: async (id: number): Promise<ClinicalReferral> => {
    const response = await apiClient.get(`${BASE_URL}/${id}/`);
    return parseResponse(ClinicalReferralSchema, response.data, {
      context: 'referralsApi.get',
    });
  },

  /** Create a new referral */
  create: async (data: ReferralCreateData): Promise<ClinicalReferral> => {
    const response = await apiClient.post(`${BASE_URL}/`, data);
    return parseResponse(ClinicalReferralSchema, response.data, {
      context: 'referralsApi.create',
    });
  },

  /** Update a referral (only non-terminal) */
  update: async (
    id: number,
    data: Partial<ReferralCreateData>
  ): Promise<ClinicalReferral> => {
    const response = await apiClient.patch(`${BASE_URL}/${id}/`, data);
    return parseResponse(ClinicalReferralSchema, response.data, {
      context: 'referralsApi.update',
    });
  },

  /** Delete a referral (only DRAFT status) */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/${id}/`);
  },

  // ============ Status Actions ============

  /** Accept a referral */
  accept: async (id: number, notes?: string): Promise<ClinicalReferral> => {
    const response = await apiClient.post(`${BASE_URL}/${id}/accept/`, {
      notes: notes || '',
    });
    return parseResponse(ClinicalReferralSchema, response.data, {
      context: 'referralsApi.accept',
    });
  },

  /** Decline a referral with reason */
  decline: async (id: number, reason: string): Promise<ClinicalReferral> => {
    const response = await apiClient.post(`${BASE_URL}/${id}/decline/`, {
      reason,
    });
    return parseResponse(ClinicalReferralSchema, response.data, {
      context: 'referralsApi.decline',
    });
  },

  /** Cancel a referral */
  cancel: async (id: number, reason?: string): Promise<ClinicalReferral> => {
    const response = await apiClient.post(`${BASE_URL}/${id}/cancel/`, {
      reason: reason || '',
    });
    return parseResponse(ClinicalReferralSchema, response.data, {
      context: 'referralsApi.cancel',
    });
  },

  // ============ Encounter-Scoped ============

  /** List referrals for a specific encounter */
  forEncounter: async (encounterId: number): Promise<EncounterReferralItem[]> => {
    const response = await apiClient.get(
      `${BASE_URL}/for-encounter/${encounterId}/`
    );
    return parseResponse(z.array(EncounterReferralItemSchema), response.data, {
      context: 'referralsApi.forEncounter',
    });
  },

  // ============ Queue / My ============

  /** List pending referrals (for receiving services) */
  pending: async (params?: {
    target_service?: string;
    referral_type?: string;
  }): Promise<PaginatedReferralResponse> => {
    const response = await apiClient.get(`${BASE_URL}/pending/`, { params });
    return parseResponse(PaginatedReferralListSchema, response.data, {
      context: 'referralsApi.pending',
    });
  },

  /** List referrals created by current user */
  myReferrals: async (): Promise<PaginatedReferralResponse> => {
    const response = await apiClient.get(`${BASE_URL}/my-referrals/`);
    return parseResponse(PaginatedReferralListSchema, response.data, {
      context: 'referralsApi.myReferrals',
    });
  },

  // ============ Stats ============

  /** Get referral statistics */
  stats: async (params?: {
    from_date?: string;
    to_date?: string;
  }): Promise<ReferralStats> => {
    const response = await apiClient.get(`${BASE_URL}/stats/`, { params });
    return parseResponse(ReferralStatsSchema, response.data, {
      context: 'referralsApi.stats',
    });
  },
};
