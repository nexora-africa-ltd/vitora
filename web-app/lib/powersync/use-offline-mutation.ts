/**
 * useOfflineMutation — Dual-Mode Write Hook
 *
 * When the PowerSync DB is ready, writes go directly to local SQLite.
 * PowerSync's internal queue then uploads via the connector's uploadData().
 * When PowerSync is not available, falls back to React Query useMutation + API.
 *
 * Usage:
 *   const createPatient = useOfflineMutation<PatientCreateData, Patient>({
 *     table: 'patients_patient',
 *     buildLocalData: (input) => ({ id: generateId(), first_name: input.first_name, ... }),
 *     mutationFn: (input) => patientsApi.createPatient(input),
 *     onSuccess: () => queryClient.invalidateQueries({ queryKey: patientKeys.lists() }),
 *   });
 */

'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useSyncStatus } from '@/lib/context/sync-context';
import { buildInsertQuery, buildUpdateQuery, buildDeleteQuery } from './sql-builders';

export type MutationOperation = 'create' | 'update' | 'delete';

export interface UseOfflineMutationOptions<TInput, TResult> {
  /** The PowerSync table name (e.g. 'patients_patient') */
  table: string;
  /** The type of mutation */
  operation: MutationOperation;
  /**
   * Build the column data for a local INSERT or UPDATE.
   * For 'create': must include the 'id' field (use generateId()).
   * For 'update': return only the fields to change (id is passed separately).
   * For 'delete': not used.
   */
  buildLocalData?: (input: TInput) => Record<string, string | number | null | undefined>;
  /**
   * Extract the record ID for update/delete operations.
   * Default: (input) => (input as any).id
   */
  getId?: (input: TInput) => string | number;
  /** React Query mutation function (API fallback when PowerSync is not available) */
  mutationFn: (input: TInput) => Promise<TResult>;
  /** Called after a successful mutation (both local and API paths) */
  onSuccess?: (result: TResult | null, input: TInput) => void;
  /** Called on mutation error */
  onError?: (error: Error, input: TInput) => void;
  /** Override: force API mode even when PowerSync DB is available */
  forceApi?: boolean;
}

export interface UseOfflineMutationResult<TInput, TResult> {
  /** Execute the mutation */
  mutateAsync: (input: TInput) => Promise<TResult | null>;
  /** Whether a mutation is in progress */
  isPending: boolean;
  /** The last error from a mutation */
  error: Error | null;
  /** Which path was used: 'local' (PowerSync) or 'api' (React Query) */
  source: 'local' | 'api';
}

/**
 * Dual-mode write hook: PowerSync local SQLite with React Query API fallback.
 */
export function useOfflineMutation<TInput, TResult = unknown>(
  options: UseOfflineMutationOptions<TInput, TResult>
): UseOfflineMutationResult<TInput, TResult> {
  const {
    table,
    operation,
    buildLocalData,
    getId = (input) => (input as Record<string, unknown>).id as string | number,
    mutationFn,
    onSuccess,
    onError,
    forceApi = false,
  } = options;

  const { db, isReady } = useSyncStatus();
  const useLocal = isReady && db !== null && !forceApi;

  // --- API fallback mutation (always declared, toggled by caller) ---
  const apiMutation = useMutation<TResult, Error, TInput>({
    mutationFn,
    onSuccess: (result, input) => onSuccess?.(result, input),
    onError: (error, input) => onError?.(error, input),
  });

  // --- Local write function ---
  const localMutateAsync = useCallback(async (input: TInput): Promise<null> => {
    if (!db) throw new Error('PowerSync database not available');

    try {
      switch (operation) {
        case 'create': {
          if (!buildLocalData) throw new Error('buildLocalData is required for create operations');
          const data = buildLocalData(input);
          const { sql, params } = buildInsertQuery(table, data);
          await db.execute(sql, params);
          break;
        }
        case 'update': {
          if (!buildLocalData) throw new Error('buildLocalData is required for update operations');
          const id = getId(input);
          const data = buildLocalData(input);
          const { sql, params } = buildUpdateQuery(table, id, data);
          await db.execute(sql, params);
          break;
        }
        case 'delete': {
          const id = getId(input);
          const { sql, params } = buildDeleteQuery(table, id);
          await db.execute(sql, params);
          break;
        }
      }

      onSuccess?.(null, input);
      return null;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      onError?.(error, input);
      throw error;
    }
  }, [db, table, operation, buildLocalData, getId, onSuccess, onError]);

  // --- Return the active path ---
  if (useLocal) {
    return {
      mutateAsync: localMutateAsync,
      isPending: false, // Local writes are synchronous from the UI perspective
      error: null,
      source: 'local',
    };
  }

  return {
    mutateAsync: apiMutation.mutateAsync,
    isPending: apiMutation.isPending,
    error: apiMutation.error,
    source: 'api',
  };
}
