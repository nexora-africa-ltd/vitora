/**
 * Auto-save hook for forms with debounced saving and network awareness.
 * Provides real-time sync when online and queues changes when offline.
 * Sprint 1.5-1.6: Enhanced encounter form auto-save
 * 
 * Features:
 * - Debounced saving to reduce API calls
 * - Offline queue with localStorage persistence (survives page refresh)
 * - Automatic sync when coming back online
 * - Network status awareness
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from './use-debounce';
import { useNetworkStatus } from './use-network-status';
import { useSyncStatus } from '@/lib/context/sync-context';

// LocalStorage key prefix for offline queue
const OFFLINE_QUEUE_PREFIX = 'vitora_autosave_queue_';

export type AutoSaveStatus =
  | 'idle'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'error'
  | 'offline';

interface AutoSaveOptions<T> {
  /** Data to be auto-saved */
  data: T;
  /** Function to save the data */
  onSave: (data: T) => Promise<void>;
  /** Debounce delay in ms (default: 2000ms) */
  debounceMs?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
  /** Callback when save succeeds */
  onSuccess?: () => void;
  /** Callback when save fails */
  onError?: (error: Error) => void;
  /** Compare function to check if data has changed (default: JSON.stringify comparison) */
  hasChanged?: (prev: T | null, current: T) => boolean;
  /** Unique key for localStorage persistence (e.g., 'encounter_123') */
  persistKey?: string;
}

interface AutoSaveResult {
  /** Current status of auto-save */
  status: AutoSaveStatus;
  /** Last saved timestamp */
  lastSaved: Date | null;
  /** Error message if save failed */
  error: string | null;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Force save immediately */
  saveNow: () => Promise<void>;
  /** Reset the dirty state */
  reset: () => void;
  /** Number of pending saves (for offline queue) */
  pendingCount: number;
  /** Whether there's recoverable data from localStorage */
  hasRecoverableData: boolean;
  /** Recover data from localStorage */
  recoverData: () => T | null;
  /** Clear recovered data without saving */
  discardRecoverableData: () => void;
}

/**
 * Default comparison using JSON.stringify
 */
function defaultHasChanged<T>(prev: T | null, current: T): boolean {
  if (prev === null) return false;
  return JSON.stringify(prev) !== JSON.stringify(current);
}

/**
 * Get offline queue from localStorage
 */
function getOfflineQueue<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_PREFIX + key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save offline queue to localStorage
 */
function saveOfflineQueue<T>(key: string, queue: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(OFFLINE_QUEUE_PREFIX + key);
    } else {
      localStorage.setItem(OFFLINE_QUEUE_PREFIX + key, JSON.stringify(queue));
    }
  } catch (e) {
    console.warn('[AutoSave] Failed to save offline queue:', e);
  }
}

/**
 * Clear offline queue from localStorage
 */
function clearOfflineQueue(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(OFFLINE_QUEUE_PREFIX + key);
}

export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 2000,
  enabled = true,
  onSuccess,
  onError,
  hasChanged = defaultHasChanged,
  persistKey,
}: AutoSaveOptions<T>): AutoSaveResult {
  const { isOnline } = useNetworkStatus();
  const syncStatus = useSyncStatus();
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [hasRecoverableData, setHasRecoverableData] = useState(false);

  const lastSavedData = useRef<T | null>(null);
  const saveInProgress = useRef(false);
  const offlineQueue = useRef<T[]>([]);
  const storageKey = persistKey || 'default';

  // Initialize offline queue from localStorage on mount
  useEffect(() => {
    if (persistKey) {
      const savedQueue = getOfflineQueue<T>(storageKey);
      if (savedQueue.length > 0) {
        offlineQueue.current = savedQueue;
        setPendingCount(savedQueue.length);
        setHasRecoverableData(true);
        setStatus('offline');
        console.log(`[AutoSave] Recovered ${savedQueue.length} queued items from localStorage`);
      }
    }
  }, [persistKey, storageKey]);

  // Debounced data for comparison
  const debouncedData = useDebounce(data, debounceMs);

  // Check if data has changed from last saved
  useEffect(() => {
    if (hasChanged(lastSavedData.current, data)) {
      setIsDirty(true);
      if (isOnline) {
        setStatus('pending');
      } else {
        setStatus('offline');
        syncStatus.incrementPending();
      }
    }
  }, [data, hasChanged, isOnline, syncStatus]);

  // Auto-save when debounced data changes
  useEffect(() => {
    if (!enabled || !isDirty || saveInProgress.current) return;

    // Don't save if offline - queue instead
    if (!isOnline) {
      if (hasChanged(lastSavedData.current, debouncedData)) {
        offlineQueue.current = [debouncedData];
        setPendingCount(1);
        setStatus('offline');
        // Persist to localStorage
        if (persistKey) {
          saveOfflineQueue(storageKey, offlineQueue.current);
        }
      }
      return;
    }

    // Check if actually changed
    if (!hasChanged(lastSavedData.current, debouncedData)) {
      return;
    }

    const save = async () => {
      saveInProgress.current = true;
      setStatus('saving');
      setError(null);
      syncStatus.reportSyncStart();

      try {
        await onSave(debouncedData);
        lastSavedData.current = debouncedData;
        setLastSaved(new Date());
        setStatus('saved');
        setIsDirty(false);
        syncStatus.reportSync();
        syncStatus.decrementPending();
        onSuccess?.();

        // Reset to idle after a short delay
        setTimeout(() => {
          setStatus((s) => (s === 'saved' ? 'idle' : s));
        }, 2000);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to save';
        setError(errorMessage);
        setStatus('error');
        syncStatus.reportSyncError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      } finally {
        saveInProgress.current = false;
      }
    };

    save();
  }, [debouncedData, enabled, isDirty, isOnline, onSave, onSuccess, onError, hasChanged, syncStatus]);

  // Process offline queue when back online
  useEffect(() => {
    if (!isOnline || offlineQueue.current.length === 0 || saveInProgress.current) return;

    const processQueue = async () => {
      saveInProgress.current = true;
      setStatus('saving');
      syncStatus.reportSyncStart();

      try {
        // Process the last queued item (most recent data)
        const latestData = offlineQueue.current[offlineQueue.current.length - 1];
        if (latestData === undefined) {
          saveInProgress.current = false;
          return;
        }
        await onSave(latestData);
        lastSavedData.current = latestData;
        offlineQueue.current = [];
        setPendingCount(0);
        setHasRecoverableData(false);
        setLastSaved(new Date());
        setStatus('saved');
        setIsDirty(false);
        syncStatus.reportSync();
        syncStatus.setPendingCount(0);
        onSuccess?.();
        
        // Clear localStorage queue after successful sync
        if (persistKey) {
          clearOfflineQueue(storageKey);
        }

        setTimeout(() => {
          setStatus((s) => (s === 'saved' ? 'idle' : s));
        }, 2000);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sync';
        setError(errorMessage);
        setStatus('error');
        syncStatus.reportSyncError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      } finally {
        saveInProgress.current = false;
      }
    };

    processQueue();
  }, [isOnline, onSave, onSuccess, onError, syncStatus]);

  // Manual save function
  const saveNow = useCallback(async () => {
    if (saveInProgress.current) return;

    if (!isOnline) {
      offlineQueue.current = [data];
      setPendingCount(1);
      setStatus('offline');
      syncStatus.incrementPending();
      // Persist to localStorage
      if (persistKey) {
        saveOfflineQueue(storageKey, offlineQueue.current);
      }
      return;
    }

    saveInProgress.current = true;
    setStatus('saving');
    setError(null);
    syncStatus.reportSyncStart();

    try {
      await onSave(data);
      lastSavedData.current = data;
      setLastSaved(new Date());
      setStatus('saved');
      setIsDirty(false);
      syncStatus.reportSync();
      onSuccess?.();

      setTimeout(() => {
        setStatus((s) => (s === 'saved' ? 'idle' : s));
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save';
      setError(errorMessage);
      setStatus('error');
      syncStatus.reportSyncError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      saveInProgress.current = false;
    }
  }, [data, isOnline, onSave, onSuccess, onError, syncStatus]);

  // Reset function to clear dirty state (e.g., after manual save)
  const reset = useCallback(() => {
    lastSavedData.current = data;
    setIsDirty(false);
    setStatus('idle');
    setError(null);
    offlineQueue.current = [];
    setPendingCount(0);
    setHasRecoverableData(false);
    // Clear localStorage
    if (persistKey) {
      clearOfflineQueue(storageKey);
    }
  }, [data, persistKey, storageKey]);

  // Recover data from localStorage
  const recoverData = useCallback((): T | null => {
    if (offlineQueue.current.length > 0) {
      return offlineQueue.current[offlineQueue.current.length - 1] ?? null;
    }
    return null;
  }, []);

  // Discard recoverable data without saving
  const discardRecoverableData = useCallback(() => {
    offlineQueue.current = [];
    setPendingCount(0);
    setHasRecoverableData(false);
    setStatus('idle');
    if (persistKey) {
      clearOfflineQueue(storageKey);
    }
  }, [persistKey, storageKey]);

  return {
    status,
    lastSaved,
    error,
    isDirty,
    saveNow,
    reset,
    pendingCount,
    hasRecoverableData,
    recoverData,
    discardRecoverableData,
  };
}

export default useAutoSave;
