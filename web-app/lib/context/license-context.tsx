'use client';

/**
 * License context provider.
 *
 * Fetches and caches the license status, exposes feature gating hooks,
 * and triggers background check-ins (desktop mode only).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { licensingApi } from '@/lib/api/licensing';
import { isDesktop } from '@/lib/desktop';
import type { LicenseStatus } from '@/lib/types/licensing';

// Check-in interval: every 24 hours (in ms)
const CHECK_IN_INTERVAL = 24 * 60 * 60 * 1000;

interface LicenseContextValue {
  /** Current license status (null while loading). */
  license: LicenseStatus | null;
  /** Whether the license is valid and active. */
  isLicensed: boolean;
  /** Whether the license has expired or is suspended (degraded mode). */
  isDegraded: boolean;
  /** Whether the check-in window has passed (30-day offline limit). */
  isCheckInOverdue: boolean;
  /** Whether we're still loading the license status. */
  isLoading: boolean;
  /** Check if a specific feature is enabled in the license. */
  hasFeature: (featureKey: string) => boolean;
  /** Current subscription tier. */
  tier: string;
  /** Force a license status refresh. */
  refreshLicense: () => void;
}

const LicenseContext = createContext<LicenseContextValue | undefined>(undefined);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [tokenRestored, setTokenRestored] = useState(false);

  // On mount, restore token from Tauri keystore → localStorage (async)
  useEffect(() => {
    if (isDesktop()) {
      licensingApi.getStoredTokenAsync().then(() => setTokenRestored(true));
    } else {
      setTokenRestored(true);
    }
  }, []);

  // Only fetch license status if we have a stored token
  const hasToken = tokenRestored && typeof window !== 'undefined' && !!licensingApi.getStoredToken();

  const { data: license, isLoading } = useQuery<LicenseStatus>({
    queryKey: ['license', 'status'],
    queryFn: () => licensingApi.verifyStatus(),
    enabled: hasToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Re-verify every 10 minutes
    retry: false,
  });

  // Background check-in (desktop mode only)
  useEffect(() => {
    if (!isDesktop() || !hasToken) return;

    const doCheckIn = async () => {
      try {
        const installationId = await licensingApi.getInstallationIdAsync();
        await licensingApi.checkIn({
          installation_id: installationId,
          app_version: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0',
        });
        // Refresh the cached license status
        queryClient.invalidateQueries({ queryKey: ['license', 'status'] });
      } catch {
        // Check-in failures are non-fatal; token stays valid until expiry
      }
    };

    // Check in on mount if more than 24h since last check-in
    const lastCheckIn = localStorage.getItem('vitora_last_check_in');
    const now = Date.now();
    if (!lastCheckIn || now - parseInt(lastCheckIn, 10) > CHECK_IN_INTERVAL) {
      doCheckIn().then(() => {
        localStorage.setItem('vitora_last_check_in', String(now));
      });
    }

    // Schedule periodic check-ins
    const interval = setInterval(() => {
      doCheckIn().then(() => {
        localStorage.setItem('vitora_last_check_in', String(Date.now()));
      });
    }, CHECK_IN_INTERVAL);

    return () => clearInterval(interval);
  }, [hasToken, queryClient]);

  // Listen for license-expired events from the Axios interceptor (web mode).
  // This covers the case where the backend rejects a write due to expired license
  // even if we don't have a local license token (cloud/web mode).
  const [serverDegraded, setServerDegraded] = useState(false);

  useEffect(() => {
    const handler = () => setServerDegraded(true);
    window.addEventListener('vitora:license-expired', handler);
    return () => window.removeEventListener('vitora:license-expired', handler);
  }, []);

  const isLicensed = useMemo(() => {
    if (serverDegraded) return false;
    if (!license) return !hasToken; // No token = not gated (web mode)
    return license.valid && license.subscription_status === 'ACTIVE';
  }, [license, hasToken, serverDegraded]);

  const isDegraded = useMemo(() => {
    if (serverDegraded) return true;
    if (!license) return false;
    return (
      !license.valid ||
      license.subscription_status === 'EXPIRED' ||
      license.subscription_status === 'SUSPENDED'
    );
  }, [license, serverDegraded]);

  const isCheckInOverdue = useMemo(() => {
    return license?.check_in_overdue ?? false;
  }, [license]);

  const tier = useMemo(() => license?.tier ?? '', [license]);

  const hasFeature = useCallback(
    (featureKey: string): boolean => {
      // If no token stored (web mode with cloud auth), allow all features
      // Feature gating is handled server-side via permissions for web mode
      if (!hasToken) return true;
      if (!license || !license.valid) return false;
      return license.features[featureKey] === true;
    },
    [license, hasToken],
  );

  const refreshLicense = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['license', 'status'] });
  }, [queryClient]);

  const value: LicenseContextValue = useMemo(
    () => ({
      license: license ?? null,
      isLicensed,
      isDegraded,
      isCheckInOverdue,
      isLoading,
      hasFeature,
      tier,
      refreshLicense,
    }),
    [license, isLicensed, isDegraded, isCheckInOverdue, isLoading, hasFeature, tier, refreshLicense],
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

/**
 * Hook to access the license context.
 */
export function useLicense(): LicenseContextValue {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}

/**
 * Hook to check if a specific feature is enabled.
 * Returns true in web mode (server-side gating applies).
 */
export function useHasFeature(featureKey: string): boolean {
  const { hasFeature } = useLicense();
  return hasFeature(featureKey);
}
