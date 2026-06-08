/**
 * Client-side hooks for local database access in desktop mode.
 *
 * These hooks provide React Query-compatible data fetching that:
 * - In desktop mode: reads from local SQLite (via internal API route) for instant results
 * - In web mode: falls through to normal API calls (no-op)
 *
 * Usage:
 *   const { data, isLoading } = useLocalQuery('patients_patient', { where: { ... } });
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { isDesktop } from './index';

interface LocalQueryOptions {
  table: string;
  where?: Record<string, unknown>;
  orderBy?: string;
  limit?: number;
  offset?: number;
  search?: string;
  searchColumns?: string[];
  enabled?: boolean;
}

interface LocalQueryResult<T> {
  data: T[];
  count: number;
}

interface LocalWriteOptions {
  table: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  recordId?: string;
  data?: Record<string, unknown>;
}

/**
 * Check if we're in desktop mode with local DB available.
 */
export function useIsDesktopOfflineMode(): boolean {
  // In desktop mode, the local DB API routes are available
  return isDesktop();
}

/**
 * Query local SQLite database (desktop mode only).
 * Returns { data: [], count: 0 } in web mode or when disabled.
 */
export function useLocalQuery<T = Record<string, unknown>>(
  options: LocalQueryOptions
) {
  const { table, where, orderBy, limit, offset, search, searchColumns, enabled = true } = options;
  const desktop = isDesktop();

  return useQuery<LocalQueryResult<T>>({
    queryKey: ['local-db', table, where, orderBy, limit, offset, search],
    queryFn: async () => {
      const res = await fetch('/api/local-db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, where, orderBy, limit, offset, search, searchColumns }),
      });
      if (!res.ok) throw new Error(`Local query failed: ${res.status}`);
      return res.json();
    },
    enabled: desktop && enabled,
    staleTime: 5000, // 5s — local queries are fast, re-fetch frequently
    placeholderData: { data: [] as T[], count: 0 },
  });
}

/**
 * Get a single record by ID from local SQLite (desktop mode only).
 */
export function useLocalRecord<T = Record<string, unknown>>(
  table: string,
  id: string | null | undefined
) {
  const desktop = isDesktop();

  return useQuery<T | null>({
    queryKey: ['local-db', table, id],
    queryFn: async () => {
      const res = await fetch('/api/local-db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, where: { id }, limit: 1 }),
      });
      if (!res.ok) throw new Error(`Local query failed: ${res.status}`);
      const result = await res.json();
      return result.data?.[0] || null;
    },
    enabled: desktop && !!id,
  });
}

/**
 * Write to local SQLite + queue for sync (desktop mode only).
 * Returns a mutation that can be called imperatively.
 */
export function useLocalWrite(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (writeOptions: LocalWriteOptions) => {
      const res = await fetch('/api/local-db/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(writeOptions),
      });
      if (!res.ok) throw new Error(`Local write failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all local-db queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['local-db'] });
      options?.onSuccess?.();
    },
  });
}

/**
 * Get sync status (desktop mode only).
 */
export function useLocalSyncStatus() {
  const desktop = isDesktop();

  return useQuery({
    queryKey: ['local-db', 'sync-status'],
    queryFn: async () => {
      const res = await fetch('/api/local-db/sync');
      if (!res.ok) throw new Error(`Sync status failed: ${res.status}`);
      return res.json();
    },
    enabled: desktop,
    refetchInterval: 10000, // Refresh every 10s
  });
}

/**
 * Trigger a manual sync cycle (desktop mode only).
 */
export function useLocalSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (full = false) => {
      const res = await fetch('/api/local-db/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full }),
      });
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate everything after sync
      queryClient.invalidateQueries({ queryKey: ['local-db'] });
    },
  });
}
