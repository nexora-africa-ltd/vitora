/**
 * Global Sync Status Context
 * Tracks synchronization status across the application
 * Used by auto-save and the network indicator
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface SyncStatus {
  /** Timestamp of last successful sync */
  lastSyncTime: Date | null;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Number of pending changes waiting to sync */
  pendingChanges: number;
  /** Last sync error message */
  lastError: string | null;
}

interface SyncContextValue extends SyncStatus {
  /** Report a successful sync */
  reportSync: () => void;
  /** Report sync started */
  reportSyncStart: () => void;
  /** Report sync error */
  reportSyncError: (error: string) => void;
  /** Increment pending changes count */
  incrementPending: () => void;
  /** Decrement pending changes count */
  decrementPending: () => void;
  /** Set pending count directly */
  setPendingCount: (count: number) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    isSyncing: false,
    pendingChanges: 0,
    lastError: null,
  });

  const reportSync = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      lastSyncTime: new Date(),
      isSyncing: false,
      lastError: null,
    }));
  }, []);

  const reportSyncStart = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      isSyncing: true,
      lastError: null,
    }));
  }, []);

  const reportSyncError = useCallback((error: string) => {
    setStatus(prev => ({
      ...prev,
      isSyncing: false,
      lastError: error,
    }));
  }, []);

  const incrementPending = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      pendingChanges: prev.pendingChanges + 1,
    }));
  }, []);

  const decrementPending = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      pendingChanges: Math.max(0, prev.pendingChanges - 1),
    }));
  }, []);

  const setPendingCount = useCallback((count: number) => {
    setStatus(prev => ({
      ...prev,
      pendingChanges: count,
    }));
  }, []);

  const value = useMemo<SyncContextValue>(() => ({
    ...status,
    reportSync,
    reportSyncStart,
    reportSyncError,
    incrementPending,
    decrementPending,
    setPendingCount,
  }), [status, reportSync, reportSyncStart, reportSyncError, incrementPending, decrementPending, setPendingCount]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncStatus(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    // Return a default value for components outside the provider
    return {
      lastSyncTime: null,
      isSyncing: false,
      pendingChanges: 0,
      lastError: null,
      reportSync: () => {},
      reportSyncStart: () => {},
      reportSyncError: () => {},
      incrementPending: () => {},
      decrementPending: () => {},
      setPendingCount: () => {},
    };
  }
  return context;
}

/**
 * Format the last sync time for display
 */
export function formatLastSync(date: Date | null): string {
  if (!date) return 'Never synced';
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  
  return date.toLocaleString();
}
