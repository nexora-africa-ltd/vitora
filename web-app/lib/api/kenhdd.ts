/**
 * KENHDD Compliance API client.
 *
 * DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  KENHDDComplianceScoreSchema,
  KENHDDComplianceSummaryEntrySchema,
  KENHDDDataElementListSchema,
  KENHDDFailedRecordSchema,
  KENHDDRecordResultSchema,
  KENHDDValidationRunDetailSchema,
  KENHDDValidationRunSchema,
} from '@/lib/schemas/kenhdd.schema';
import type {
  KENHDDResourceType,
} from '@/lib/types/kenhdd';
import { z } from 'zod';

export const kenhddApi = {
  /** List KENHDD data elements, optionally filtered by resource type. */
  listElements: async (resourceType?: KENHDDResourceType) => {
    const params = resourceType ? { resource_type: resourceType } : {};
    const response = await apiClient.get('/api/kenhdd/elements/', { params });
    return parseResponse(KENHDDDataElementListSchema, response.data, {
      context: 'kenhddApi.listElements',
    });
  },

  /** Validate a single record against KENHDD elements. */
  validateRecord: async (
    resourceType: KENHDDResourceType,
    recordId: number
  ) => {
    const response = await apiClient.post('/api/kenhdd/compliance/validate-record/', {
      resource_type: resourceType,
      record_id: recordId,
    });
    return parseResponse(KENHDDRecordResultSchema, response.data, {
      context: 'kenhddApi.validateRecord',
    });
  },

  /** Generate a compliance report. */
  generateReport: async (
    resourceType?: KENHDDResourceType,
    sampleSize: number = 100
  ) => {
    const payload: Record<string, unknown> = { sample_size: sampleSize };
    if (resourceType) payload.resource_type = resourceType;
    const response = await apiClient.post('/api/kenhdd/compliance/compliance-report/', payload);
    return parseResponse(z.array(KENHDDComplianceScoreSchema), response.data, {
      context: 'kenhddApi.generateReport',
    });
  },

  /** Get the latest compliance summary per resource type. */
  getSummary: async () => {
    const response = await apiClient.get('/api/kenhdd/compliance/summary/');
    return parseResponse(z.array(KENHDDComplianceSummaryEntrySchema), response.data, {
      context: 'kenhddApi.getSummary',
    });
  },

  /** List past validation runs. */
  listRuns: async (resourceType?: KENHDDResourceType) => {
    const params = resourceType ? { resource_type: resourceType } : {};
    const response = await apiClient.get('/api/kenhdd/compliance/runs/', { params });
    return parseResponse(z.array(KENHDDValidationRunSchema), response.data, {
      context: 'kenhddApi.listRuns',
    });
  },

  /** Export a compliance report. */
  exportReport: async (
    resourceType: KENHDDResourceType,
    format: 'json' | 'csv' = 'json'
  ): Promise<Blob> => {
    const response = await apiClient.post(
      '/api/kenhdd/compliance/export/',
      { resource_type: resourceType, format },
      { responseType: 'blob' }
    );
    return response.data as Blob;
  },

  /** Get detailed info for a specific validation run including failed records. */
  getRunDetail: async (runId: number) => {
    const response = await apiClient.get(`/api/kenhdd/compliance/runs/${runId}/`);
    return parseResponse(KENHDDValidationRunDetailSchema, response.data, {
      context: 'kenhddApi.getRunDetail',
    });
  },

  /** List failed records for a specific validation run. */
  getRunFailures: async (runId: number) => {
    const response = await apiClient.get(`/api/kenhdd/compliance/runs/${runId}/failures/`);
    return parseResponse(z.array(KENHDDFailedRecordSchema), response.data, {
      context: 'kenhddApi.getRunFailures',
    });
  },

  /** Revalidate failed records from a previous run. */
  revalidateFailures: async (runId: number) => {
    const response = await apiClient.post(`/api/kenhdd/compliance/runs/${runId}/revalidate/`);
    return parseResponse(KENHDDValidationRunDetailSchema, response.data, {
      context: 'kenhddApi.revalidateFailures',
    });
  },
};
