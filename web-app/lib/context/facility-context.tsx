'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth, type FacilityModules, type UserFacility } from '@/lib/auth/context';

const FACILITY_OVERRIDE_STORAGE_KEY = 'vitora_dev_facility_override';

interface FacilityContextValue {
  facility: UserFacility | null;
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

  const assignedFacility = useMemo(() => user?.facility ?? null, [user]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
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
  }, []);

  const setFacilityOverride = useCallback((facility: UserFacility | null) => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    setFacilityOverrideState(facility);

    if (facility) {
      localStorage.setItem(FACILITY_OVERRIDE_STORAGE_KEY, JSON.stringify(facility));
      return;
    }

    localStorage.removeItem(FACILITY_OVERRIDE_STORAGE_KEY);
  }, []);

  const clearFacilityOverride = useCallback(() => {
    setFacilityOverride(null);
  }, [setFacilityOverride]);

  const facility = useMemo(() => {
    if (process.env.NODE_ENV === 'development' && facilityOverride) {
      return facilityOverride;
    }

    return assignedFacility;
  }, [assignedFacility, facilityOverride]);

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
      assignedFacility,
      facilityOverride,
      isUsingFacilityOverride: process.env.NODE_ENV === 'development' && facilityOverride !== null,
      isLoading,
      hasModule,
      setFacilityOverride,
      clearFacilityOverride,
    }),
    [facility, assignedFacility, facilityOverride, isLoading, hasModule, setFacilityOverride, clearFacilityOverride],
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
