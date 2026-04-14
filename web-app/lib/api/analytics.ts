/**
 * Analytics API client.
 *
 * Endpoints: /api/analytics/
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedFacilitySummarySchema,
  PaginatedDepartmentSummarySchema,
  PaginatedDiagnosisTrendSchema,
  PaginatedDemographicSnapshotSchema,
  MetabaseEmbedResponseSchema,
} from '@/lib/schemas/analytics.schema';
import type { PaginatedResponse } from '@/lib/types';
import type {
  FacilityDailySummary,
  DepartmentMonthlySummary,
  DiagnosisTrend,
  PatientDemographicSnapshot,
  FacilitySummaryParams,
  DepartmentPerformanceParams,
  DiagnosisTrendParams,
  MetabaseResourceType,
  MetabaseEmbedResponse,
  MetabaseDashboardInfo,
} from '@/lib/types/analytics';

export const analyticsApi = {
  /**
   * Facility daily summaries.
   * Filterable by date_from, date_to.
   */
  getFacilitySummary: async (
    params?: FacilitySummaryParams
  ): Promise<PaginatedResponse<FacilityDailySummary>> => {
    const response = await apiClient.get('/api/analytics/facility-summary/', { params });
    return parseResponse(PaginatedFacilitySummarySchema, response.data, {
      context: 'analyticsApi.getFacilitySummary',
    });
  },

  /**
   * Department monthly summaries.
   * Filterable by year, month, department.
   */
  getDepartmentPerformance: async (
    params?: DepartmentPerformanceParams
  ): Promise<PaginatedResponse<DepartmentMonthlySummary>> => {
    const response = await apiClient.get('/api/analytics/department-performance/', { params });
    return parseResponse(PaginatedDepartmentSummarySchema, response.data, {
      context: 'analyticsApi.getDepartmentPerformance',
    });
  },

  /**
   * ICD-10 diagnosis trends.
   * Filterable by code, granularity, date range.
   */
  getDiagnosisTrends: async (
    params?: DiagnosisTrendParams
  ): Promise<PaginatedResponse<DiagnosisTrend>> => {
    const response = await apiClient.get('/api/analytics/diagnosis-trends/', { params });
    return parseResponse(PaginatedDiagnosisTrendSchema, response.data, {
      context: 'analyticsApi.getDiagnosisTrends',
    });
  },

  /**
   * Patient demographic snapshots.
   */
  getDemographics: async (
    params?: { page?: number }
  ): Promise<PaginatedResponse<PatientDemographicSnapshot>> => {
    const response = await apiClient.get('/api/analytics/demographics/', { params });
    return parseResponse(PaginatedDemographicSnapshotSchema, response.data, {
      context: 'analyticsApi.getDemographics',
    });
  },

  /**
   * Get a signed Metabase embed URL for a dashboard or question.
   */
  getMetabaseEmbedUrl: async (
    resourceType: MetabaseResourceType,
    resourceId: number
  ): Promise<MetabaseEmbedResponse> => {
    const response = await apiClient.get('/api/analytics/metabase-embed/', {
      params: { resource_type: resourceType, resource_id: resourceId },
    });
    return parseResponse(MetabaseEmbedResponseSchema, response.data, {
      context: 'analyticsApi.getMetabaseEmbedUrl',
    });
  },

  /**
   * List Metabase dashboards configured for embedding.
   */
  getMetabaseDashboards: async (): Promise<MetabaseDashboardInfo[]> => {
    const response = await apiClient.get('/api/analytics/metabase-dashboards/');
    return response.data;
  },
};
