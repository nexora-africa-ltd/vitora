/**
 * useSyncStatus Hook
 *
 * React hook for monitoring sync queue status.
 * Provides pending count and sync state information.
 *
 * @example
 * const { pendingCount, hasPending, refreshStatus } = useSyncStatus();
 */

import { useState, useEffect, useCallback } from 'react';
import { syncQueueManager } from '@/lib/sync';

export interface SyncStatusSummary {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  conflict: number;
}

export interface SyncStatus {
  /** Number of pending sync operations */
  pendingCount: number;
  /** Whether there are pending operations */
  hasPending: boolean;
  /** Whether sync status is loading */
  isLoading: boolean;
  /** Refresh sync status */
  refreshStatus: () => Promise<void>;
  /** Summary of all sync statuses */
  statusSummary: SyncStatusSummary | null;
}

/**
 * Hook for monitoring sync queue status
 *
 * @param refreshInterval - Optional interval in ms to auto-refresh status
 * @returns SyncStatus object with queue state
 */
export function useSyncStatus(refreshInterval?: number): SyncStatus {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusSummary, setStatusSummary] = useState<SyncStatusSummary | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const [count, summary] = await Promise.all([
        syncQueueManager.getPendingCount(),
        syncQueueManager.getStatusSummary(),
      ]);
      setPendingCount(count);
      // Map the status keys to lowercase for the interface
      setStatusSummary({
        pending: summary.PENDING || 0,
        syncing: summary.SYNCING || 0,
        synced: summary.SYNCED || 0,
        failed: summary.FAILED || 0,
        conflict: summary.CONFLICT || 0,
      });
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refreshStatus();

    // Set up auto-refresh if interval provided
    if (refreshInterval && refreshInterval > 0) {
      const intervalId = setInterval(refreshStatus, refreshInterval);
      return () => clearInterval(intervalId);
    }
    return undefined;
  }, [refreshStatus, refreshInterval]);

  return {
    pendingCount,
    hasPending: pendingCount > 0,
    isLoading,
    refreshStatus,
    statusSummary,
  };
}

export default useSyncStatus;
