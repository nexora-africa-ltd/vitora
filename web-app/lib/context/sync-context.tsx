/**
 * Global Sync Status Context — PowerSync Integration
 *
 * Wraps the PowerSync Web SDK to provide offline-first data sync.
 * PowerSync streams data from PostgreSQL → browser SQLite (via WASM).
 * Writes go through the Django REST API via the connector's uploadData().
 *
 * Exports the same public API as the original stub so existing consumers
 * (Header, useAutoSave) continue to work without changes.
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { PowerSyncDatabase } from '@powersync/web';
import { powersyncSchema } from '@/lib/powersync/schema';
import { VitoraPowerSyncConnector } from '@/lib/powersync/connector';
import { tokenStorage } from '@/lib/auth/storage';

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
  /** The PowerSync database instance (for direct queries) */
  db: PowerSyncDatabase | null;
  /** Whether the PowerSync DB has finished initializing (safe to query) */
  isReady: boolean;
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
  /** Trigger a manual sync */
  triggerSync: () => Promise<void>;
  /** Set the trigger sync function (legacy — unused with PowerSync) */
  setTriggerSync: (fn: () => Promise<void>) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/** Singleton PowerSync database instance (shared across re-renders). */
let _dbInstance: PowerSyncDatabase | null = null;

function getOrCreateDatabase(): PowerSyncDatabase {
  if (!_dbInstance) {
    _dbInstance = new PowerSyncDatabase({
      schema: powersyncSchema,
      database: { dbFilename: 'vitora.db' },
    });
  }
  return _dbInstance;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<PowerSyncDatabase | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(() => ({
    lastSyncTime: null,
    isSyncing: false,
    pendingChanges: 0,
    lastError: null,
  }));
  const connectedRef = useRef(false);

  // Initialize PowerSync when the provider mounts
  useEffect(() => {
    const powersyncUrl = process.env.NEXT_PUBLIC_POWERSYNC_URL;

    // If no PowerSync URL is configured, run in "offline-only" mode
    // where we still have a local SQLite DB but no server sync.
    if (!powersyncUrl) {
      const database = getOrCreateDatabase();
      database.init();
      setDb(database);
      setIsReady(true);
      setStatus(prev => ({ ...prev, lastSyncTime: new Date() }));
      return;
    }

    const database = getOrCreateDatabase();
    const connector = new VitoraPowerSyncConnector();

    let disposed = false;

    async function connect() {
      try {
        // Only connect if user has an access token
        const token = tokenStorage.getAccessToken();
        if (!token) {
          // Wait for auth — the provider will re-mount or the user will log in
          database.init();
          setDb(database);
          setIsReady(true);
          return;
        }

        await database.init();
        await database.connect(connector);
        connectedRef.current = true;

        if (!disposed) {
          setDb(database);
          setIsReady(true);
          setStatus(prev => ({
            ...prev,
            isSyncing: false,
            lastSyncTime: new Date(),
            lastError: null,
          }));
        }
      } catch (error) {
        console.error('[PowerSync] Connection error:', error);
        if (!disposed) {
          setDb(database);
          setIsReady(true);
          setStatus(prev => ({
            ...prev,
            isSyncing: false,
            lastError: error instanceof Error ? error.message : 'Connection failed',
          }));
        }
      }
    }

    connect();

    return () => {
      disposed = true;
      // Don't disconnect the singleton — it persists across layout re-mounts
    };
  }, []);

  // Track sync status changes from the PowerSync database
  useEffect(() => {
    if (!db) return;

    const unsubscribe = db.registerListener({
      statusChanged: (newStatus) => {
        setStatus(prev => ({
          ...prev,
          isSyncing: newStatus.dataFlowStatus?.downloading === true ||
                     newStatus.dataFlowStatus?.uploading === true,
          lastSyncTime: newStatus.lastSyncedAt ? new Date(newStatus.lastSyncedAt) : prev.lastSyncTime,
          pendingChanges: newStatus.hasSynced === false ? prev.pendingChanges : 0,
        }));
      },
    });

    return () => {
      unsubscribe?.();
    };
  }, [db]);

  const triggerSync = useCallback(async () => {
    if (!db || status.isSyncing) return;
    try {
      setStatus(prev => ({ ...prev, isSyncing: true, lastError: null }));
      // Trigger an immediate sync cycle
      await db.connect(new VitoraPowerSyncConnector());
      setStatus(prev => ({ ...prev, isSyncing: false, lastSyncTime: new Date() }));
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastError: error instanceof Error ? error.message : 'Sync failed',
      }));
    }
  }, [db, status.isSyncing]);

  // Legacy callbacks — kept for backward compatibility with useAutoSave etc.
  const reportSync = useCallback(() => {
    setStatus(prev => ({ ...prev, lastSyncTime: new Date(), isSyncing: false, lastError: null }));
  }, []);

  const reportSyncStart = useCallback(() => {
    setStatus(prev => ({ ...prev, isSyncing: true, lastError: null }));
  }, []);

  const reportSyncError = useCallback((error: string) => {
    setStatus(prev => ({ ...prev, isSyncing: false, lastError: error }));
  }, []);

  const incrementPending = useCallback(() => {
    setStatus(prev => ({ ...prev, pendingChanges: prev.pendingChanges + 1 }));
  }, []);

  const decrementPending = useCallback(() => {
    setStatus(prev => ({ ...prev, pendingChanges: Math.max(0, prev.pendingChanges - 1) }));
  }, []);

  const setPendingCount = useCallback((count: number) => {
    setStatus(prev => ({ ...prev, pendingChanges: count }));
  }, []);

  const setTriggerSync = useCallback((_fn: () => Promise<void>) => {
    // No-op with PowerSync — sync is handled by the SDK
  }, []);

  const value = useMemo<SyncContextValue>(() => ({
    ...status,
    db,
    isReady,
    reportSync,
    reportSyncStart,
    reportSyncError,
    incrementPending,
    decrementPending,
    setPendingCount,
    triggerSync,
    setTriggerSync,
  }), [status, db, isReady, reportSync, reportSyncStart, reportSyncError, incrementPending, decrementPending, setPendingCount, triggerSync, setTriggerSync]);

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
      db: null,
      isReady: false,
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
      triggerSync: async () => {},
      setTriggerSync: () => {},
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
