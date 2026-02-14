'use client';

/**
 * useVersionCheck Hook
 *
 * Monitors for new app versions and provides state/actions for
 * prompting users to refresh.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  startVersionChecking,
  clearCacheAndReload,
  checkForNewVersion,
  getPendingUserData,
  VersionState,
  PendingUserData,
} from '@/lib/utils/version-check';

interface UseVersionCheckReturn {
  /** Whether a new version is available */
  newVersionAvailable: boolean;
  /** The new version string (if available) */
  newVersion: string | null;
  /** Pending user data that might be affected by refresh */
  pendingData: PendingUserData;
  /** Dismiss the notification (user can refresh later) */
  dismiss: () => void;
  /** Clear cache and reload to get the new version */
  refresh: () => Promise<void>;
  /** Whether a refresh is in progress */
  isRefreshing: boolean;
}

export function useVersionCheck(): UseVersionCheckReturn {
  const [state, setState] = useState<VersionState>({
    currentVersion: null,
    newVersionAvailable: false,
    newVersion: null,
    isChecking: false,
  });
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingData, setPendingData] = useState<PendingUserData>({
    count: 0,
    hasDrafts: false,
    hasOfflineQueue: false,
    draftKeys: [],
  });

  useEffect(() => {
    // Initial version check
    checkForNewVersion().then(setState);

    // Check for pending data
    setPendingData(getPendingUserData());

    // Start periodic checking
    const cleanup = startVersionChecking((newVersion) => {
      setState((prev) => ({
        ...prev,
        newVersionAvailable: true,
        newVersion,
      }));
      // Re-check pending data when new version detected
      setPendingData(getPendingUserData());
    });

    return cleanup;
  }, []);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await clearCacheAndReload();
    // Note: Page will reload, so this state won't persist
  }, []);

  return {
    newVersionAvailable: state.newVersionAvailable && !isDismissed,
    newVersion: state.newVersion,
    pendingData,
    dismiss,
    refresh,
    isRefreshing,
  };
}
