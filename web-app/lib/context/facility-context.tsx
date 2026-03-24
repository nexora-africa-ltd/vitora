'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, type FacilityModules, type UserFacility } from '@/lib/auth/context';
import { facilitiesApi } from '@/lib/api/facilities';
import { setActiveFacilityId } from '@/lib/api/client';
import type { FacilityDetail } from '@/lib/types/facility';

const FACILITY_OVERRIDE_STORAGE_KEY = 'vitora_dev_facility_override';

interface FacilityContextValue {
  facility: UserFacility | null;
  /** Full facility detail with location, SHA info, etc. (fetched via React Query) */
  facilityDetail: FacilityDetail | null;
  assignedFacility: UserFacility | null;
  facilityOverride: UserFacility | null;
  isUsingFacilityOverride: boolean;
  isLoading: boolean;
  /** Check if the user's primary facility has a specific module enabled */
  hasModule: (module: keyof FacilityModules) => boolean;
  setFacilityOverride: (facility: UserFacility | null) => void;
  clearFacilityOverride: () => void;
}

const FacilityContext = createContext<FacilityContextValue | undefined>(undefined);

export function FacilityProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [facilityOverride, setFacilityOverrideState] = useState<UserFacility | null>(null);

  // Allow facility override in development OR for superusers in production
  const canOverride = process.env.NODE_ENV === 'development' || !!user?.is_superuser;

  const assignedFacility = useMemo(() => user?.facility ?? null, [user]);

  useEffect(() => {
    if (!canOverride) {
      // Clear any lingering override when user is not allowed
      setFacilityOverrideState(null);
      return;
    }

    try {
      const stored = localStorage.getItem(FACILITY_OVERRIDE_STORAGE_KEY);
      if (!stored) {
        return;
      }

      setFacilityOverrideState(JSON.parse(stored) as UserFacility);
    } catch {
      localStorage.removeItem(FACILITY_OVERRIDE_STORAGE_KEY);
    }
  }, [canOverride]);

  const setFacilityOverride = useCallback((facility: UserFacility | null) => {
    if (!canOverride) {
      return;
    }

    setFacilityOverrideState(facility);

    if (facility) {
      localStorage.setItem(FACILITY_OVERRIDE_STORAGE_KEY, JSON.stringify(facility));
      return;
    }

    localStorage.removeItem(FACILITY_OVERRIDE_STORAGE_KEY);
  }, [canOverride]);

  const clearFacilityOverride = useCallback(() => {
    setFacilityOverride(null);
  }, [setFacilityOverride]);

  const facility = useMemo(() => {
    if (canOverride && facilityOverride) {
      return facilityOverride;
    }

    return assignedFacility;
  }, [assignedFacility, facilityOverride, canOverride]);

  // Fetch full facility detail (location, SHA info, etc.) via React Query
  const facilityId = facility?.id ?? null;
  const { data: facilityDetail = null } = useQuery({
    queryKey: ['facility-detail', facilityId],
    queryFn: () => facilitiesApi.get(facilityId as number),
    enabled: facilityId !== null,
    staleTime: 5 * 60 * 1000,  // 5 minutes — facility data rarely changes
    gcTime: 30 * 60 * 1000,    // 30 minutes
  });

  // Sync active facility ID to API client for X-Facility-Id header
  useEffect(() => {
    setActiveFacilityId(facilityId);
  }, [facilityId]);

  const hasModule = useMemo(() => {
    return (module: keyof FacilityModules): boolean => {
      // Superusers bypass facility module checks
      if (user?.is_superuser) return true;
      if (!facility) return true; // No facility assigned = no filtering
      return facility.modules[module] ?? false;
    };
  }, [user, facility]);

  const value = useMemo<FacilityContextValue>(
    () => ({
      facility,
      facilityDetail,
      assignedFacility,
      facilityOverride,
      isUsingFacilityOverride: canOverride && facilityOverride !== null,
      isLoading,
      hasModule,
      setFacilityOverride,
      clearFacilityOverride,
    }),
    [facility, facilityDetail, assignedFacility, facilityOverride, canOverride, isLoading, hasModule, setFacilityOverride, clearFacilityOverride],
  );

  return (
    <FacilityContext.Provider value={value}>
      {children}
    </FacilityContext.Provider>
  );
}

export function useFacility(): FacilityContextValue {
  const context = useContext(FacilityContext);
  if (context === undefined) {
    throw new Error('useFacility must be used within a FacilityProvider');
  }
  return context;
}
