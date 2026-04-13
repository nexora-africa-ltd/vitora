'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
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
  /** Organization derived from active facility (null if no facility or facility has no org) */
  organization: { id: number; name: string } | null;
  assignedFacility: UserFacility | null;
  facilityOverride: UserFacility | null;
  isUsingFacilityOverride: boolean;
  isLoading: boolean;
  /** Check if the user's primary facility has a specific module enabled */
  hasModule: (module: keyof FacilityModules) => boolean;
  /** Switch to a different facility (persists in localStorage) */
  switchFacility: (facility: UserFacility) => void;
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

  // Sync active facility ID to API client for X-Facility-Id header.
  // Done synchronously during render (not in useEffect) so the header is
  // available before any child component's React Query hook fires.
  // setActiveFacilityId sets a module-level variable, not React state,
  // so it's safe and idempotent during render.
  const prevFacilityIdRef = useRef<number | null | undefined>(undefined);
  if (prevFacilityIdRef.current !== facilityId) {
    prevFacilityIdRef.current = facilityId;
    setActiveFacilityId(facilityId);
  }

  const hasModule = useMemo(() => {
    return (module: keyof FacilityModules): boolean => {
      // Superusers bypass facility module checks
      if (user?.is_superuser) return true;
      if (!facility) return true; // No facility assigned = no filtering
      return facility.modules[module] ?? false;
    };
  }, [user, facility]);

  // Derive organization from facility detail
  const organization = useMemo(() => {
    if (!facilityDetail?.organization || !facilityDetail?.organization_name) return null;
    return { id: facilityDetail.organization, name: facilityDetail.organization_name };
  }, [facilityDetail]);

  // switchFacility: convenience wrapper around setFacilityOverride for branch switching
  const switchFacility = useCallback((target: UserFacility) => {
    setFacilityOverride(target);
  }, [setFacilityOverride]);

  const value = useMemo<FacilityContextValue>(
    () => ({
      facility,
      facilityDetail,
      organization,
      assignedFacility,
      facilityOverride,
      isUsingFacilityOverride: canOverride && facilityOverride !== null,
      isLoading,
      hasModule,
      switchFacility,
      setFacilityOverride,
      clearFacilityOverride,
    }),
    [facility, facilityDetail, organization, assignedFacility, facilityOverride, canOverride, isLoading, hasModule, switchFacility, setFacilityOverride, clearFacilityOverride],
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
