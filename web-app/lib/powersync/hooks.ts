/**
 * PowerSync React Hooks
 *
 * Custom hooks for querying the local PowerSync SQLite database.
 * These coexist with React Query hooks during the gradual migration.
 *
 * Usage:
 *   const patients = usePowerSyncQuery<PatientRow>(
 *     'SELECT * FROM patients_patient WHERE last_name LIKE ? ORDER BY last_name',
 *     ['%Smith%']
 *   );
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSyncStatus } from '@/lib/context/sync-context';

/**
 * Execute a watched SQL query against the local PowerSync SQLite database.
 * The query automatically re-runs when the underlying data changes
 * (via PowerSync's sync or local writes).
 *
 * Returns an empty array until the database is initialized.
 *
 * @param sql - SQL query string (e.g., `SELECT * FROM patients_patient WHERE ...`)
 * @param params - Query parameters (positional `?` placeholders)
 * @returns The query result rows, typed as T[]
 */
export function usePowerSyncQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): { data: T[]; isLoading: boolean; error: Error | null; refresh: () => void } {
  const { db } = useSyncStatus();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Serialize params for use as a stable dependency
  const paramsKey = JSON.stringify(params);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!db) {
      setIsLoading(true);
      return;
    }

    let disposed = false;

    // Use PowerSync's watched query which auto-re-runs on data changes
    const abortController = new AbortController();

    async function runQuery() {
      try {
        setIsLoading(true);
        const result = await db!.getAll<T>(sql, params);
        if (!disposed) {
          setData(result);
          setError(null);
          setIsLoading(false);
        }
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setIsLoading(false);
        }
      }
    }

    // Initial query
    runQuery();

    // Watch for changes using PowerSync's onChange callback
    const unsubscribe = db.onChange({
      onChange: () => {
        if (!disposed) runQuery();
      },
    }, { signal: abortController.signal });

    return () => {
      disposed = true;
      abortController.abort();
      // The onChange cleanup is handled by the abort signal
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, sql, paramsKey, refreshKey]);

  return { data, isLoading, error, refresh };
}

/**
 * Execute a single-row query against the local PowerSync SQLite database.
 * Returns null if no row matches.
 */
export function usePowerSyncQueryFirst<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): { data: T | null; isLoading: boolean; error: Error | null } {
  const result = usePowerSyncQuery<T>(sql, params);
  return {
    data: result.data.length > 0 ? (result.data[0] ?? null) : null,
    isLoading: result.isLoading,
    error: result.error,
  };
}

/**
 * Get the PowerSync database instance directly.
 * Use this when you need to run imperative queries (e.g., in event handlers).
 *
 * Returns null until the database is initialized.
 */
export function usePowerSyncDatabase() {
  const { db } = useSyncStatus();
  return db;
}
