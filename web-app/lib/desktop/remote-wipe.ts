/**
 * Remote Wipe Handler for Tauri Desktop Mode.
 *
 * Polls the hub/cloud for remote wipe signals. If a wipe is requested,
 * destroys the local database, clears credentials, and resets to setup state.
 */

import fs from 'fs';
import path from 'path';

import { closeLocalDatabase } from './local-db';

const WIPE_POLL_INTERVAL_MS = 60_000; // 1 minute

let wipeTimer: ReturnType<typeof setInterval> | null = null;

interface WipeCheckResponse {
  wipe_requested: boolean;
  hub_id?: string;
  requested_by?: string;
}

/**
 * Check if a remote wipe has been requested for this device.
 */
export async function checkRemoteWipe(apiUrl: string, authToken: string): Promise<WipeCheckResponse> {
  try {
    const response = await fetch(`${apiUrl}/api/hub/wipe-check/`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return { wipe_requested: false };
    return await response.json();
  } catch {
    return { wipe_requested: false };
  }
}

/**
 * Execute a local wipe: destroy the database, backups, and cached credentials.
 * This is irreversible.
 */
export function executeLocalWipe(): { wiped: boolean; details: string[] } {
  const details: string[] = [];

  // 1. Close the database
  try {
    closeLocalDatabase();
    details.push('Database connection closed');
  } catch {
    details.push('Database was already closed');
  }

  // 2. Remove database files
  const dataDir =
    process.env.APPDATA ||
    process.env.XDG_DATA_HOME ||
    path.join(process.env.HOME || '/tmp', '.local', 'share');
  const appDir = path.join(dataDir, 'digital.vitora.hmis');
  const dbDir = path.join(appDir, 'db');
  const backupDir = path.join(appDir, 'backups');

  // Remove DB files
  for (const ext of ['', '-wal', '-shm']) {
    const dbFile = path.join(dbDir, `vitora.db${ext}`);
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
      details.push(`Removed ${dbFile}`);
    }
  }

  // 3. Remove all backups
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    details.push('Removed all backups');
  }

  // 4. Remove config (credentials, tokens)
  const configFile = path.join(appDir, 'config.json');
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
    details.push('Removed config (credentials wiped)');
  }

  console.log('[RemoteWipe] Local wipe executed:', details);
  return { wiped: true, details };
}

/**
 * Start polling for remote wipe signals.
 * On wipe detection, executes local wipe and calls the onWipe callback.
 */
export function startWipeMonitor(
  apiUrl: string,
  authToken: string,
  onWipe: (details: string[]) => void,
  intervalMs = WIPE_POLL_INTERVAL_MS
): void {
  if (wipeTimer) return;

  wipeTimer = setInterval(async () => {
    const result = await checkRemoteWipe(apiUrl, authToken);
    if (result.wipe_requested) {
      console.warn(`[RemoteWipe] Wipe requested by ${result.requested_by}. Executing...`);
      stopWipeMonitor();
      const { details } = executeLocalWipe();
      onWipe(details);
    }
  }, intervalMs);

  console.log('[RemoteWipe] Wipe monitor started');
}

/**
 * Stop the wipe monitor.
 */
export function stopWipeMonitor(): void {
  if (wipeTimer) {
    clearInterval(wipeTimer);
    wipeTimer = null;
  }
}
