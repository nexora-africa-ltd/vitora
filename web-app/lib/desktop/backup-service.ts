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

// ---------------------------------------------------------------------------
// Encrypted Backup (AES-256-GCM + facility passphrase)
// ---------------------------------------------------------------------------

const ENCRYPTION_MAGIC = Buffer.from('VITORA_ENC_V1\0');
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_ITERATIONS = 100_000;

/**
 * Derive a 256-bit AES key from a passphrase using PBKDF2.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  const crypto = require('crypto');
  return crypto.pbkdf2Sync(passphrase, salt, KEY_ITERATIONS, 32, 'sha256');
}

/**
 * Export an encrypted backup to a destination path (e.g., USB drive).
 * Uses AES-256-GCM with a passphrase-derived key (PBKDF2).
 *
 * File format:
 *   [14B magic] [32B salt] [12B iv] [encrypted data] [16B auth tag]
 */
export function exportEncryptedBackup(
  destPath: string,
  passphrase: string
): BackupInfo | null {
  if (!isLocalDbAvailable()) return null;
  if (!passphrase || passphrase.length < 8) {
    console.error('[Backup] Passphrase must be at least 8 characters');
    return null;
  }

  const crypto = require('crypto');
  const db = getLocalDb();

  try {
    // First create a plain backup to a temp file
    const tmpDir = path.join(getBackupDir(), 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `export-${Date.now()}.db`);

    db.backup(tmpPath);
    const plainData = fs.readFileSync(tmpPath);

    // Encrypt
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(passphrase, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainData), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Write encrypted file: magic + salt + iv + ciphertext + tag
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });
    const fd = fs.openSync(destPath, 'w');
    fs.writeSync(fd, ENCRYPTION_MAGIC);
    fs.writeSync(fd, salt);
    fs.writeSync(fd, iv);
    fs.writeSync(fd, encrypted);
    fs.writeSync(fd, authTag);
    fs.closeSync(fd);

    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    const stats = fs.statSync(destPath);
    console.log(`[Backup] Encrypted export: ${destPath} (${formatBytes(stats.size)})`);

    return {
      path: destPath,
      timestamp: new Date().toISOString(),
      sizeBytes: stats.size,
      type: 'export',
    };
  } catch (error) {
    console.error('[Backup] Encrypted export failed:', error);
    return null;
  }
}

/**
 * Import and decrypt an encrypted backup file.
 * Returns the decrypted database as a temporary file path, or null on failure.
 */
export function importEncryptedBackup(
  encryptedPath: string,
  passphrase: string
): string | null {
  const crypto = require('crypto');

  try {
    const fileData = fs.readFileSync(encryptedPath);

    // Verify magic header
    const magic = fileData.subarray(0, ENCRYPTION_MAGIC.length);
    if (!magic.equals(ENCRYPTION_MAGIC)) {
      console.error('[Backup] Not a Vitora encrypted backup file');
      return null;
    }

    let offset = ENCRYPTION_MAGIC.length;
    const salt = fileData.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;
    const iv = fileData.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    // Auth tag is the last 16 bytes
    const authTag = fileData.subarray(fileData.length - AUTH_TAG_LENGTH);
    const ciphertext = fileData.subarray(offset, fileData.length - AUTH_TAG_LENGTH);

    // Decrypt
    const key = deriveKey(passphrase, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      console.error('[Backup] Decryption failed — wrong passphrase or corrupted file');
      return null;
    }

    // Write decrypted data to temp file
    const tmpDir = path.join(getBackupDir(), 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `decrypted-${Date.now()}.db`);
    fs.writeFileSync(tmpPath, decrypted);

    // Verify integrity of decrypted database
    const Database = require('better-sqlite3');
    const testDb = new Database(tmpPath, { readonly: true });
    const result = testDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
    testDb.close();

    if (result[0]?.integrity_check !== 'ok') {
      console.error('[Backup] Decrypted database is corrupted');
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      return null;
    }

    console.log('[Backup] Encrypted backup decrypted and verified');
    return tmpPath;
  } catch (error) {
    console.error('[Backup] Import failed:', error);
    return null;
  }
}

/**
 * Restore from an encrypted backup: decrypt, verify, then replace current DB.
 */
export function restoreFromEncryptedBackup(
  encryptedPath: string,
  passphrase: string
): boolean {
  const tmpPath = importEncryptedBackup(encryptedPath, passphrase);
  if (!tmpPath) return false;

  const success = restoreFromBackup(tmpPath);

  // Clean up temp file
  try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

  return success;
}
