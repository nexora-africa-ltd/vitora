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
  SupersetGuestTokenResponseSchema,
  SupersetDashboardListSchema,
  ClinicQueueProjectionArraySchema,
  WardOccupancyProjectionArraySchema,
  PharmacyQueueProjectionArraySchema,
  RoomUtilizationArraySchema,
  RoomUtilizationSummarySchema,
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
  SupersetGuestTokenResponse,
  SupersetDashboardInfo,
  ClinicQueueProjectionParams,
  ClinicQueueProjectionRow,
  WardOccupancyProjectionParams,
  WardOccupancyProjectionRow,
  PharmacyQueueProjectionParams,
  PharmacyQueueProjectionRow,
  RoomUtilizationParams,
  RoomUtilizationRow,
  RoomUtilizationSummary,
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

  /**
   * Get a Superset guest token for embedding a dashboard.
   */
  getSupersetGuestToken: async (
    dashboardId: number
  ): Promise<SupersetGuestTokenResponse> => {
    const response = await apiClient.get('/api/analytics/superset-guest-token/', {
      params: { dashboard_id: dashboardId },
    });
    return parseResponse(SupersetGuestTokenResponseSchema, response.data, {
      context: 'analyticsApi.getSupersetGuestToken',
    });
  },

  /**
   * List Superset dashboards available for embedding.
   */
  getSupersetDashboards: async (): Promise<SupersetDashboardInfo[]> => {
    const response = await apiClient.get('/api/analytics/superset-dashboards/');
    return parseResponse(SupersetDashboardListSchema, response.data, {
      context: 'analyticsApi.getSupersetDashboards',
    });
  },

  getClinicQueueProjection: async (
    params: ClinicQueueProjectionParams
  ): Promise<ClinicQueueProjectionRow[]> => {
    const response = await apiClient.get('/api/projections/clinic-queue/', { params });
    return parseResponse(ClinicQueueProjectionArraySchema, response.data, {
      context: 'analyticsApi.getClinicQueueProjection',
    });
  },

  getWardOccupancyProjection: async (
    params?: WardOccupancyProjectionParams
  ): Promise<WardOccupancyProjectionRow[]> => {
    const response = await apiClient.get('/api/projections/ward-occupancy/', { params });
    return parseResponse(WardOccupancyProjectionArraySchema, response.data, {
      context: 'analyticsApi.getWardOccupancyProjection',
    });
  },

  getPharmacyQueueProjection: async (
    params?: PharmacyQueueProjectionParams
  ): Promise<PharmacyQueueProjectionRow[]> => {
    const response = await apiClient.get('/api/projections/pharmacy-queue/', { params });
    return parseResponse(PharmacyQueueProjectionArraySchema, response.data, {
      context: 'analyticsApi.getPharmacyQueueProjection',
    });
  },

  getRoomUtilization: async (
    params?: RoomUtilizationParams
  ): Promise<RoomUtilizationRow[]> => {
    const response = await apiClient.get('/api/projections/room-utilization/', { params });
    return parseResponse(RoomUtilizationArraySchema, response.data, {
      context: 'analyticsApi.getRoomUtilization',
    });
  },

  getRoomUtilizationSummary: async (
    params?: Pick<RoomUtilizationParams, 'date' | 'facility_id'>
  ): Promise<RoomUtilizationSummary> => {
    const response = await apiClient.get('/api/projections/room-utilization/summary/', { params });
    return parseResponse(RoomUtilizationSummarySchema, response.data, {
      context: 'analyticsApi.getRoomUtilizationSummary',
    });
  },
};
