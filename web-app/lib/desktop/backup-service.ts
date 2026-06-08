/**
 * Backup Service for Tauri Desktop Mode.
 *
 * Provides automated local backups of the SQLite database:
 * - Rolling backups (every 30 min while app is running, keep last 3)
 * - Daily backups (on app launch/shutdown, keep last 14)
 * - Export to external location (USB drive)
 * - Integrity checking and recovery
 */

import path from 'path';
import fs from 'fs';

import { checkIntegrity, getLocalDb, isLocalDbAvailable } from './local-db';

interface BackupInfo {
  path: string;
  timestamp: string;
  sizeBytes: number;
  type: 'rolling' | 'daily' | 'export';
}

// Singleton state
let backupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get the base backup directory.
 */
function getBackupDir(): string {
  const dataDir =
    process.env.APPDATA ||
    process.env.XDG_DATA_HOME ||
    path.join(process.env.HOME || '/tmp', '.local', 'share');
  return path.join(dataDir, 'digital.vitora.hmis', 'backups');
}

/**
 * Get the database file path.
 */
function getDbPath(): string {
  const dataDir =
    process.env.APPDATA ||
    process.env.XDG_DATA_HOME ||
    path.join(process.env.HOME || '/tmp', '.local', 'share');
  return path.join(dataDir, 'digital.vitora.hmis', 'db', 'vitora.db');
}

/**
 * Create a backup of the local database.
 * Uses SQLite's backup API via better-sqlite3 for safe concurrent access.
 */
export function createBackup(type: 'rolling' | 'daily'): BackupInfo | null {
  if (!isLocalDbAvailable()) return null;

  const db = getLocalDb();
  const backupDir = path.join(getBackupDir(), type);
  fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const timestamp =
    type === 'daily'
      ? now.toISOString().split('T')[0] // 2026-06-08
      : now.toISOString().replace(/[:.]/g, '-'); // 2026-06-08T10-30-00-000Z

  const filename = `vitora-${timestamp}.db`;
  const destPath = path.join(backupDir, filename);

  try {
    // Use backup API (atomic, safe for concurrent reads)
    db.backup(destPath);

    const stats = fs.statSync(destPath);

    // Prune old backups
    const maxCount = type === 'rolling' ? 3 : 14;
    pruneBackups(backupDir, maxCount);

    console.log(`[Backup] ${type} backup created: ${filename} (${formatBytes(stats.size)})`);

    return {
      path: destPath,
      timestamp: now.toISOString(),
      sizeBytes: stats.size,
      type,
    };
  } catch (error) {
    console.error(`[Backup] Failed to create ${type} backup:`, error);
    return null;
  }
}

/**
 * Export a backup to an external location (e.g., USB drive).
 */
export function exportBackup(destPath: string): BackupInfo | null {
  if (!isLocalDbAvailable()) return null;

  const db = getLocalDb();

  try {
    // Ensure directory exists
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });

    db.backup(destPath);
    const stats = fs.statSync(destPath);

    console.log(`[Backup] Exported to: ${destPath} (${formatBytes(stats.size)})`);

    return {
      path: destPath,
      timestamp: new Date().toISOString(),
      sizeBytes: stats.size,
      type: 'export',
    };
  } catch (error) {
    console.error('[Backup] Export failed:', error);
    return null;
  }
}

/**
 * List available backups.
 */
export function listBackups(type: 'rolling' | 'daily'): BackupInfo[] {
  const backupDir = path.join(getBackupDir(), type);
  if (!fs.existsSync(backupDir)) return [];

  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .sort()
    .reverse()
    .map((filename) => {
      const filePath = path.join(backupDir, filename);
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        timestamp: stats.mtime.toISOString(),
        sizeBytes: stats.size,
        type,
      };
    });
}

/**
 * Restore from a backup file.
 * Replaces the current database with the backup.
 */
export function restoreFromBackup(backupPath: string): boolean {
  if (!fs.existsSync(backupPath)) {
    console.error(`[Backup] Backup file not found: ${backupPath}`);
    return false;
  }

  const dbPath = getDbPath();

  try {
    // Verify backup integrity before restoring
    const Database = require('better-sqlite3');
    const testDb = new Database(backupPath, { readonly: true });
    const result = testDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
    testDb.close();

    if (result[0]?.integrity_check !== 'ok') {
      console.error('[Backup] Backup file is corrupted, cannot restore');
      return false;
    }

    // Close current database (must be done by caller via closeLocalDatabase())
    // Copy backup over current db
    fs.copyFileSync(backupPath, dbPath);

    // Remove WAL and SHM files (they're stale after restore)
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    console.log(`[Backup] Restored from: ${backupPath}`);
    return true;
  } catch (error) {
    console.error('[Backup] Restore failed:', error);
    return false;
  }
}

/**
 * Attempt automatic recovery from corruption.
 * Tries backups in order: rolling → daily → full re-sync.
 */
export function attemptRecovery(): { recovered: boolean; source: string } {
  // Try rolling backups first (most recent)
  const rolling = listBackups('rolling');
  for (const backup of rolling) {
    if (verifyBackupIntegrity(backup.path)) {
      if (restoreFromBackup(backup.path)) {
        return { recovered: true, source: `rolling backup (${backup.timestamp})` };
      }
    }
  }

  // Try daily backups
  const daily = listBackups('daily');
  for (const backup of daily) {
    if (verifyBackupIntegrity(backup.path)) {
      if (restoreFromBackup(backup.path)) {
        return { recovered: true, source: `daily backup (${backup.timestamp})` };
      }
    }
  }

  // No valid backup found — will need full re-sync
  return { recovered: false, source: 'none' };
}

/**
 * Verify a backup file's integrity.
 */
function verifyBackupIntegrity(backupPath: string): boolean {
  try {
    const Database = require('better-sqlite3');
    const testDb = new Database(backupPath, { readonly: true });
    const result = testDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
    testDb.close();
    return result[0]?.integrity_check === 'ok';
  } catch {
    return false;
  }
}

/**
 * Start automated rolling backups on a timer.
 * Default: every 30 minutes.
 */
export function startAutoBackups(intervalMs = 30 * 60 * 1000): void {
  if (backupTimer) return;

  // Create a daily backup on start
  createBackup('daily');

  backupTimer = setInterval(() => {
    createBackup('rolling');
  }, intervalMs);

  console.log(`[Backup] Auto-backup started (every ${intervalMs / 60000} min)`);
}

/**
 * Stop automated backups.
 */
export function stopAutoBackups(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

/**
 * Create a shutdown backup (daily) — call on app close.
 */
export function createShutdownBackup(): void {
  createBackup('daily');
  stopAutoBackups();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove old backups, keeping only the most recent `maxCount`.
 */
function pruneBackups(dir: string, maxCount: number): void {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .sort()
    .reverse();

  for (const file of files.slice(maxCount)) {
    try {
      fs.unlinkSync(path.join(dir, file));
    } catch {
      // Ignore deletion errors
    }
  }
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
