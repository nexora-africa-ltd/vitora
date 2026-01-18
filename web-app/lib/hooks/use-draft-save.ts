/**
 * Hook for auto-saving form drafts to localStorage
 * Used for forms creating new items before they're saved to the API
 * Provides recovery of unsaved work after browser refresh or accidental navigation
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from './use-debounce';

interface DraftSaveOptions<T> {
  /** Unique key for this draft (e.g., 'new-encounter', 'new-patient') */
  draftKey: string;
  /** Current form data */
  data: T;
  /** Debounce delay in ms (default: 1000ms) */
  debounceMs?: number;
  /** Whether draft saving is enabled (default: true) */
  enabled?: boolean;
  /** Called when a draft is recovered */
  onRecover?: (data: T) => void;
}

interface DraftSaveResult<T> {
  /** Whether there was a recovered draft */
  hasDraft: boolean;
  /** The recovered draft data (if any) */
  recoveredDraft: T | null;
  /** Whether data has been modified since load */
  isDirty: boolean;
  /** Last saved timestamp */
  lastSaved: Date | null;
  /** Recover the draft and apply it */
  recoverDraft: () => void;
  /** Dismiss the draft without applying */
  dismissDraft: () => void;
  /** Clear the draft from storage */
  clearDraft: () => void;
  /** Force save the current data immediately */
  saveDraft: () => void;
}

const DRAFT_PREFIX = 'vitora_draft_';
const DRAFT_EXPIRY_HOURS = 24; // Drafts expire after 24 hours

interface StoredDraft<T> {
  data: T;
  timestamp: number;
  version: number;
}

function getStorageKey(draftKey: string): string {
  return `${DRAFT_PREFIX}${draftKey}`;
}

function isExpired(timestamp: number): boolean {
  const expiryMs = DRAFT_EXPIRY_HOURS * 60 * 60 * 1000;
  return Date.now() - timestamp > expiryMs;
}

function hasDataChanged<T>(prev: T | null, current: T): boolean {
  if (prev === null) return false;
  return JSON.stringify(prev) !== JSON.stringify(current);
}

export function useDraftSave<T>({
  draftKey,
  data,
  debounceMs = 1000,
  enabled = true,
  onRecover,
}: DraftSaveOptions<T>): DraftSaveResult<T> {
  const [hasDraft, setHasDraft] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState<T | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const initialDataRef = useRef<T | null>(null);
  const hasInitializedRef = useRef(false);

  const debouncedData = useDebounce(data, debounceMs);
  const storageKey = getStorageKey(draftKey);

  // Check for existing draft on mount
  useEffect(() => {
    if (hasInitializedRef.current || !enabled) return;
    hasInitializedRef.current = true;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const draft: StoredDraft<T> = JSON.parse(stored);

        // Check if draft is expired
        if (isExpired(draft.timestamp)) {
          localStorage.removeItem(storageKey);
          return;
        }

        // Check if draft is different from current data
        if (hasDataChanged(data, draft.data)) {
          setHasDraft(true);
          setRecoveredDraft(draft.data);
        } else {
          // Draft matches current data, clear it
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }

    // Store initial data for comparison
    initialDataRef.current = data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, enabled]);

  // Track dirty state - use JSON comparison with refs to avoid infinite loops
  const dataJsonRef = useRef<string>(JSON.stringify(data));
  useEffect(() => {
    const currentJson = JSON.stringify(data);
    if (currentJson !== dataJsonRef.current) {
      dataJsonRef.current = currentJson;
      if (initialDataRef.current !== null) {
        setIsDirty(hasDataChanged(initialDataRef.current, data));
      }
    }
  }, [data]);

  // Auto-save draft when debounced data changes
  useEffect(() => {
    if (!enabled || !isDirty || hasDraft) return;

    try {
      const draft: StoredDraft<T> = {
        data: debouncedData,
        timestamp: Date.now(),
        version: 1,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [debouncedData, enabled, isDirty, hasDraft, storageKey]);

  // Recover draft
  const recoverDraft = useCallback(() => {
    if (recoveredDraft) {
      onRecover?.(recoveredDraft);
      setHasDraft(false);
      setRecoveredDraft(null);
      // Update initial data to recovered data
      initialDataRef.current = recoveredDraft;
      // Clear from storage
      localStorage.removeItem(storageKey);
    }
  }, [recoveredDraft, onRecover, storageKey]);

  // Dismiss draft without applying
  const dismissDraft = useCallback(() => {
    setHasDraft(false);
    setRecoveredDraft(null);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // Clear draft (called after successful save to API)
  const clearDraft = useCallback(() => {
    setHasDraft(false);
    setRecoveredDraft(null);
    setIsDirty(false);
    setLastSaved(null);
    localStorage.removeItem(storageKey);
    // Reset initial data
    initialDataRef.current = data;
  }, [storageKey, data]);

  // Force save draft immediately
  const saveDraft = useCallback(() => {
    if (!enabled) return;

    try {
      const draft: StoredDraft<T> = {
        data,
        timestamp: Date.now(),
        version: 1,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [data, enabled, storageKey]);

  return {
    hasDraft,
    recoveredDraft,
    isDirty,
    lastSaved,
    recoverDraft,
    dismissDraft,
    clearDraft,
    saveDraft,
  };
}

export default useDraftSave;
