/**
 * HL7 message monitoring API client.
 *
 * Read-only access to HL7 v2 messages with retry action for admins.
 * Backend: hmis/apps/hl7/ (views.py, serializers.py)
 * Endpoints: /api/hl7/messages/...
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  HL7MessageSchema,
  PaginatedHL7MessageSchema,
  HL7MessageStatsSchema,
} from '@/lib/schemas/hl7.schema';
import type {
  HL7Message,
  HL7MessageListItem,
  HL7MessageListParams,
  HL7MessageStats,
} from '@/lib/types/hl7';
import type { PaginatedResponse } from '@/lib/types';

export const hl7Api = {
  /**
   * List HL7 messages with optional filters.
   */
  async list(params?: HL7MessageListParams): Promise<PaginatedResponse<HL7MessageListItem>> {
    const response = await apiClient.get('/api/hl7/messages/', { params });
    return parseResponse(PaginatedHL7MessageSchema, response.data, {
      context: 'hl7Api.list',
    });
  },

  /**
   * Get full HL7 message detail including raw message.
   */
  async get(id: number): Promise<HL7Message> {
    const response = await apiClient.get(`/api/hl7/messages/${id}/`);
    return parseResponse(HL7MessageSchema, response.data, {
      context: 'hl7Api.get',
    });
  },

  /**
   * Retry sending a failed HL7 message (admin only).
   */
  async retry(id: number): Promise<HL7Message> {
    const response = await apiClient.post(`/api/hl7/messages/${id}/retry/`);
    return parseResponse(HL7MessageSchema, response.data, {
      context: 'hl7Api.retry',
    });
  },

  /**
   * Get HL7 message statistics by status.
   */
  async getStats(): Promise<HL7MessageStats> {
    const response = await apiClient.get('/api/hl7/messages/stats/');
    return parseResponse(HL7MessageStatsSchema, response.data, {
      context: 'hl7Api.getStats',
    });
  },
};
