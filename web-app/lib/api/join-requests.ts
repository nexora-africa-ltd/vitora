/**
 * Join Requests API Client
 * Manage organization join requests (create, approve, reject, cancel)
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  OrgJoinRequestSchema,
  PaginatedJoinRequestSchema,
} from '@/lib/schemas/membership.schema';
import { MessageResponseSchema } from '@/lib/schemas/onboarding.schema';
import type { PaginatedResponse } from '@/lib/types';
import type {
  OrgJoinRequest,
  JoinRequestCreateData,
  JoinRequestApproveData,
  JoinRequestRejectData,
  JoinRequestListParams,
} from '@/lib/types/membership';

// =============================================================================
// Join Requests API (Authenticated)
// =============================================================================

export const joinRequestsApi = {
  /** List join requests. Admins see org requests; regular users see own. */
  list: async (params?: JoinRequestListParams): Promise<PaginatedResponse<OrgJoinRequest>> => {
    const response = await apiClient.get('/api/core/join-requests/', { params });
    return parseResponse(PaginatedJoinRequestSchema, response.data, { context: 'joinRequestsApi.list' });
  },

  /** Create a new join request */
  create: async (data: JoinRequestCreateData): Promise<OrgJoinRequest> => {
    const response = await apiClient.post('/api/core/join-requests/', data);
    return parseResponse(OrgJoinRequestSchema, response.data, { context: 'joinRequestsApi.create' });
  },

  /** Approve a join request (admin only) */
  approve: async (id: number, data: JoinRequestApproveData): Promise<OrgJoinRequest> => {
    const response = await apiClient.post(`/api/core/join-requests/${id}/approve/`, data);
    return parseResponse(OrgJoinRequestSchema, response.data, { context: 'joinRequestsApi.approve' });
  },

  /** Reject a join request (admin only) */
  reject: async (id: number, data?: JoinRequestRejectData): Promise<OrgJoinRequest> => {
    const response = await apiClient.post(`/api/core/join-requests/${id}/reject/`, data ?? {});
    return parseResponse(OrgJoinRequestSchema, response.data, { context: 'joinRequestsApi.reject' });
  },

  /** Cancel own join request */
  cancel: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.post(`/api/core/join-requests/${id}/cancel/`);
    return parseResponse(MessageResponseSchema, response.data, { context: 'joinRequestsApi.cancel' });
  },
};
