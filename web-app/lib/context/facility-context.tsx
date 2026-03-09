'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useAuth, type FacilityModules, type UserFacility } from '@/lib/auth/context';

interface FacilityContextValue {
  facility: UserFacility | null;
  isLoading: boolean;
  /** Check if the user's primary facility has a specific module enabled */
  hasModule: (module: keyof FacilityModules) => boolean;
}

const FacilityContext = createContext<FacilityContextValue | undefined>(undefined);

export function FacilityProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  const facility = useMemo(() => user?.facility ?? null, [user]);

  const hasModule = useMemo(() => {
    return (module: keyof FacilityModules): boolean => {
      // Superusers bypass facility module checks
      if (user?.is_superuser) return true;
      if (!facility) return true; // No facility assigned = no filtering
      return facility.modules[module] ?? false;
    };
  }, [user, facility]);

  const value = useMemo<FacilityContextValue>(
    () => ({ facility, isLoading, hasModule }),
    [facility, isLoading, hasModule],
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
