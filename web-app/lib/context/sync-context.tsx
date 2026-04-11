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
import { VitoraPowerSyncConnector, onSyncUploadEvent } from '@/lib/powersync/connector';
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

/** PowerSync connection health exposed to consumers (e.g. status indicator). */
export interface PowerSyncHealth {
  /** Whether a PowerSync URL is configured at all */
  configured: boolean;
  /** Whether the streaming connection to PowerSync Cloud is active */
  connected: boolean;
  /** Whether at least one full sync cycle has completed (data exists locally) */
  hasSynced: boolean;
  /** Last time data was synced from PowerSync Cloud */
  lastSyncedAt: Date | null;
}

interface SyncContextValue extends SyncStatus {
  /** The PowerSync database instance (for direct queries) */
  db: PowerSyncDatabase | null;
  /** Whether the PowerSync DB has finished initializing (safe to query) */
  isReady: boolean;
  /** Whether PowerSync has completed at least one sync (safe to read local data) */
  hasSynced: boolean;
  /** PowerSync connection health details */
  powerSyncHealth: PowerSyncHealth;
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
  const [hasSynced, setHasSynced] = useState(false);
  const [psHealth, setPsHealth] = useState<PowerSyncHealth>(() => ({
    configured: !!process.env.NEXT_PUBLIC_POWERSYNC_URL,
    connected: false,
    hasSynced: false,
    lastSyncedAt: null,
  }));
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

    // If no PowerSync URL is configured, run in pure API-only mode.
    // Don't initialize any local database — leave db=null, isReady=false.
    // useOfflineQuery checks isReady and falls through to React Query API.
    // usePowerSyncQuery handles db=null by returning isLoading=true (harmless).
    if (!powersyncUrl) {
      return;
    }

    const database = getOrCreateDatabase();
    const connector = new VitoraPowerSyncConnector();

    let disposed = false;

    async function connect() {
      // Step 1: Initialize the WASM/SQLite database.
      // If this fails (SharedArrayBuffer unavailable, WASM load error),
      // leave db=null so the app stays in pure API-only mode.
      try {
        await database.init();
      } catch (initError) {
        console.error('[PowerSync] Database init failed — falling back to API-only mode:', initError);
        if (!disposed) {
          setPsHealth(prev => ({ ...prev, connected: false }));
          setStatus(prev => ({
            ...prev,
            lastError: initError instanceof Error ? initError.message : 'DB init failed',
          }));
        }
        return; // db stays null, isReady stays false → pure API mode
      }

      // Init succeeded — expose the db so local queries are possible,
      // and mark ready so useOfflineQuery can proceed (it also checks hasSynced).
      if (!disposed) {
        setDb(database);
        setIsReady(true);
      }

      // Step 2: Connect to PowerSync Cloud for streaming sync.
      // If this fails (bad JWT, cloud unreachable), the db is still usable
      // but hasSynced stays false → useOfflineQuery falls back to API.
      const token = tokenStorage.getAccessToken();
      if (!token) {
        // No auth token yet — db is ready for local use.
        // PowerSync will connect once the user logs in.
        return;
      }

      try {
        await database.connect(connector);
        connectedRef.current = true;

        if (!disposed) {
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
          setPsHealth(prev => ({ ...prev, connected: false }));
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
        const synced = newStatus.hasSynced === true;
        const connected = newStatus.connected === true;
        const syncedAt = newStatus.lastSyncedAt ? new Date(newStatus.lastSyncedAt) : null;

        // Surface download errors (JWT rejection, network failure, bad sync rules)
        // These happen asynchronously after connect() resolves — they're the real
        // reason PowerSync fails silently in staging.
        const downloadError = newStatus.dataFlowStatus?.downloadError;
        const uploadError = newStatus.dataFlowStatus?.uploadError;
        const errorMsg = downloadError?.message || uploadError?.message || null;

        if (downloadError) {
          console.error('[PowerSync] Download/connection error:', downloadError);
        }

        setStatus(prev => ({
          ...prev,
          isSyncing: newStatus.dataFlowStatus?.downloading === true ||
                     newStatus.dataFlowStatus?.uploading === true,
          lastSyncTime: syncedAt ?? prev.lastSyncTime,
          // Only overwrite lastError if there's a new error, or clear it on successful connection
          lastError: errorMsg ?? (connected ? null : prev.lastError),
        }));

        if (synced) setHasSynced(true);

        setPsHealth(prev => ({
          ...prev,
          connected,
          hasSynced: synced || prev.hasSynced,
          lastSyncedAt: syncedAt ?? prev.lastSyncedAt,
        }));
      },
    });

    return () => {
      unsubscribe?.();
    };
  }, [db]);

  // Poll the CRUD upload queue for an accurate pending changes count.
  // PowerSync's ps_crud table holds local writes until the connector uploads them.
  useEffect(() => {
    if (!db) return;

    let disposed = false;

    async function pollCrudCount() {
      try {
        const result = await db!.getAll<{ cnt: number }>(
          'SELECT COUNT(*) as cnt FROM ps_crud'
        );
        const count = result[0]?.cnt ?? 0;
        if (!disposed) {
          setStatus(prev =>
            prev.pendingChanges !== count
              ? { ...prev, pendingChanges: count }
              : prev
          );
        }
      } catch {
        // ps_crud may not exist if PowerSync hasn't initialized upload queue
      }
    }

    // Initial poll
    pollCrudCount();

    // Re-poll when any local table changes (covers inserts, uploads completing)
    const abortController = new AbortController();
    db.onChange(
      { onChange: () => { if (!disposed) pollCrudCount(); } },
      { signal: abortController.signal },
    );

    return () => {
      disposed = true;
      abortController.abort();
    };
  }, [db]);

  // Surface upload errors from the connector's event bus
  useEffect(() => {
    const unsubscribe = onSyncUploadEvent((event) => {
      if (event.type === 'upload_error') {
        setStatus(prev => ({
          ...prev,
          lastError: `Sync error (${event.table}): ${event.message}`,
        }));
      } else if (event.type === 'upload_success') {
        // Clear error on next successful upload
        setStatus(prev =>
          prev.lastError ? { ...prev, lastError: null } : prev
        );
      }
    });
    return unsubscribe;
  }, []);

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
    hasSynced,
    powerSyncHealth: psHealth,
    reportSync,
    reportSyncStart,
    reportSyncError,
    incrementPending,
    decrementPending,
    setPendingCount,
    triggerSync,
    setTriggerSync,
  }), [status, db, isReady, hasSynced, psHealth, reportSync, reportSyncStart, reportSyncError, incrementPending, decrementPending, setPendingCount, triggerSync, setTriggerSync]);

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
      hasSynced: false,
      powerSyncHealth: { configured: false, connected: false, hasSynced: false, lastSyncedAt: null },
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
