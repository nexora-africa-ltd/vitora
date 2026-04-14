import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth/auth-context';

import { getOfflineSyncSnapshot, runOfflineSync } from './engine';

type SyncStatusValue = {
  conflictCount: number;
  error: string | null;
  failedCount: number;
  isHydrating: boolean;
  isOnline: boolean;
  lastSyncedAt: string | null;
  pendingCount: number;
  requestSync: (reason?: string) => Promise<void>;
  state: 'error' | 'hydrating' | 'idle' | 'offline' | 'syncing' | 'synced' | 'conflict';
};

const SyncStatusContext = createContext<SyncStatusValue | undefined>(undefined);

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrating: isAuthHydrating } = useAuth();
  const [status, setStatus] = useState<SyncStatusValue>({
    conflictCount: 0,
    error: null,
    failedCount: 0,
    isHydrating: true,
    isOnline: false,
    lastSyncedAt: null,
    pendingCount: 0,
    requestSync: async () => {},
    state: 'hydrating',
  });
  const isSyncingRef = useRef(false);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSnapshot = useCallback(async (onlineOverride?: boolean) => {
    const [netState, snapshot] = await Promise.all([NetInfo.fetch(), getOfflineSyncSnapshot()]);
    const isOnline = onlineOverride ?? Boolean(netState.isConnected && netState.isInternetReachable !== false);

    setStatus((current) => ({
      ...current,
      conflictCount: snapshot.conflictCount,
      error: snapshot.error,
      failedCount: snapshot.failedCount,
      isHydrating: false,
      isOnline,
      lastSyncedAt: snapshot.lastSyncedAt,
      pendingCount: snapshot.pendingCount,
      state: snapshot.conflictCount > 0 ? 'conflict' : isOnline ? 'synced' : 'offline',
    }));
  }, []);

  const requestSync = useCallback(async () => {
    if (!isAuthenticated || isAuthHydrating || isSyncingRef.current) {
      return;
    }

    const netState = await NetInfo.fetch();
    const isOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);

    if (!isOnline) {
      await refreshSnapshot(false);
      return;
    }

    isSyncingRef.current = true;
    setStatus((current) => ({
      ...current,
      error: null,
      isHydrating: false,
      isOnline: true,
      state: 'syncing',
    }));

    try {
      const summary = await runOfflineSync();
      setStatus((current) => ({
        ...current,
        conflictCount: summary.conflictCount,
        error: summary.error,
        failedCount: summary.failedCount,
        isHydrating: false,
        isOnline: true,
        lastSyncedAt: summary.lastSyncedAt,
        pendingCount: summary.pendingCount,
        state: summary.status === 'error' ? 'error' : summary.status === 'conflict' ? 'conflict' : 'synced',
      }));
    } finally {
      isSyncingRef.current = false;
    }
  }, [isAuthenticated, isAuthHydrating, refreshSnapshot]);

  useEffect(() => {
    setStatus((current) => ({
      ...current,
      requestSync,
    }));
  }, [requestSync]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    if (isAuthHydrating) {
      return;
    }

    if (!isAuthenticated) {
      setStatus((current) => ({
        ...current,
        conflictCount: 0,
        error: null,
        failedCount: 0,
        isHydrating: false,
        lastSyncedAt: null,
        pendingCount: 0,
        state: 'idle',
      }));
      return;
    }

    void requestSync();
  }, [isAuthenticated, isAuthHydrating, requestSync]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      const isOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        if (isOnline) {
          void requestSync();
          return;
        }

        void refreshSnapshot(false);
      }, 800);
    });

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      unsubscribe();
    };
  }, [refreshSnapshot, requestSync]);

  const value = useMemo<SyncStatusValue>(
    () => ({
      ...status,
      requestSync,
    }),
    [requestSync, status]
  );

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus(): SyncStatusValue {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error('useSyncStatus must be used within SyncStatusProvider');
  }

  return context;
}
