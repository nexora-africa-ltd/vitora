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

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { PowerSyncDatabase } from '@powersync/web';
import { powersyncSchema } from '@/lib/powersync/schema';
import { VitoraPowerSyncConnector, onSyncUploadEvent } from '@/lib/powersync/connector';
import { registerAuthCleanup, waitForAuthCleanup } from '@/lib/auth/storage';
import { useAuth } from '@/lib/auth/context';
import { getActiveFacilityId, onFacilityChange } from '@/lib/api/client';

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

/** Serialize ownership changes so an old connection cannot race a new session. */
let _dbInstance: PowerSyncDatabase | null = null;
let lifecycle: Promise<unknown> = Promise.resolve();
let generation = 0;
let legacyChecked = false;

function serializeLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const next = lifecycle.then(operation);
  lifecycle = next.catch(() => undefined);
  return next;
}

/** Erase downloaded data; quarantine unsent work in its owner-specific database. */
export async function clearPowerSyncDatabase(database: PowerSyncDatabase): Promise<number> {
  try {
    await database.disconnect();
    const rows = await database.getAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM ps_crud');
    const pending = rows[0]?.cnt ?? 0;
    if (pending === 0) await database.disconnectAndClear({ clearLocal: true });
    return pending;
  } finally {
    await database.close();
  }
}

function clearPowerSyncSession(): Promise<void> {
  generation += 1;
  return serializeLifecycle(async () => {
    const database = _dbInstance;
    _dbInstance = null;
    if (database) {
      const pending = await clearPowerSyncDatabase(database);
      if (pending) console.warn('Unsynced work retained in the signed-out user’s isolated database.');
    }
  });
}

registerAuthCleanup(clearPowerSyncSession);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [activeFacility, setActiveFacility] = useState(() => getActiveFacilityId());
  const owner = isAuthenticated && user
    ? `user-${user.id}-facility-${activeFacility ?? user.facility?.id ?? 'none'}`
    : null;
  const [dbOwner, setDbOwner] = useState<string | null>(null);
  const [credentialExpiry, setCredentialExpiry] = useState<number | null>(null);
  const verifiedAfter = useRef(0);
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

  useEffect(() => onFacilityChange(() => setActiveFacility(getActiveFacilityId())), []);

  // A cached profile is not sufficient to reopen persisted health records.
  useEffect(() => {
    setDb(null);
    setDbOwner(null);
    setIsReady(false);
    setHasSynced(false);
    setCredentialExpiry(null);
    connectedRef.current = false;
    if (!process.env.NEXT_PUBLIC_POWERSYNC_URL || !owner) return;
    const sessionGeneration = ++generation;
    let disposed = false;
    const current = () => !disposed && sessionGeneration === generation;
    void waitForAuthCleanup().then(() => serializeLifecycle(async () => {
      if (!current()) return;
      // Do not adopt unowned legacy data. Preserve unsent legacy work for
      // explicit owner-verified recovery; it is never exposed to a new session.
      if (!legacyChecked) {
        const legacy = new PowerSyncDatabase({ schema: powersyncSchema, database: { dbFilename: 'vitora.db' } });
        await legacy.init();
        const pending = await clearPowerSyncDatabase(legacy);
        legacyChecked = true;
        if (pending) console.warn('Legacy offline work requires owner-verified recovery.');
      }
      const connector = new VitoraPowerSyncConnector((expiry) => {
        if (current()) {
          verifiedAfter.current = Date.now();
          setHasSynced(false);
          setCredentialExpiry(expiry.getTime());
        }
      });
      const credentials = await connector.fetchCredentials();
      if (!current()) return;
      verifiedAfter.current = Date.now();
      const database = new PowerSyncDatabase({
        schema: powersyncSchema,
        database: { dbFilename: `vitora-policy2-user-${credentials.userId}-facility-${credentials.facilityId ?? 'none'}.db` },
      });
      _dbInstance = database;
      await database.init();
      await database.connect(connector);
      if (!current()) return;
      connectedRef.current = true;
      setDb(database);
      setDbOwner(owner);
      setIsReady(true);
    })).catch(() => {
      if (current()) setStatus((prev) => ({ ...prev, lastError: 'Offline storage could not be authorized. Using API mode.' }));
    });

    return () => {
      disposed = true;
      if (sessionGeneration === generation) {
        void clearPowerSyncSession().catch(() => console.error('Offline storage cleanup failed.'));
      }
    };
  }, [owner]);

  // Bound offline access to credential validity, including suspended tabs.
  useEffect(() => {
    if (!credentialExpiry) return;
    const expire = () => { if (Date.now() >= credentialExpiry) logout(); };
    const timer = setTimeout(expire, Math.max(0, credentialExpiry - Date.now()));
    document.addEventListener('visibilitychange', expire);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', expire); };
  }, [credentialExpiry, logout]);

  // Track sync status changes from the PowerSync database
  useEffect(() => {
    if (!db) return;

    const listener: Parameters<typeof db.registerListener>[0] = {
      statusChanged: (newStatus) => {
        const synced = newStatus.hasSynced === true &&
          (newStatus.lastSyncedAt?.getTime() ?? 0) >= verifiedAfter.current;
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

        setStatus((prev) => ({
          ...prev,
          isSyncing:
            newStatus.dataFlowStatus?.downloading === true ||
            newStatus.dataFlowStatus?.uploading === true,
          lastSyncTime: syncedAt ?? prev.lastSyncTime,
          // Only overwrite lastError if there's a new error, or clear it on successful connection
          lastError: errorMsg ?? (connected ? null : prev.lastError),
        }));

        if (synced) setHasSynced(true);

        setPsHealth((prev) => ({
          ...prev,
          connected,
          hasSynced: synced || prev.hasSynced,
          lastSyncedAt: syncedAt ?? prev.lastSyncedAt,
        }));
      },
    };
    const unsubscribe = db.registerListener(listener);
    listener.statusChanged?.(db.currentStatus);

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
        const result = await db!.getAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM ps_crud');
        const count = result[0]?.cnt ?? 0;
        if (!disposed) {
          setStatus((prev) =>
            prev.pendingChanges !== count ? { ...prev, pendingChanges: count } : prev
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
      {
        onChange: () => {
          if (!disposed) pollCrudCount();
        },
      },
      { signal: abortController.signal }
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
        setStatus((prev) => ({
          ...prev,
          lastError: `Sync error (${event.table}): ${event.message}`,
        }));
      } else if (event.type === 'upload_success') {
        // Clear error on next successful upload
        setStatus((prev) => (prev.lastError ? { ...prev, lastError: null } : prev));
      }
    });
    return unsubscribe;
  }, []);

  const triggerSync = useCallback(async () => {
    if (!db || db !== _dbInstance || status.isSyncing) return;
    try {
      setStatus((prev) => ({ ...prev, isSyncing: true, lastError: null }));
      // Trigger an immediate sync cycle
      await db.connect(new VitoraPowerSyncConnector((expiry) => {
        if (db === _dbInstance) {
          verifiedAfter.current = Date.now();
          setHasSynced(false);
          setCredentialExpiry(expiry.getTime());
        }
      }));
      setStatus((prev) => ({ ...prev, isSyncing: false, lastSyncTime: new Date() }));
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastError: error instanceof Error ? error.message : 'Sync failed',
      }));
    }
  }, [db, status.isSyncing]);

  // Legacy callbacks — kept for backward compatibility with useAutoSave etc.
  const reportSync = useCallback(() => {
    setStatus((prev) => ({ ...prev, lastSyncTime: new Date(), isSyncing: false, lastError: null }));
  }, []);

  const reportSyncStart = useCallback(() => {
    setStatus((prev) => ({ ...prev, isSyncing: true, lastError: null }));
  }, []);

  const reportSyncError = useCallback((error: string) => {
    setStatus((prev) => ({ ...prev, isSyncing: false, lastError: error }));
  }, []);

  const incrementPending = useCallback(() => {
    setStatus((prev) => ({ ...prev, pendingChanges: prev.pendingChanges + 1 }));
  }, []);

  const decrementPending = useCallback(() => {
    setStatus((prev) => ({ ...prev, pendingChanges: Math.max(0, prev.pendingChanges - 1) }));
  }, []);

  const setPendingCount = useCallback((count: number) => {
    setStatus((prev) => ({ ...prev, pendingChanges: count }));
  }, []);

  const setTriggerSync = useCallback((_fn: () => Promise<void>) => {
    // No-op with PowerSync — sync is handled by the SDK
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({
      ...status,
      db: owner && dbOwner === owner && hasSynced ? db : null,
      isReady: !!owner && dbOwner === owner && isReady && hasSynced,
      hasSynced: !!owner && dbOwner === owner && hasSynced,
      powerSyncHealth: psHealth,
      reportSync,
      reportSyncStart,
      reportSyncError,
      incrementPending,
      decrementPending,
      setPendingCount,
      triggerSync,
      setTriggerSync,
    }),
    [
      status,
      owner,
      dbOwner,
      db,
      isReady,
      hasSynced,
      psHealth,
      reportSync,
      reportSyncStart,
      reportSyncError,
      incrementPending,
      decrementPending,
      setPendingCount,
      triggerSync,
      setTriggerSync,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    // Return a default value for components outside the provider
    return {
      db: null,
      isReady: false,
      hasSynced: false,
      powerSyncHealth: {
        configured: false,
        connected: false,
        hasSynced: false,
        lastSyncedAt: null,
      },
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
