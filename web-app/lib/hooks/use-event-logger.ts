/**
 * Frontend Event Logger Hook
 *
 * Provides a convenient way to log user interactions and clinical workflow
 * events throughout the application. Automatically handles:
 * - Session ID generation and persistence
 * - Device type detection
 * - Offline event queueing with localStorage persistence
 * - Automatic sync when coming back online
 *
 * @example
 * ```tsx
 * const { logEvent, logPageView, logFormSave } = useEventLogger();
 *
 * // Log a custom event
 * logEvent('encounter_open', 'Encounter', encounterId, { source: 'dashboard' });
 *
 * // Log a page view
 * logPageView('/encounters/123/edit');
 *
 * // Log a form save
 * logFormSave('Encounter', encounterId, { fields: ['chief_complaint'] });
 * ```
 */

import { useCallback, useEffect, useRef } from 'react';
import { eventsApi, type FrontendEventType, type ResourceType, type FrontendEvent } from '@/lib/api/events';
import { useNetworkStatus } from './use-network-status';
import { useAuth } from '@/lib/auth/context';

// LocalStorage keys
const SESSION_ID_KEY = 'vitora_session_id';
const EVENT_QUEUE_KEY = 'vitora_event_queue';

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create session ID
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Detect device type
 */
function getDeviceType(): 'web' | 'desktop' | 'mobile' {
  if (typeof window === 'undefined') return 'web';

  // Check if running in Electron
  if (window.navigator.userAgent.includes('Electron')) {
    return 'desktop';
  }

  // Check for mobile
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent)) {
    return 'mobile';
  }

  return 'web';
}

/**
 * Get queued events from localStorage
 */
function getQueuedEvents(): Omit<FrontendEvent, 'id' | 'server_timestamp'>[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(EVENT_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save events to localStorage queue
 */
function saveEventQueue(events: Omit<FrontendEvent, 'id' | 'server_timestamp'>[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(events));
  } catch (e) {
    // localStorage might be full or unavailable
    console.warn('Failed to save event queue:', e);
  }
}

/**
 * Clear the event queue
 */
function clearEventQueue(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(EVENT_QUEUE_KEY);
}

/**
 * Hook return type
 */
interface UseEventLoggerReturn {
  /** Log a custom event */
  logEvent: (
    eventType: FrontendEventType,
    resourceType?: ResourceType,
    resourceId?: number | null,
    details?: Record<string, unknown>
  ) => void;

  /** Log a page view event */
  logPageView: (page: string, details?: Record<string, unknown>) => void;

  /** Log a form save event */
  logFormSave: (
    resourceType: ResourceType,
    resourceId: number,
    details?: Record<string, unknown>
  ) => void;

  /** Log a form error event */
  logFormError: (
    resourceType: ResourceType,
    resourceId?: number | null,
    error?: string,
    details?: Record<string, unknown>
  ) => void;

  /** Log an encounter workflow event */
  logEncounterEvent: (
    eventType: 'encounter_open' | 'encounter_save' | 'encounter_finalize',
    encounterId: number,
    details?: Record<string, unknown>
  ) => void;

  /** Log a diagnosis event */
  logDiagnosisEvent: (
    eventType: 'diagnosis_add' | 'diagnosis_update' | 'diagnosis_remove',
    encounterId: number,
    diagnosisId?: number,
    details?: Record<string, unknown>
  ) => void;

  /** Log a lab event */
  logLabEvent: (
    eventType: 'lab_order_create' | 'lab_result_view',
    resourceId: number,
    details?: Record<string, unknown>
  ) => void;

  /** Number of events queued offline */
  queuedCount: number;

  /** Manually sync queued events */
  syncQueue: () => Promise<void>;
}

/**
 * Frontend event logger hook
 */
export function useEventLogger(): UseEventLoggerReturn {
  const { isOnline } = useNetworkStatus();
  const { user } = useAuth();
  const queueRef = useRef<Omit<FrontendEvent, 'id' | 'server_timestamp'>[]>([]);
  const syncingRef = useRef(false);

  // Initialize queue from localStorage on mount
  useEffect(() => {
    queueRef.current = getQueuedEvents();
  }, []);

  // Sync queue when coming back online
  useEffect(() => {
    if (isOnline && queueRef.current.length > 0 && !syncingRef.current) {
      syncQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  /**
   * Sync queued events to server
   */
  const syncQueue = useCallback(async () => {
    if (!isOnline || syncingRef.current || queueRef.current.length === 0) return;

    syncingRef.current = true;
    const eventsToSync = [...queueRef.current];

    try {
      await eventsApi.logBatch(eventsToSync);
      // Clear the queue after successful sync
      queueRef.current = [];
      clearEventQueue();
      console.log(`[EventLogger] Synced ${eventsToSync.length} queued events`);
    } catch (error) {
      console.error('[EventLogger] Failed to sync event queue:', error);
    } finally {
      syncingRef.current = false;
    }
  }, [isOnline]);

  /**
   * Log an event (handles offline queueing)
   */
  const logEvent = useCallback((
    eventType: FrontendEventType,
    resourceType: ResourceType = '',
    resourceId?: number | null,
    details: Record<string, unknown> = {}
  ) => {
    // Don't log if user is not authenticated
    if (!user) return;

    const event: Omit<FrontendEvent, 'id' | 'server_timestamp'> = {
      event_type: eventType,
      resource_type: resourceType,
      resource_id: resourceId ?? null,
      client_timestamp: new Date().toISOString(),
      session_id: getSessionId(),
      device_type: getDeviceType(),
      details,
      was_offline: !isOnline,
    };

    if (isOnline) {
      // Send immediately
      eventsApi.logEvent(event).catch((error) => {
        // If sending fails, queue for later
        console.warn('[EventLogger] Failed to send event, queueing:', error);
        queueRef.current.push({ ...event, was_offline: true });
        saveEventQueue(queueRef.current);
      });
    } else {
      // Queue for later sync
      queueRef.current.push(event);
      saveEventQueue(queueRef.current);
    }
  }, [isOnline, user]);

  /**
   * Log a page view
   */
  const logPageView = useCallback((page: string, details: Record<string, unknown> = {}) => {
    logEvent('page_view', '', null, { page, ...details });
  }, [logEvent]);

  /**
   * Log a form save
   */
  const logFormSave = useCallback((
    resourceType: ResourceType,
    resourceId: number,
    details: Record<string, unknown> = {}
  ) => {
    logEvent('form_save', resourceType, resourceId, details);
  }, [logEvent]);

  /**
   * Log a form error
   */
  const logFormError = useCallback((
    resourceType: ResourceType,
    resourceId?: number | null,
    error?: string,
    details: Record<string, unknown> = {}
  ) => {
    logEvent('form_error', resourceType, resourceId, { error, ...details });
  }, [logEvent]);

  /**
   * Log an encounter workflow event
   */
  const logEncounterEvent = useCallback((
    eventType: 'encounter_open' | 'encounter_save' | 'encounter_finalize',
    encounterId: number,
    details: Record<string, unknown> = {}
  ) => {
    logEvent(eventType, 'Encounter', encounterId, details);
  }, [logEvent]);

  /**
   * Log a diagnosis event
   */
  const logDiagnosisEvent = useCallback((
    eventType: 'diagnosis_add' | 'diagnosis_update' | 'diagnosis_remove',
    encounterId: number,
    diagnosisId?: number,
    details: Record<string, unknown> = {}
  ) => {
    logEvent(eventType, 'Diagnosis', diagnosisId, { encounterId, ...details });
  }, [logEvent]);

  /**
   * Log a lab event
   */
  const logLabEvent = useCallback((
    eventType: 'lab_order_create' | 'lab_result_view',
    resourceId: number,
    details: Record<string, unknown> = {}
  ) => {
    const resourceType: ResourceType = eventType === 'lab_order_create' ? 'LabOrder' : 'LabResult';
    logEvent(eventType, resourceType, resourceId, details);
  }, [logEvent]);

  return {
    logEvent,
    logPageView,
    logFormSave,
    logFormError,
    logEncounterEvent,
    logDiagnosisEvent,
    logLabEvent,
    queuedCount: queueRef.current.length,
    syncQueue,
  };
}

export default useEventLogger;
