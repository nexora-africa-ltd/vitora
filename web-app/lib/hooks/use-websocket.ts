/**
 * WebSocket Hook for Real-Time Updates
 *
 * Provides WebSocket connectivity for real-time event updates from the backend.
 * Integrates with React Query for cache invalidation and Zustand stores for state updates.
 *
 * Architecture Principles (from docs/scheduling+websockets.md):
 * - WebSockets are READ-ONLY, real-time projections
 * - All state changes occur via REST/HTTP (WebSockets only broadcast changes)
 * - Graceful Degradation: If WebSockets fail, system remains usable via polling
 *
 * Usage:
 * ```tsx
 * function ClinicQueueDisplay({ clinicId }: { clinicId: number }) {
 *   const { isConnected, connectionState } = useClinicQueueSocket(clinicId);
 *   // WebSocket automatically invalidates React Query cache on events
 * }
 * ```
 */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePatientJourneyStore } from '@/lib/stores/patient-journey';
import { clinicKeys } from './use-clinics';

// =============================================================================
// Types
// =============================================================================

export type WebSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

/**
 * Clinic queue WebSocket event types (from backend consumers.py)
 */
export type ClinicQueueEventType =
  | 'patient_added'
  | 'patient_called'
  | 'consultation_started'
  | 'visit_completed'
  | 'patient_removed'
  | 'stats_updated';

/**
 * WebSocket message structure from backend
 */
export interface WebSocketMessage<T = unknown> {
  event: ClinicQueueEventType;
  data: T;
}

/**
 * Patient added event data
 */
export interface PatientAddedEvent {
  visit_id: number;
  patient_id: number;
  patient_name: string;
  queue_number: number;
  priority: string;
  status: string;
  chief_complaint: string;
  registered_at: string | null;
}

/**
 * Patient called event data
 */
export interface PatientCalledEvent {
  visit_id: number;
  patient_id: number;
  patient_name: string;
  queue_number: number;
  called_at: string | null;
}

/**
 * Consultation started event data
 */
export interface ConsultationStartedEvent {
  visit_id: number;
  patient_id: number;
  patient_name: string;
  queue_number: number;
  encounter_id: number | null;
  consultation_start: string | null;
}

/**
 * Visit completed event data
 */
export interface VisitCompletedEvent {
  visit_id: number;
  patient_id: number;
  patient_name: string;
  queue_number: number;
  consultation_end: string | null;
}

/**
 * Patient removed event data
 */
export interface PatientRemovedEvent {
  visit_id: number;
  patient_id: number;
  patient_name: string;
  queue_number: number;
  status: string;
  reason: string;
}

/**
 * WebSocket hook options
 */
export interface UseWebSocketOptions {
  /** Whether to automatically reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Whether to sync events to patient journey store (default: true) */
  syncToJourneyStore?: boolean;
  /** Custom event handlers */
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

/**
 * WebSocket hook return type
 */
export interface UseWebSocketReturn {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean;
  /** Current connection state */
  connectionState: WebSocketConnectionState;
  /** Number of reconnect attempts made */
  reconnectAttempts: number;
  /** Manually disconnect the WebSocket */
  disconnect: () => void;
  /** Manually reconnect the WebSocket */
  reconnect: () => void;
  /** Send a message to the server (e.g., ping) */
  send: (data: unknown) => void;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the WebSocket URL based on current environment
 */
function getWebSocketUrl(path: string): string {
  if (typeof window === 'undefined') {
    return ''; // Server-side, return empty
  }

  // Use environment variable if set
  const wsHost = process.env.NEXT_PUBLIC_WS_URL;
  if (wsHost) {
    return `${wsHost}${path}`;
  }

  // Otherwise, derive from current location
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env.NEXT_PUBLIC_API_URL
    ? new URL(process.env.NEXT_PUBLIC_API_URL).host
    : window.location.host;

  return `${protocol}//${host}${path}`;
}

// =============================================================================
// Base WebSocket Hook
// =============================================================================

/**
 * Low-level WebSocket hook with reconnection logic
 */
export function useWebSocket(
  url: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const {
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Stable callback refs
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onMessage, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => {
    if (!url || typeof window === 'undefined') return;

    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Close existing connection if in closing state
    if (wsRef.current?.readyState === WebSocket.CLOSING) {
      wsRef.current.onclose = null; // Prevent triggering reconnect
      wsRef.current.close();
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        setReconnectAttempts(0);
        onConnectRef.current?.();
        console.log(`[WebSocket] Connected to ${url}`);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          onMessageRef.current?.(message);
        } catch (e) {
          console.warn('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onerror = (event) => {
        setConnectionState('error');
        onErrorRef.current?.(event);
        console.error('[WebSocket] Error:', event);
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        wsRef.current = null;
        onDisconnectRef.current?.();
        console.log('[WebSocket] Disconnected');

        // Auto-reconnect if enabled and not intentionally closed
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          setConnectionState('reconnecting');
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            setReconnectAttempts(reconnectAttemptsRef.current);
            connect();
          }, reconnectDelay);
        }
      };
    } catch (e) {
      console.error('[WebSocket] Failed to connect:', e);
      setConnectionState('error');
    }
  }, [url, autoReconnect, reconnectDelay, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent auto-reconnect
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('disconnected');
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    // Small delay to ensure clean disconnect
    setTimeout(() => connect(), 100);
  }, [connect, disconnect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocket] Cannot send - not connected');
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (url) {
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only reconnect when URL changes, callbacks are stable refs
  }, [url]);

  return {
    isConnected: connectionState === 'connected',
    connectionState,
    reconnectAttempts,
    disconnect,
    reconnect,
    send,
  };
}

// =============================================================================
// Clinic Queue WebSocket Hook
// =============================================================================

/**
 * WebSocket hook specifically for clinic queue real-time updates.
 *
 * Automatically:
 * - Invalidates React Query cache on queue events
 * - Updates patient journey store on consultation events
 * - Falls back gracefully to polling if WebSocket fails
 *
 * @param clinicId - The clinic ID to subscribe to
 * @param options - WebSocket options
 */
export function useClinicQueueSocket(
  clinicId: number | null | undefined,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();
  const journeyStore = usePatientJourneyStore();
  const { syncToJourneyStore = true, ...restOptions } = options;

  // Build WebSocket URL
  const url = clinicId ? getWebSocketUrl(`/ws/clinics/${clinicId}/queue/`) : null;

  // Event handler that integrates with React Query and Zustand
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      if (!clinicId) return;

      console.log(`[WebSocket] Clinic ${clinicId} event:`, message.event, message.data);

      // Invalidate React Query cache based on event type
      switch (message.event) {
        case 'patient_added':
        case 'patient_removed':
        case 'patient_called':
        case 'consultation_started':
        case 'visit_completed':
          // Invalidate queue and stats
          queryClient.invalidateQueries({ queryKey: clinicKeys.queue(clinicId) });
          queryClient.invalidateQueries({ queryKey: clinicKeys.queueStats(clinicId) });
          queryClient.invalidateQueries({ queryKey: clinicKeys.dashboard(clinicId) });
          break;

        case 'stats_updated':
          // Only invalidate stats
          queryClient.invalidateQueries({ queryKey: clinicKeys.queueStats(clinicId) });
          break;
      }

      // Sync to patient journey store if enabled
      if (syncToJourneyStore) {
        switch (message.event) {
          case 'patient_added': {
            const data = message.data as PatientAddedEvent;
            // Register patient in journey store if not already present
            const existingPatient = journeyStore.getPatient(data.patient_id);
            if (!existingPatient) {
              journeyStore.registerPatient({
                id: data.patient_id,
                mrn: '', // Not provided in WebSocket event
                name: data.patient_name,
              });
            }
            // Add to waiting queue
            journeyStore.addToWaitingQueue(data.patient_id);
            break;
          }

          case 'patient_called': {
            const data = message.data as PatientCalledEvent;
            journeyStore.callPatient(data.patient_id);
            break;
          }

          case 'consultation_started': {
            const data = message.data as ConsultationStartedEvent;
            journeyStore.startConsultation(data.patient_id);
            // Update encounter ID if provided
            if (data.encounter_id) {
              journeyStore.setEncounter(data.patient_id, data.encounter_id, 'OPD');
            }
            break;
          }

          case 'visit_completed': {
            const data = message.data as VisitCompletedEvent;
            journeyStore.endConsultation(data.patient_id);
            break;
          }

          case 'patient_removed': {
            const data = message.data as PatientRemovedEvent;
            if (data.status === 'NO_SHOW') {
              journeyStore.markLeftWithoutBeingSeen(data.patient_id);
            } else {
              // Just remove from active tracking
              journeyStore.removePatient(data.patient_id);
            }
            break;
          }
        }
      }

      // Call custom handler if provided
      options.onMessage?.(message);
    },
    [clinicId, queryClient, journeyStore, syncToJourneyStore, options]
  );

  return useWebSocket(url, {
    ...restOptions,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Connection Status Component Helper
// =============================================================================

/**
 * Get human-readable connection status
 */
export function getConnectionStatusText(state: WebSocketConnectionState): string {
  switch (state) {
    case 'connecting':
      return 'Connecting...';
    case 'connected':
      return 'Live updates active';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'disconnected':
      return 'Disconnected (polling fallback)';
    case 'error':
      return 'Connection error (polling fallback)';
    default:
      return 'Unknown';
  }
}

/**
 * Get connection status color for UI
 */
export function getConnectionStatusColor(
  state: WebSocketConnectionState
): 'green' | 'yellow' | 'red' | 'gray' {
  switch (state) {
    case 'connected':
      return 'green';
    case 'connecting':
    case 'reconnecting':
      return 'yellow';
    case 'error':
      return 'red';
    case 'disconnected':
    default:
      return 'gray';
  }
}
