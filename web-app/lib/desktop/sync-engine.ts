/**
 * Sync Engine for Tauri Desktop Mode.
 *
 * Manages bidirectional sync between the local SQLite database
 * and the remote server (cloud or facility hub) via REST API.
 *
 * Push: Local changes → POST /api/sync/push/
 * Pull: GET /api/sync/pull/?since=<ts> → Local SQLite
 */

import { getLocalDb, isLocalDbAvailable } from './local-db';

interface SyncChange {
  table: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  record_id: string | null;
  data: Record<string, unknown>;
  timestamp: string;
  client_id: string;
}

interface PushResponse {
  accepted: number;
  rejected: number;
  conflicts: Array<{
    index: number;
    table: string;
    record_id: string | null;
    conflict_id: number;
    local_data: Record<string, unknown>;
    remote_data: Record<string, unknown>;
  }>;
  rejections: Array<{
    index: number;
    table: string;
    record_id: string | null;
    reason: string;
  }>;
  server_timestamp: string;
}

interface PullChange {
  table: string;
  operation: string;
  record_id: string | null;
  data: Record<string, unknown>;
  timestamp: string;
  server_sequence: number;
}

interface PullResponse {
  changes: PullChange[];
  server_timestamp: string;
  has_more: boolean;
  next_cursor: string | null;
}

interface SyncStatus {
  lastSync: string | null;
  pendingChanges: number;
  failedChanges: number;
  isOnline: boolean;
  isSyncing: boolean;
}

// Singleton state
let syncing = false;
let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get the configured API URL from environment.
 */
function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'https://api.vitora.digital';
}

/**
 * Get auth token for sync requests.
 * In desktop mode, tokens are stored locally.
 */
function getAuthToken(): string | null {
  if (!isLocalDbAvailable()) return null;
  const db = getLocalDb();
  const row = db.prepare('SELECT value FROM _sync_meta WHERE key = ?').get('auth_token') as
    | { value: string }
    | undefined;
  return row?.value || null;
}

/**
 * Store auth token for sync requests.
 */
export function setAuthToken(token: string): void {
  if (!isLocalDbAvailable()) return;
  const db = getLocalDb();
  db.prepare('INSERT OR REPLACE INTO _sync_meta (key, value) VALUES (?, ?)').run(
    'auth_token',
    token
  );
}

/**
 * Get the client device ID (persistent across sessions).
 */
function getClientId(): string {
  if (!isLocalDbAvailable()) return 'unknown';
  const db = getLocalDb();
  let row = db.prepare('SELECT value FROM _sync_meta WHERE key = ?').get('client_id') as
    | { value: string }
    | undefined;
  if (!row) {
    const id = `tauri-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    db.prepare('INSERT INTO _sync_meta (key, value) VALUES (?, ?)').run('client_id', id);
    return id;
  }
  return row.value;
}

/**
 * Get the last sync timestamp.
 */
function getLastSyncTimestamp(): string | null {
  if (!isLocalDbAvailable()) return null;
  const db = getLocalDb();
  const row = db.prepare('SELECT value FROM _sync_meta WHERE key = ?').get('last_sync') as
    | { value: string }
    | undefined;
  return row?.value || null;
}

/**
 * Set the last sync timestamp.
 */
function setLastSyncTimestamp(ts: string): void {
  if (!isLocalDbAvailable()) return;
  const db = getLocalDb();
  db.prepare('INSERT OR REPLACE INTO _sync_meta (key, value) VALUES (?, ?)').run('last_sync', ts);
}

// ---------------------------------------------------------------------------
// Queue local changes (called when user writes data)
// ---------------------------------------------------------------------------

/**
 * Queue a local change for sync to server.
 * Call this after writing to the local database.
 */
export function queueChange(
  tableName: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  recordId: string | null,
  data: Record<string, unknown>
): void {
  if (!isLocalDbAvailable()) return;
  const db = getLocalDb();
  db.prepare(
    `INSERT INTO _sync_outbox (table_name, operation, record_id, data)
     VALUES (?, ?, ?, ?)`
  ).run(tableName, operation, recordId, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Push: Local → Server
// ---------------------------------------------------------------------------

/**
 * Push pending local changes to the server.
 * Returns the number of accepted changes.
 */
export async function pushChanges(): Promise<PushResponse | null> {
  if (!isLocalDbAvailable()) return null;
  const db = getLocalDb();
  const token = getAuthToken();
  if (!token) return null;

  // Get pending outbox entries (batch of 100)
  const pending = db
    .prepare(
      `SELECT id, table_name, operation, record_id, data, created_at
       FROM _sync_outbox
       WHERE status = 'PENDING'
       ORDER BY id ASC
       LIMIT 100`
    )
    .all() as Array<{
    id: number;
    table_name: string;
    operation: string;
    record_id: string | null;
    data: string;
    created_at: string;
  }>;

  if (pending.length === 0) return null;

  const clientId = getClientId();
  const changes: SyncChange[] = pending.map((row) => ({
    table: row.table_name,
    operation: row.operation as 'CREATE' | 'UPDATE' | 'DELETE',
    record_id: row.record_id,
    data: JSON.parse(row.data),
    timestamp: row.created_at,
    client_id: clientId,
  }));

  // Mark as pushing
  const ids = pending.map((r) => r.id);
  db.prepare(
    `UPDATE _sync_outbox SET status = 'PUSHING' WHERE id IN (${ids.map(() => '?').join(',')})`
  ).run(...ids);

  try {
    const response = await fetch(`${getApiUrl()}/api/sync/push/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ client_id: clientId, changes }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      // Mark back as pending for retry
      db.prepare(
        `UPDATE _sync_outbox SET status = 'PENDING', retry_count = retry_count + 1 WHERE id IN (${ids.map(() => '?').join(',')})`
      ).run(...ids);
      return null;
    }

    const result: PushResponse = await response.json();

    // Mark successfully pushed entries as done
    db.prepare(
      `DELETE FROM _sync_outbox WHERE id IN (${ids.map(() => '?').join(',')})`
    ).run(...ids);

    return result;
  } catch (error) {
    // Network error — mark back as pending
    db.prepare(
      `UPDATE _sync_outbox SET status = 'PENDING', retry_count = retry_count + 1 WHERE id IN (${ids.map(() => '?').join(',')})`
    ).run(...ids);
    console.warn('[Sync] Push failed:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pull: Server → Local
// ---------------------------------------------------------------------------

/**
 * Pull changes from the server since last sync.
 * Applies them to the local database.
 */
export async function pullChanges(full = false): Promise<number> {
  if (!isLocalDbAvailable()) return 0;
  const token = getAuthToken();
  if (!token) return 0;

  const since = full ? null : getLastSyncTimestamp();
  const params = new URLSearchParams();
  if (full) {
    params.set('full', 'true');
  } else if (since) {
    params.set('since', since);
  } else {
    params.set('full', 'true'); // First sync — get everything
  }

  let totalApplied = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(`${getApiUrl()}/api/sync/pull/?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.warn('[Sync] Pull failed:', response.status);
        break;
      }

      const result: PullResponse = await response.json();

      // Apply changes to local DB
      applyPulledChanges(result.changes);
      totalApplied += result.changes.length;

      // Update cursor for next page
      hasMore = result.has_more;
      if (hasMore && result.next_cursor) {
        params.set('cursor', result.next_cursor);
      }

      // Update last sync timestamp
      setLastSyncTimestamp(result.server_timestamp);
    } catch (error) {
      console.warn('[Sync] Pull failed:', error);
      break;
    }
  }

  return totalApplied;
}

/**
 * Apply pulled changes to the local SQLite database.
 */
function applyPulledChanges(changes: PullChange[]): void {
  if (!isLocalDbAvailable()) return;
  const db = getLocalDb();

  const applyAll = db.transaction(() => {
    for (const change of changes) {
      const { table, operation, record_id, data } = change;

      if (operation === 'DELETE' && record_id) {
        db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(record_id);
        continue;
      }

      if (operation === 'CREATE' || operation === 'UPDATE') {
        // Upsert pattern: INSERT OR REPLACE
        const columns = Object.keys(data);
        if (!columns.includes('id') && record_id) {
          columns.unshift('id');
          (data as Record<string, unknown>)['id'] = record_id;
        }

        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((col) => {
          const val = data[col];
          if (val === null || val === undefined) return null;
          if (typeof val === 'object') return JSON.stringify(val);
          return val;
        });

        db.prepare(
          `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`
        ).run(...values);
      }
    }
  });

  applyAll();
}

// ---------------------------------------------------------------------------
// Full sync cycle
// ---------------------------------------------------------------------------

/**
 * Run a full sync cycle: push local changes, then pull remote changes.
 */
export async function runSyncCycle(): Promise<{ pushed: number; pulled: number } | null> {
  if (syncing) return null;
  if (!isLocalDbAvailable()) return null;

  syncing = true;
  try {
    // Push first, then pull
    const pushResult = await pushChanges();
    const pulled = await pullChanges();

    return {
      pushed: pushResult?.accepted || 0,
      pulled,
    };
  } finally {
    syncing = false;
  }
}

/**
 * Start automatic sync on a timer.
 * Syncs every `intervalMs` milliseconds (default 30s).
 */
export function startAutoSync(intervalMs = 30000): void {
  if (syncTimer) return; // Already running
  syncTimer = setInterval(() => {
    runSyncCycle().catch((err) => console.warn('[Sync] Auto-sync error:', err));
  }, intervalMs);
  console.log(`[Sync] Auto-sync started (every ${intervalMs / 1000}s)`);
}

/**
 * Stop automatic sync.
 */
export function stopAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[Sync] Auto-sync stopped');
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Get current sync status.
 */
export function getSyncStatus(): SyncStatus {
  if (!isLocalDbAvailable()) {
    return { lastSync: null, pendingChanges: 0, failedChanges: 0, isOnline: false, isSyncing: false };
  }

  const db = getLocalDb();
  const pending = db.prepare("SELECT COUNT(*) as count FROM _sync_outbox WHERE status = 'PENDING'").get() as { count: number };
  const failed = db.prepare("SELECT COUNT(*) as count FROM _sync_outbox WHERE status = 'FAILED'").get() as { count: number };

  return {
    lastSync: getLastSyncTimestamp(),
    pendingChanges: pending.count,
    failedChanges: failed.count,
    isOnline: true, // Will be set by connectivity check
    isSyncing: syncing,
  };
}
