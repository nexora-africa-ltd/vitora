'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';

export type NavigationMode = 'standard' | 'clinical';

export const NAVIGATION_MODE_STORAGE_KEY = 'vitora_navigation_mode';

interface NavigationModeContextValue {
  navigationMode: NavigationMode;
  setNavigationMode: (mode: NavigationMode) => void;
  isClinicalNavigationEligible: boolean;
}

const CLINICAL_MODE_ELIGIBLE_ROLES = new Set([
  'DOCTOR',
  'CLINICAL_OFFICER',
  'NURSE',
  'RECEPTIONIST',
]);

const NavigationModeContext = createContext<NavigationModeContextValue | undefined>(undefined);

function isNavigationMode(value: string | null): value is NavigationMode {
  return value === 'standard' || value === 'clinical';
}

export function isClinicalNavigationEligibleForUser(
  role: string | null,
  roleCategory: string | null
): boolean {
  if (roleCategory === 'CLINICAL') {
    return true;
  }

  if (!role) {
    return false;
  }

  return CLINICAL_MODE_ELIGIBLE_ROLES.has(role);
}

function readStoredMode(): NavigationMode {
  if (typeof window === 'undefined') return 'standard';
  try {
    const stored = localStorage.getItem(NAVIGATION_MODE_STORAGE_KEY);
    return isNavigationMode(stored) ? stored : 'standard';
  } catch {
    return 'standard';
  }
}

export function NavigationModeProvider({ children }: { children: ReactNode }) {
  const { role, roleCategory } = usePermissions();
  const [navigationMode, setNavigationModeState] = useState<NavigationMode>(readStoredMode);

  const isClinicalNavigationEligible = useMemo(
    () => isClinicalNavigationEligibleForUser(role, roleCategory),
    [role, roleCategory]
  );

  useEffect(() => {
    if (isClinicalNavigationEligible || navigationMode !== 'clinical') {
      return;
    }

    setNavigationModeState('standard');
    try {
      localStorage.setItem(NAVIGATION_MODE_STORAGE_KEY, 'standard');
    } catch {
      // Ignore storage failures and keep the safe in-memory fallback.
    }
  }, [isClinicalNavigationEligible, navigationMode]);

  const setNavigationMode = useCallback(
    (mode: NavigationMode) => {
      const nextMode = mode === 'clinical' && !isClinicalNavigationEligible ? 'standard' : mode;
      setNavigationModeState(nextMode);

      try {
        localStorage.setItem(NAVIGATION_MODE_STORAGE_KEY, nextMode);
      } catch {
        // Ignore storage failures and keep the in-memory preference.
      }
    },
    [isClinicalNavigationEligible]
  );

  const value = useMemo<NavigationModeContextValue>(
    () => ({
      navigationMode,
      setNavigationMode,
      isClinicalNavigationEligible,
    }),
    [navigationMode, setNavigationMode, isClinicalNavigationEligible]
  );

  return (
    <NavigationModeContext.Provider value={value}>
      {children}
    </NavigationModeContext.Provider>
  );
}

export function useNavigationMode(): NavigationModeContextValue {
  const context = useContext(NavigationModeContext);
  if (!context) {
    throw new Error('useNavigationMode must be used within a NavigationModeProvider');
  }
  return context;
}
