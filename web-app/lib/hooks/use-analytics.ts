/**
 * React Query hooks for Analytics & BI.
 *
 * Fetches from /api/analytics/ endpoints with appropriate caching.
 */

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api/analytics';
import type {
  FacilitySummaryParams,
  DepartmentPerformanceParams,
  DiagnosisTrendParams,
  MetabaseResourceType,
  ClinicQueueProjectionParams,
  WardOccupancyProjectionParams,
  PharmacyQueueProjectionParams,
  RoomUtilizationParams,
} from '@/lib/types/analytics';

// Query keys
export const ANALYTICS_KEYS = {
  facilitySummary: (params?: FacilitySummaryParams) =>
    ['analytics', 'facility-summary', params] as const,
  departmentPerformance: (params?: DepartmentPerformanceParams) =>
    ['analytics', 'department-performance', params] as const,
  diagnosisTrends: (params?: DiagnosisTrendParams) =>
    ['analytics', 'diagnosis-trends', params] as const,
  demographics: () => ['analytics', 'demographics'] as const,
  clinicQueueProjection: (params: ClinicQueueProjectionParams) =>
    ['analytics', 'clinic-queue-projection', params] as const,
  wardOccupancyProjection: (params?: WardOccupancyProjectionParams) =>
    ['analytics', 'ward-occupancy-projection', params] as const,
  pharmacyQueueProjection: (params?: PharmacyQueueProjectionParams) =>
    ['analytics', 'pharmacy-queue-projection', params] as const,
  roomUtilization: (params?: RoomUtilizationParams) =>
    ['analytics', 'room-utilization', params] as const,
  roomUtilizationSummary: (params?: Pick<RoomUtilizationParams, 'date' | 'facility_id'>) =>
    ['analytics', 'room-utilization-summary', params] as const,
  metabaseEmbed: (type: MetabaseResourceType, id: number) =>
    ['analytics', 'metabase-embed', type, id] as const,
  metabaseDashboards: () => ['analytics', 'metabase-dashboards'] as const,
  supersetGuestToken: (dashboardId: number) =>
    ['analytics', 'superset-guest-token', dashboardId] as const,
  supersetDashboards: () => ['analytics', 'superset-dashboards'] as const,
};

// Analytics data is ETL'd nightly — 15 min stale time is fine
const STALE_TIME = 15 * 60 * 1000;

/**
 * Fetch facility daily summaries (date-range filterable).
 */
export function useFacilitySummary(params?: FacilitySummaryParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.facilitySummary(params),
    queryFn: () => analyticsApi.getFacilitySummary(params),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetch department monthly performance (year/month/department filterable).
 */
export function useDepartmentPerformance(params?: DepartmentPerformanceParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.departmentPerformance(params),
    queryFn: () => analyticsApi.getDepartmentPerformance(params),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetch diagnosis trends.
 */
export function useDiagnosisTrends(params?: DiagnosisTrendParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.diagnosisTrends(params),
    queryFn: () => analyticsApi.getDiagnosisTrends(params),
    staleTime: STALE_TIME,
  });
}

/**
 * Fetch patient demographic snapshots.
 */
export function useDemographics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.demographics(),
    queryFn: () => analyticsApi.getDemographics(),
    staleTime: STALE_TIME,
  });
}

export function useClinicQueueProjection(params: ClinicQueueProjectionParams | undefined) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.clinicQueueProjection(params ?? { clinic_id: 0 }),
    queryFn: () => analyticsApi.getClinicQueueProjection(params!),
    staleTime: 60 * 1000,
    enabled: !!params?.clinic_id,
  });
}

export function useWardOccupancyProjection(params?: WardOccupancyProjectionParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.wardOccupancyProjection(params),
    queryFn: () => analyticsApi.getWardOccupancyProjection(params),
    staleTime: 60 * 1000,
  });
}

export function usePharmacyQueueProjection(params?: PharmacyQueueProjectionParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.pharmacyQueueProjection(params),
    queryFn: () => analyticsApi.getPharmacyQueueProjection(params),
    staleTime: 60 * 1000,
  });
}

export function useRoomUtilization(params?: RoomUtilizationParams) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.roomUtilization(params),
    queryFn: () => analyticsApi.getRoomUtilization(params),
    staleTime: 60 * 1000,
  });
}

export function useRoomUtilizationSummary(
  params?: Pick<RoomUtilizationParams, 'date' | 'facility_id'>
) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.roomUtilizationSummary(params),
    queryFn: () => analyticsApi.getRoomUtilizationSummary(params),
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch a signed Metabase embed URL for a dashboard or question.
 * Token is short-lived (10 min), so refetch every 8 min.
 */
export function useMetabaseEmbedUrl(
  resourceType: MetabaseResourceType,
  resourceId: number
) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.metabaseEmbed(resourceType, resourceId),
    queryFn: () => analyticsApi.getMetabaseEmbedUrl(resourceType, resourceId),
    staleTime: 8 * 60 * 1000, // 8 min (token expires in 10 min)
    refetchInterval: 8 * 60 * 1000,
    enabled: resourceId > 0,
    retry: 1,
  });
}

/**
 * Fetch the list of Metabase dashboards configured for embedding.
 */
export function useMetabaseDashboards() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.metabaseDashboards(),
    queryFn: () => analyticsApi.getMetabaseDashboards(),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

/**
 * Fetch a Superset guest token for embedding a dashboard.
 * Token is short-lived (5 min), so refetch every 4 min.
 */
export function useSupersetGuestToken(dashboardId: number) {
  return useQuery({
    queryKey: ANALYTICS_KEYS.supersetGuestToken(dashboardId),
    queryFn: () => analyticsApi.getSupersetGuestToken(dashboardId),
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    enabled: dashboardId > 0,
    retry: 1,
  });
}

/**
 * Fetch the list of Superset dashboards available for embedding.
 */
export function useSupersetDashboards() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.supersetDashboards(),
    queryFn: () => analyticsApi.getSupersetDashboards(),
    staleTime: STALE_TIME,
    retry: 1,
  });
}
