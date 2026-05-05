/**
 * HL7 endpoint and message API client.
 *
 * CRUD for facility-scoped HL7 endpoints + read-only message monitoring.
 * Backend: hmis/apps/hl7/ (views.py, serializers.py)
 * Endpoints: /api/hl7/endpoints/... , /api/hl7/messages/...
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  HL7EndpointSchema,
  HL7EndpointTestResultSchema,
  HL7MessageSchema,
  PaginatedHL7EndpointSchema,
  PaginatedHL7MessageSchema,
  HL7MessageStatsSchema,
} from '@/lib/schemas/hl7.schema';
import type {
  HL7Endpoint,
  HL7EndpointListItem,
  HL7EndpointListParams,
  HL7EndpointPayload,
  HL7EndpointTestResult,
  HL7Message,
  HL7MessageListItem,
  HL7MessageListParams,
  HL7MessageStats,
} from '@/lib/types/hl7';
import type { PaginatedResponse } from '@/lib/types';

// =============================================================================
// ENDPOINT API
// =============================================================================

export const hl7EndpointApi = {
  /**
   * List HL7 endpoints for the current facility.
   */
  async list(params?: HL7EndpointListParams): Promise<PaginatedResponse<HL7EndpointListItem>> {
    const response = await apiClient.get('/api/hl7/endpoints/', { params });
    return parseResponse(PaginatedHL7EndpointSchema, response.data, {
      context: 'hl7EndpointApi.list',
    });
  },

  /**
   * Get full endpoint detail.
   */
  async get(id: number): Promise<HL7Endpoint> {
    const response = await apiClient.get(`/api/hl7/endpoints/${id}/`);
    return parseResponse(HL7EndpointSchema, response.data, {
      context: 'hl7EndpointApi.get',
    });
  },

  /**
   * Create a new HL7 endpoint.
   */
  async create(data: HL7EndpointPayload): Promise<HL7Endpoint> {
    const response = await apiClient.post('/api/hl7/endpoints/', data);
    return parseResponse(HL7EndpointSchema, response.data, {
      context: 'hl7EndpointApi.create',
    });
  },

  /**
   * Update an existing HL7 endpoint.
   */
  async update(id: number, data: Partial<HL7EndpointPayload>): Promise<HL7Endpoint> {
    const response = await apiClient.patch(`/api/hl7/endpoints/${id}/`, data);
    return parseResponse(HL7EndpointSchema, response.data, {
      context: 'hl7EndpointApi.update',
    });
  },

  /**
   * Delete an HL7 endpoint.
   */
  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/hl7/endpoints/${id}/`);
  },

  /**
   * Test connectivity to an endpoint (TCP connection test).
   */
  async testConnection(id: number): Promise<HL7EndpointTestResult> {
    const response = await apiClient.post(`/api/hl7/endpoints/${id}/test_connection/`);
    return parseResponse(HL7EndpointTestResultSchema, response.data, {
      context: 'hl7EndpointApi.testConnection',
    });
  },

  /**
   * Toggle endpoint active/inactive status.
   */
  async toggleActive(id: number): Promise<HL7Endpoint> {
    const response = await apiClient.post(`/api/hl7/endpoints/${id}/toggle_active/`);
    return parseResponse(HL7EndpointSchema, response.data, {
      context: 'hl7EndpointApi.toggleActive',
    });
  },
};

// =============================================================================
// MESSAGE API
// =============================================================================

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
