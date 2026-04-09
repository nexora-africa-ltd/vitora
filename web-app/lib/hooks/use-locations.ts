import { locationsApi, County, SubCounty, Ward } from '@/lib/api/locations';
import { queryKeys } from '@/lib/query-client';
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { transformCountyRow, transformSubCountyRow, transformWardRow } from '@/lib/powersync/transforms';
import type { CountyRow, SubCountyRow, WardRow } from '@/lib/powersync/schema';

/**
 * Hook for fetching Kenya counties.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useCounties() {
  return useOfflineQuery<CountyRow & { id: string }, County[]>({
    sql: 'SELECT id, code, name FROM core_county ORDER BY name',
    params: [],
    transform: (rows) => rows.map(transformCountyRow),
    queryKey: queryKeys.locations.counties(),
    queryFn: locationsApi.getCounties,
    queryOptions: { staleTime: Infinity },
  });
}

/**
 * Hook for fetching sub-counties for a county.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useSubCounties(countyId: number | undefined) {
  return useOfflineQuery<SubCountyRow & { id: string }, SubCounty[]>({
    sql: countyId
      ? 'SELECT id, county_id, name FROM core_subcounty WHERE county_id = ? ORDER BY name'
      : 'SELECT 1 WHERE 0',
    params: countyId ? [String(countyId)] : [],
    transform: (rows) => rows.map(transformSubCountyRow),
    queryKey: queryKeys.locations.subCounties(countyId!),
    queryFn: () => locationsApi.getSubCounties(countyId!),
    queryOptions: { staleTime: Infinity },
    forceApi: !countyId,
  });
}

/**
 * Hook for fetching wards for a sub-county.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useWards(subCountyId: number | undefined) {
  return useOfflineQuery<WardRow & { id: string }, Ward[]>({
    sql: subCountyId
      ? 'SELECT id, sub_county_id, name FROM core_ward WHERE sub_county_id = ? ORDER BY name'
      : 'SELECT 1 WHERE 0',
    params: subCountyId ? [String(subCountyId)] : [],
    transform: (rows) => rows.map(transformWardRow),
    queryKey: queryKeys.locations.wards(subCountyId!),
    queryFn: () => locationsApi.getWards(subCountyId!),
    queryOptions: { staleTime: Infinity },
    forceApi: !subCountyId,
  });
}

/**
 * Hook for cascading location selection.
 */
export function useLocationSelector(initialCountyId?: number, initialSubCountyId?: number) {
  const counties = useCounties();
  const subCounties = useSubCounties(initialCountyId);
  const wards = useWards(initialSubCountyId);

  return {
    counties: counties.data || [],
    subCounties: subCounties.data || [],
    wards: wards.data || [],
    isLoading: counties.isLoading,
    isLoadingSubCounties: subCounties.isLoading,
    isLoadingWards: wards.isLoading,
  };
}
