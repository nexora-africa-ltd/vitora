import { useQuery } from '@tanstack/react-query';
import { locationsApi, County, SubCounty, Ward } from '@/lib/api/locations';
import { queryKeys } from '@/lib/query-client';

/**
 * Hook for fetching Kenya counties.
 */
export function useCounties() {
  return useQuery({
    queryKey: queryKeys.locations.counties(),
    queryFn: locationsApi.getCounties,
    staleTime: Infinity, // Counties don't change
  });
}

/**
 * Hook for fetching sub-counties for a county.
 */
export function useSubCounties(countyId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.locations.subCounties(countyId!),
    queryFn: () => locationsApi.getSubCounties(countyId!),
    enabled: !!countyId,
    staleTime: Infinity,
  });
}

/**
 * Hook for fetching wards for a sub-county.
 */
export function useWards(subCountyId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.locations.wards(subCountyId!),
    queryFn: () => locationsApi.getWards(subCountyId!),
    enabled: !!subCountyId,
    staleTime: Infinity,
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
