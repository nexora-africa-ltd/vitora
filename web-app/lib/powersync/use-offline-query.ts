/**
 * useOfflineQuery — Dual-Mode Read Hook
 *
 * Reads from local PowerSync SQLite when the database is ready,
 * falls back to React Query API fetching when it is not.
 *
 * Both code paths are always called (React rules of hooks forbid conditional
 * hook calls). The `enabled` flag on each path toggles which is active.
 *
 * Usage:
 *   const patients = useOfflineQuery<PatientRow, Patient[]>({
 *     sql: 'SELECT * FROM patients_patient ORDER BY last_name',
 *     params: [],
 *     transform: (rows) => rows.map(transformPatientRow),
 *     queryKey: ['patients', 'list'],
 *     queryFn: () => patientsApi.getPatients(),
 *   });
 */

'use client';

import { useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import { usePowerSyncQuery } from './hooks';
import { useSyncStatus } from '@/lib/context/sync-context';

export interface UseOfflineQueryOptions<TRow extends Record<string, unknown>, TResult> {
  /** SQL query for the local PowerSync database */
  sql: string;
  /** Positional parameters for the SQL query */
  params?: (string | number | null)[];
  /** Transform PowerSync rows into the expected return type */
  transform: (rows: TRow[]) => TResult;
  /** React Query key (used when PowerSync is not available) */
  queryKey: QueryKey;
  /** React Query fetch function (used when PowerSync is not available) */
  queryFn: () => Promise<TResult>;
  /** Additional React Query options (applied to the API fallback path) */
  queryOptions?: Omit<UseQueryOptions<TResult, Error>, 'queryKey' | 'queryFn' | 'enabled'>;
  /** Override: force API mode even when PowerSync DB is available */
  forceApi?: boolean;
  /** When false, both local and API paths are disabled (returns idle result). Default: true */
  enabled?: boolean;
}

export interface UseOfflineQueryResult<TResult> {
  /** The query result data */
  data: TResult | undefined;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether the query is in an error state */
  isError: boolean;
  /** Whether a fetch is in-flight (background refetch or initial) */
  isFetching: boolean;
  /** Error from the active query path */
  error: Error | null;
  /** Trigger a manual refresh */
  refetch: () => void;
  /** Which data source is active: 'local' (PowerSync) or 'api' (React Query) */
  source: 'local' | 'api';
}

/**
 * Dual-mode read hook: PowerSync (local SQLite) with React Query API fallback.
 */
export function useOfflineQuery<
  TRow extends Record<string, unknown> = Record<string, unknown>,
  TResult = TRow[]
>(options: UseOfflineQueryOptions<TRow, TResult>): UseOfflineQueryResult<TResult> {
  const {
    sql,
    params = [],
    transform,
    queryKey,
    queryFn,
    queryOptions,
    forceApi = false,
    enabled = true,
  } = options;

  const { isReady, hasSynced } = useSyncStatus();
  const isEnabled = enabled !== false;
  // Only read from local SQLite when PowerSync has actually synced data.
  // If PowerSync is initialized but hasn't synced (auth failure, network issue),
  // fall back to API so the app remains functional.
  const useLocal = isReady && hasSynced && !forceApi && isEnabled;

  // --- Path 1: PowerSync local query (always called, toggled by `useLocal`) ---
  const localResult = usePowerSyncQuery<TRow>(
    useLocal ? sql : 'SELECT 1 WHERE 0', // no-op SQL when disabled
    useLocal ? params : []
  );

  // --- Path 2: React Query API fetch (always called, toggled by `enabled`) ---
  const apiResult = useQuery<TResult, Error>({
    queryKey,
    queryFn,
    enabled: !useLocal && isEnabled,
    ...queryOptions,
  });

  // --- Short-circuit: return idle result when disabled ---
  if (!isEnabled) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: () => {},
      source: 'api',
    };
  }

  // --- Merge results based on active path ---
  if (useLocal) {
    let data: TResult | undefined;
    try {
      data = localResult.isLoading ? undefined : transform(localResult.data);
    } catch (e) {
      return {
        data: undefined,
        isLoading: false,
        isError: true,
        isFetching: false,
        error: e instanceof Error ? e : new Error('Transform failed'),
        refetch: localResult.refresh,
        source: 'local',
      };
    }

    return {
      data,
      isLoading: localResult.isLoading,
      isError: !!localResult.error,
      isFetching: localResult.isLoading,
      error: localResult.error,
      refetch: localResult.refresh,
      source: 'local',
    };
  }

  return {
    data: apiResult.data,
    isLoading: apiResult.isLoading,
    isError: apiResult.isError,
    isFetching: apiResult.isFetching,
    error: apiResult.error ?? null,
    refetch: () => { apiResult.refetch(); },
    source: 'api',
  };
}
