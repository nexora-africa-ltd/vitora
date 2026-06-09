/**
 * Desktop Data Access Layer (DAL)
 *
 * Provides a unified data access interface for Tauri desktop mode.
 * - Reads from local SQLite (instant, offline-capable)
 * - Writes to local SQLite + queues change for server sync
 * - Falls back to API when local DB is not available
 *
 * This module is server-side only (runs in the Node.js sidecar).
 * The frontend accesses it via Next.js API routes.
 */

import { getLocalDb, isLocalDbAvailable } from './local-db';
import { queueChange } from './sync-engine';

export interface QueryOptions {
  table: string;
  where?: Record<string, unknown>;
  orderBy?: string;
  limit?: number;
  offset?: number;
}

export interface WriteOptions {
  table: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  recordId?: string;
  data: Record<string, unknown>;
}

/**
 * Query records from the local SQLite database.
 * Returns typed rows matching the query.
 */
export function queryLocal<T = Record<string, unknown>>(options: QueryOptions): T[] {
  if (!isLocalDbAvailable()) return [];

  const db = getLocalDb();
  const { table, where, orderBy, limit, offset } = options;

  let sql = `SELECT * FROM "${table}"`;
  const params: unknown[] = [];

  if (where && Object.keys(where).length > 0) {
    const conditions = Object.entries(where).map(([key, value]) => {
      if (value === null) return `"${key}" IS NULL`;
      params.push(value);
      return `"${key}" = ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }

  if (limit) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }

  if (offset) {
    sql += ` OFFSET ?`;
    params.push(offset);
  }

  return db.prepare(sql).all(...params) as T[];
}

/**
 * Get a single record by ID from local SQLite.
 */
export function getLocalById<T = Record<string, unknown>>(
  table: string,
  id: string
): T | null {
  if (!isLocalDbAvailable()) return null;
  const db = getLocalDb();
  return (db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as T) || null;
}

/**
 * Count records matching a filter.
 */
export function countLocal(table: string, where?: Record<string, unknown>): number {
  if (!isLocalDbAvailable()) return 0;

  const db = getLocalDb();
  let sql = `SELECT COUNT(*) as count FROM "${table}"`;
  const params: unknown[] = [];

  if (where && Object.keys(where).length > 0) {
    const conditions = Object.entries(where).map(([key, value]) => {
      if (value === null) return `"${key}" IS NULL`;
      params.push(value);
      return `"${key}" = ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  const result = db.prepare(sql).get(...params) as { count: number };
  return result.count;
}

/**
 * Search records with LIKE matching on specified columns.
 */
export function searchLocal<T = Record<string, unknown>>(
  table: string,
  searchColumns: string[],
  query: string,
  options?: { limit?: number; orderBy?: string }
): T[] {
  if (!isLocalDbAvailable() || !query.trim()) return [];

  const db = getLocalDb();
  const term = `%${query.trim()}%`;
  const conditions = searchColumns.map((col) => `"${col}" LIKE ?`).join(' OR ');
  const params = searchColumns.map(() => term);

  let sql = `SELECT * FROM "${table}" WHERE (${conditions})`;
  if (options?.orderBy) sql += ` ORDER BY ${options.orderBy}`;
  if (options?.limit) {
    sql += ` LIMIT ?`;
    params.push(String(options.limit));
  }

  return db.prepare(sql).all(...params) as T[];
}

// ---------------------------------------------------------------------------
// Write operations (local + queue for sync)
// ---------------------------------------------------------------------------

/**
 * Write a record to local SQLite and queue it for server sync.
 * Returns the written record.
 */
export function writeLocal(options: WriteOptions): Record<string, unknown> | null {
  if (!isLocalDbAvailable()) return null;

  const db = getLocalDb();
  const { table, operation, recordId, data } = options;

  if (operation === 'CREATE') {
    // Generate ID if not provided
    const id = (data.id as string) || generateUUID();
    const record: Record<string, unknown> = { ...data, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => {
      const val = record[col];
      if (val === null || val === undefined) return null;
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });

    db.prepare(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`
    ).run(...values);

    // Queue for sync
    queueChange(table, 'CREATE', id, record);
    return record;
  }

  if (operation === 'UPDATE' && recordId) {
    const record: Record<string, unknown> = { ...data, updated_at: new Date().toISOString() };
    const columns = Object.keys(record);
    const setClause = columns.map((col) => `"${col}" = ?`).join(', ');
    const values = columns.map((col) => {
      const val = record[col];
      if (val === null || val === undefined) return null;
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });
    values.push(recordId);

    db.prepare(`UPDATE "${table}" SET ${setClause} WHERE id = ?`).run(...values);

    // Queue for sync
    queueChange(table, 'UPDATE', recordId, record);
    return { id: recordId, ...record };
  }

  if (operation === 'DELETE' && recordId) {
    db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(recordId);

    // Queue for sync
    queueChange(table, 'DELETE', recordId, {});
    return { id: recordId };
  }

  return null;
}

/**
 * Bulk upsert records (used during pull sync to apply server changes).
 * Does NOT queue changes (they came from the server).
 */
export function bulkUpsert(table: string, records: Array<Record<string, unknown>>): number {
  if (!isLocalDbAvailable() || records.length === 0) return 0;

  const db = getLocalDb();
  let applied = 0;

  const upsertAll = db.transaction(() => {
    for (const record of records) {
      const columns = Object.keys(record);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((col) => {
        const val = record[col];
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      });

      db.prepare(
        `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`
      ).run(...values);
      applied++;
    }
  });

  upsertAll();
  return applied;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID(): string {
  // Simple UUID v4 generation for Node.js
  const crypto = require('crypto');
  return crypto.randomUUID();
}
