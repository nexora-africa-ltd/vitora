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

// =============================================================================
// Lab WebSocket Event Types (from backend laboratory/consumers.py)
// =============================================================================

/**
 * Laboratory WebSocket event types
 */
export type LabEventType =
  | 'result_entered'
  | 'result_verified'
  | 'critical_alert'
  | 'order_completed'
  | 'queue_updated';

/**
 * Lab result verified event data
 */
export interface LabResultVerifiedEvent {
  result_id: number;
  order_id: number;
  order_number: string;
  test_name: string;
  test_code: string;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  encounter_id: number | null;
  is_critical: boolean;
  result_flag: string;
  verified_by: string;
  verified_at: string;
}

/**
 * Lab critical alert event data (extends verified event)
 */
export interface LabCriticalAlertEvent extends LabResultVerifiedEvent {
  critical_value: string;
  reference_range: string;
}

/**
 * Lab order completed event data
 */
export interface LabOrderCompletedEvent {
  order_id: number;
  order_number: string;
  patient_id: number;
  patient_name: string;
  total_tests: number;
  verified_count: number;
  completed_at: string;
}

/**
 * Lab queue updated event data
 */
export interface LabQueueUpdatedEvent {
  queue_id: number;
  order_id: number;
  status: string;
  updated_by: string;
  updated_at: string;
}

/**
 * Lab WebSocket message structure
 */
export interface LabWebSocketMessage<T = unknown> {
  event: LabEventType;
  data: T;
}

// =============================================================================
// MCH Labour Partograph WebSocket Types
// =============================================================================

export type PartographEventType = 'partograph.observation_recorded';

export interface PartographObservationEvent {
  observation_id: number;
  partograph_id: number;
  registration_id: number;
  observation_time: string;
  fetal_heart_rate: number | null;
  cervical_dilation_cm: string | null;
  contractions_per_10_min: number | null;
  contraction_duration_seconds: number | null;
  maternal_pulse: number | null;
  urine_volume_ml: number | null;
  alerts: string[];
}

export interface PartographWebSocketMessage<T = unknown> {
  event: PartographEventType;
  data: T;
}

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
 * WebSocket hook options (generic for different message types)
 */
export interface UseWebSocketOptions<TMessage = WebSocketMessage> {
  /** Whether to automatically reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Whether to sync events to patient journey store (default: true) */
  syncToJourneyStore?: boolean;
  /** Custom event handlers */
  onMessage?: (message: TMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

/**
 * Lab-specific WebSocket options with proper lab event typing
 */
export type UseLabWebSocketOptions = UseWebSocketOptions<LabWebSocketMessage>;

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
export function useWebSocket<TMessage = WebSocketMessage>(
  url: string | null,
  options: UseWebSocketOptions<TMessage> = {}
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
          const message = JSON.parse(event.data) as TMessage;
          onMessageRef.current?.(message);
        } catch (e) {
          console.warn('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onerror = (event) => {
        setConnectionState('error');
        onErrorRef.current?.(event);
        // WebSocket error events don't carry useful info — log the URL instead
        console.warn(`[WebSocket] Connection error for ${url}. Server may not be running or WebSocket endpoint is unavailable. Falling back to polling.`);
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
// Laboratory WebSocket Hooks
// =============================================================================

/**
 * Query keys for lab-related React Query invalidation.
 * Must match the keys used in use-laboratory.ts!
 */
const labQueryKeys = {
  // Generic lab-orders list (used by useLabOrders)
  allOrders: () => ['lab-orders'] as const,
  // Order by orderNumber (used by useLabOrder)
  order: (orderNumber: string) => ['lab-orders', orderNumber] as const,
  // Orders for an encounter (used by useEncounterLabOrders)
  encounterOrders: (encounterId: number) => ['encounters', encounterId, 'lab-orders'] as const,
  // Orders for a patient (used by usePatientLabOrders)
  patientOrders: (patientId: number) => ['patients', patientId, 'lab-orders'] as const,
  // Lab queue (used by useLabQueue)
  queue: (status?: string) => ['lab-queue', status] as const,
  // Critical alerts
  criticalAlerts: () => ['critical-alerts'] as const,
};

/**
 * WebSocket hook for lab events on a specific encounter.
 *
 * Ideal for encounter detail pages where clinicians need updates on lab orders/results.
 * Automatically invalidates React Query cache when lab events occur.
 *
 * @param encounterId - The encounter ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useLabEncounterSocket(
  encounterId: number | null,
  options: UseLabWebSocketOptions = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = encounterId ? getWebSocketUrl(`/ws/lab/encounters/${encounterId}/`) : null;

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      if (!encounterId) return;

      // Cast to lab message type for proper event typing
      const labMessage = message as unknown as LabWebSocketMessage;

      console.log(`[WebSocket] Lab encounter ${encounterId} event:`, labMessage.event, labMessage.data);

      // Invalidate encounter-specific lab orders (matches useEncounterLabOrders key)
      queryClient.invalidateQueries({ queryKey: labQueryKeys.encounterOrders(encounterId) });
      // Also invalidate general lab-orders list
      queryClient.invalidateQueries({ queryKey: labQueryKeys.allOrders() });

      // Call custom handler if provided
      options.onMessage?.(labMessage);
    },
    [encounterId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

/**
 * WebSocket hook for lab events on a specific order.
 *
 * Ideal for lab order detail pages to get real-time updates when results
 * are entered, verified, or when the order status changes.
 *
 * @param orderId - The order ID to subscribe to (null to disable)
 * @param orderNumber - The order number for cache invalidation (optional)
 * @param encounterId - The encounter ID for cache invalidation (optional)
 * @param options - WebSocket options
 */
export function useLabOrderSocket(
  orderId: number | null,
  options: UseLabWebSocketOptions & { orderNumber?: string; encounterId?: number } = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();
  const { orderNumber, encounterId, ...wsOptions } = options;

  const url = orderId ? getWebSocketUrl(`/ws/lab/orders/${orderId}/`) : null;

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      if (!orderId) return;

      // Cast to lab message type for proper event typing
      const labMessage = message as unknown as LabWebSocketMessage;

      console.log(`[WebSocket] Lab order ${orderId} event:`, labMessage.event, labMessage.data);

      // Invalidate this specific order by order number
      if (orderNumber) {
        queryClient.invalidateQueries({ queryKey: labQueryKeys.order(orderNumber) });
      }
      // Invalidate encounter lab orders if we have the encounterId
      if (encounterId) {
        queryClient.invalidateQueries({ queryKey: labQueryKeys.encounterOrders(encounterId) });
      }
      // Also invalidate the general orders list
      queryClient.invalidateQueries({ queryKey: labQueryKeys.allOrders() });

      // Call custom handler if provided
      wsOptions.onMessage?.(labMessage);
    },
    [orderId, orderNumber, encounterId, queryClient, wsOptions]
  );

  return useWebSocket(url, {
    ...wsOptions,
    onMessage: handleMessage,
  });
}

/**
 * WebSocket hook for clinician-wide lab notifications.
 *
 * Used in the laboratory layout to receive critical lab result alerts
 * and general lab notifications. Shows toast notifications for critical results.
 *
 * @param options - WebSocket options
 */
export function useLabClinicianSocket(
  options: UseLabWebSocketOptions = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = getWebSocketUrl('/ws/lab/clinician/');

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      // Cast to lab message type for proper event typing
      const labMessage = message as unknown as LabWebSocketMessage;

      console.log('[WebSocket] Lab clinician event:', labMessage.event, labMessage.data);

      // Handle critical alerts specially
      if (labMessage.event === 'critical_alert') {
        const data = labMessage.data as LabCriticalAlertEvent;
        // Import toast dynamically to avoid circular deps
        import('@/lib/hooks/use-toast').then(({ toast }) => {
          toast({
            variant: 'destructive',
            title: `🚨 Critical Lab Result: ${data.test_name}`,
            description: `Patient: ${data.patient_name} (${data.patient_mrn}) - Value: ${data.critical_value}`,
            duration: 10000,
          });
        });
      }

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: labQueryKeys.allOrders() });
      queryClient.invalidateQueries({ queryKey: labQueryKeys.criticalAlerts() });

      // Call custom handler if provided
      options.onMessage?.(labMessage);
    },
    [queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

/**
 * WebSocket hook for lab queue updates (for lab technicians).
 *
 * Provides real-time updates for the lab queue view, including
 * sample collection, processing status, and result verification.
 *
 * @param options - WebSocket options
 */
export function useLabQueueSocket(
  options: UseLabWebSocketOptions = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = getWebSocketUrl('/ws/lab/queue/');

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      // Cast to lab message type for proper event typing
      const labMessage = message as unknown as LabWebSocketMessage;

      console.log('[WebSocket] Lab queue event:', labMessage.event, labMessage.data);

      // Invalidate lab queue queries
      queryClient.invalidateQueries({ queryKey: labQueryKeys.queue() });
      queryClient.invalidateQueries({ queryKey: labQueryKeys.allOrders() });

      // Call custom handler if provided
      options.onMessage?.(labMessage);
    },
    [queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Emergency Module WebSocket Hook
// =============================================================================

/**
 * Emergency WebSocket event types
 */
export type EmergencyEventType =
  | 'state_update'
  | 'critical_update'
  | 'zones_update'
  | 'patient_added'
  | 'patient_moved'
  | 'bed_update'
  | 'wait_time_breach'
  | 'escalation_event';

/**
 * Critical patient data from WebSocket
 */
export interface EmergencyCriticalPatient {
  id: number;  // Triage assessment ID
  queue_id?: number;  // Queue entry ID
  encounter_id?: number;
  encounter_status?: string;  // CREATED, IN_PROGRESS, CLOSED, CANCELLED
  patient_name: string;
  mrn: string;
  chief_complaint: string;
  assigned_area: string;
  assigned_area_display: string;
  wait_minutes: number;
  arrival_time: string;
  status: string;  // Queue status
}

/**
 * Zone summary data from WebSocket
 */
export interface EmergencyZoneSummary {
  code: string;
  name: string;
  capacity: number;
  total: number;
  primary_category: string;
  by_category: Record<string, number>;
}

/**
 * Emergency state update data
 */
export interface EmergencyStateData {
  critical: {
    count: number;
    patients: EmergencyCriticalPatient[];
  };
  zones: {
    zones: EmergencyZoneSummary[];
    total_patients: number;
  };
  timestamp: string;
}

/**
 * Emergency WebSocket message
 */
export interface EmergencyWebSocketMessage {
  type: EmergencyEventType;
  data: EmergencyStateData | unknown;
}

/**
 * Emergency socket options
 */
export interface UseEmergencySocketOptions extends Omit<UseWebSocketOptions, 'onMessage'> {
  /** Callback when state update is received */
  onStateUpdate?: (data: EmergencyStateData) => void;
  /** Callback for critical patient updates */
  onCriticalUpdate?: (data: { count: number; patients: EmergencyCriticalPatient[] }) => void;
  /** Callback for zone updates */
  onZonesUpdate?: (data: { zones: EmergencyZoneSummary[]; total_patients: number }) => void;
  /** Callback for wait time breach alerts (Phase 4) */
  onWaitTimeBreach?: (data: { breaches: unknown[]; count: number; timestamp: string }) => void;
  /** Callback for escalation events (Phase 4) */
  onEscalationEvent?: (data: { escalation: unknown; timestamp: string }) => void;
}

/**
 * Emergency socket return type with additional data
 */
export interface UseEmergencySocketReturn extends UseWebSocketReturn {
  /** Latest critical patients data */
  criticalData: { count: number; patients: EmergencyCriticalPatient[] } | null;
  /** Latest zones summary data */
  zonesData: { zones: EmergencyZoneSummary[]; total_patients: number } | null;
  /** Last update timestamp */
  lastUpdate: Date | null;
}

/**
 * WebSocket hook for emergency department dashboard.
 *
 * Provides real-time updates for critical patients and zone statistics.
 * Automatically broadcasts state updates every 5 seconds from the server.
 *
 * Falls back to polling if WebSocket connection fails.
 *
 * @param options - Emergency socket options
 */
export function useEmergencySocket(
  options: UseEmergencySocketOptions = {}
): UseEmergencySocketReturn {
  const queryClient = useQueryClient();
  const [criticalData, setCriticalData] = useState<{ count: number; patients: EmergencyCriticalPatient[] } | null>(null);
  const [zonesData, setZonesData] = useState<{ zones: EmergencyZoneSummary[]; total_patients: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const url = getWebSocketUrl('/ws/emergency/queue/');

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      const emergencyMessage = message as unknown as EmergencyWebSocketMessage;

      console.log('[WebSocket] Emergency event:', emergencyMessage.type);

      switch (emergencyMessage.type) {
        case 'state_update': {
          const data = emergencyMessage.data as EmergencyStateData;
          setCriticalData(data.critical);
          setZonesData(data.zones);
          setLastUpdate(new Date(data.timestamp));
          options.onStateUpdate?.(data);
          // Invalidate React Query cache
          queryClient.invalidateQueries({ queryKey: ['triage', 'critical'] });
          queryClient.invalidateQueries({ queryKey: ['triage', 'zones'] });
          break;
        }
        case 'critical_update': {
          const data = emergencyMessage.data as { count: number; patients: EmergencyCriticalPatient[] };
          setCriticalData(data);
          setLastUpdate(new Date());
          options.onCriticalUpdate?.(data);
          queryClient.invalidateQueries({ queryKey: ['triage', 'critical'] });
          break;
        }
        case 'zones_update': {
          const data = emergencyMessage.data as { zones: EmergencyZoneSummary[]; total_patients: number };
          setZonesData(data);
          setLastUpdate(new Date());
          options.onZonesUpdate?.(data);
          queryClient.invalidateQueries({ queryKey: ['triage', 'zones'] });
          break;
        }
        case 'bed_update': {
          // Bed status changed — invalidate bed board and summary caches
          setLastUpdate(new Date());
          queryClient.invalidateQueries({ queryKey: ['triage', 'er-beds'] });
          break;
        }
        case 'wait_time_breach': {
          // Wait time breach detected — invalidate breach caches and notify
          const breachData = emergencyMessage.data as { breaches: unknown[]; count: number; timestamp: string };
          setLastUpdate(new Date());
          queryClient.invalidateQueries({ queryKey: ['triage', 'breaches'] });
          options.onWaitTimeBreach?.(breachData);
          break;
        }
        case 'escalation_event': {
          // Escalation raised — invalidate escalation caches and notify
          const escData = emergencyMessage.data as { escalation: unknown; timestamp: string };
          setLastUpdate(new Date());
          queryClient.invalidateQueries({ queryKey: ['triage', 'escalations'] });
          options.onEscalationEvent?.(escData);
          break;
        }
        default:
          console.log('[WebSocket] Unhandled emergency event:', emergencyMessage.type);
      }
    },
    [queryClient, options]
  );

  const wsResult = useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });

  return {
    ...wsResult,
    criticalData,
    zonesData,
    lastUpdate,
  };
}

// =============================================================================
// MCH Labour Partograph WebSocket Hook
// =============================================================================

export function useLabourPartographSocket(
  partographId: number | null,
  registrationId?: number | null,
  options: UseWebSocketOptions<PartographWebSocketMessage> = {}
): UseWebSocketReturn & { lastUpdate: Date | null } {
  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const url = partographId ? getWebSocketUrl(`/ws/mch/partographs/${partographId}/`) : null;

  const handleMessage = useCallback(
    (message: PartographWebSocketMessage) => {
      if (!partographId) return;

      setLastUpdate(new Date());
      queryClient.invalidateQueries({ queryKey: ['mch-partographs', { registration: registrationId ?? null }] });
      queryClient.invalidateQueries({ queryKey: ['mch-partograph-observations', partographId] });

      options.onMessage?.(message);
    },
    [options, partographId, queryClient, registrationId]
  );

  const wsResult = useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });

  return {
    ...wsResult,
    lastUpdate,
  };
}

// =============================================================================
// Scheduling WebSocket Hook
// =============================================================================

/**
 * Scheduling WebSocket event types (from backend scheduling/consumers.py)
 */
export type SchedulingEventType =
  | 'scheduling.appointment_created'
  | 'scheduling.appointment_confirmed'
  | 'scheduling.appointment_checked_in'
  | 'scheduling.appointment_started'
  | 'scheduling.appointment_completed'
  | 'scheduling.appointment_cancelled'
  | 'scheduling.appointment_no_show'
  | 'scheduling.schedule_updated'
  | 'scheduling.assignment_decided'
  | 'scheduling.stats_updated'
  | 'scheduling.swap_requested'
  | 'scheduling.swap_accepted'
  | 'scheduling.swap_approved'
  | 'scheduling.swap_completed'
  | 'scheduling.swap_rejected'
  | 'scheduling.swap_cancelled'
  | 'scheduling.swap_expired'
  | 'scheduling.shift_reminder'
  | 'scheduling.on_duty_update';

/**
 * Scheduling WebSocket message structure
 */
export interface SchedulingWebSocketMessage<T = unknown> {
  event: SchedulingEventType;
  data: T;
}

/**
 * Scheduling appointment event data
 */
export interface SchedulingAppointmentEvent {
  appointment_id: number;
  patient_id: number;
  patient_name: string;
  resource_id: number;
  resource_name: string;
  status: string;
  appointment_type: string;
  scheduled_date: string;
  scheduled_time: string;
}

/**
 * WebSocket hook for scheduling/appointment real-time updates.
 *
 * Automatically invalidates React Query cache on appointment lifecycle events
 * and schedule availability changes. Falls back to polling if WebSocket fails.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useSchedulingSocket(
  facilityId: number | null,
  options: UseWebSocketOptions<SchedulingWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/scheduling/${facilityId}/appointments/`) : null;

  const handleMessage = useCallback(
    (message: SchedulingWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] Scheduling facility ${facilityId} event:`, message.event, message.data);

      switch (message.event) {
        case 'scheduling.appointment_created':
        case 'scheduling.appointment_confirmed':
        case 'scheduling.appointment_checked_in':
        case 'scheduling.appointment_started':
        case 'scheduling.appointment_completed':
        case 'scheduling.appointment_cancelled':
        case 'scheduling.appointment_no_show':
          // Invalidate all appointment-related queries
          queryClient.invalidateQueries({ queryKey: ['scheduling-appointments'] });
          queryClient.invalidateQueries({ queryKey: ['scheduling-appointments-today'] });
          queryClient.invalidateQueries({ queryKey: ['scheduling-appointments-upcoming'] });
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'scheduling.schedule_updated':
        case 'scheduling.assignment_decided':
          // Invalidate schedule and resource queries
          queryClient.invalidateQueries({ queryKey: ['scheduling-appointments'] });
          queryClient.invalidateQueries({ queryKey: ['scheduling-appointments-today'] });
          break;

        case 'scheduling.stats_updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'scheduling.swap_requested':
        case 'scheduling.swap_accepted':
        case 'scheduling.swap_approved':
        case 'scheduling.swap_completed':
        case 'scheduling.swap_rejected':
        case 'scheduling.swap_cancelled':
        case 'scheduling.swap_expired':
          queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
          queryClient.invalidateQueries({ queryKey: ['shift-swaps-available'] });
          queryClient.invalidateQueries({ queryKey: ['shift-swaps-my'] });
          queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
          break;

        case 'scheduling.shift_reminder': {
          // Show toast notification for upcoming shift
          const reminderData = message.data as { title?: string; message?: string; shift_type?: string; start_time?: string };
          import('@/lib/hooks/use-toast').then(({ toast }) => {
            toast({
              title: reminderData.title ?? '⏰ Shift starting soon',
              description: reminderData.message ?? `Your shift starts at ${reminderData.start_time ?? 'soon'}. Please clock in.`,
              duration: 15000,
            });
          });
          queryClient.invalidateQueries({ queryKey: ['my-today-shift'] });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          break;
        }

        case 'scheduling.on_duty_update':
          queryClient.invalidateQueries({ queryKey: ['on-duty'] });
          queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
          break;
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Pharmacy WebSocket Hook
// =============================================================================

/**
 * Pharmacy WebSocket event types (from backend pharmacy/consumers.py)
 */
export type PharmacyEventType =
  | 'pharmacy.prescription_created'
  | 'pharmacy.dispensing_completed'
  | 'pharmacy.stock_critical'
  | 'pharmacy.stock_low_warning'
  | 'pharmacy.prescription_expired'
  | 'pharmacy.stats_updated';

/**
 * Pharmacy WebSocket message structure
 */
export interface PharmacyWebSocketMessage<T = unknown> {
  event: PharmacyEventType;
  data: T;
}

/**
 * Pharmacy stock alert event data
 */
export interface PharmacyStockAlertEvent {
  drug_id: number;
  drug_name: string;
  generic_name: string;
  current_quantity: number;
  reorder_level: number;
  alert_type: 'critical' | 'low_warning';
}

/**
 * Pharmacy prescription event data
 */
export interface PharmacyPrescriptionEvent {
  prescription_id: number;
  prescription_number: string;
  patient_id: number;
  patient_name: string;
  encounter_id: number | null;
  item_count: number;
  status: string;
}

/**
 * WebSocket hook for pharmacy queue real-time updates.
 *
 * Automatically invalidates React Query cache for prescriptions, dispensing,
 * and stock queries. Shows toast notifications for critical stock alerts.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function usePharmacySocket(
  facilityId: number | null,
  options: UseWebSocketOptions<PharmacyWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/pharmacy/${facilityId}/queue/`) : null;

  const handleMessage = useCallback(
    (message: PharmacyWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] Pharmacy facility ${facilityId} event:`, message.event, message.data);

      switch (message.event) {
        case 'pharmacy.prescription_created':
        case 'pharmacy.prescription_expired':
          queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
          queryClient.invalidateQueries({ queryKey: ['prescriptions', 'pending'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'pharmacy.dispensing_completed':
          queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
          queryClient.invalidateQueries({ queryKey: ['dispensings'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'pharmacy.stock_critical':
          queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
          queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
          queryClient.invalidateQueries({ queryKey: ['drugs'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          // Show critical stock toast
          import('@/lib/hooks/use-toast').then(({ toast }) => {
            const data = message.data as PharmacyStockAlertEvent;
            toast({
              variant: 'destructive',
              title: `🚨 Critical Stock: ${data.drug_name}`,
              description: `Only ${data.current_quantity} units remaining (reorder level: ${data.reorder_level})`,
              duration: 10000,
            });
          });
          break;

        case 'pharmacy.stock_low_warning':
          queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
          queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
          queryClient.invalidateQueries({ queryKey: ['drugs'] });
          break;

        case 'pharmacy.stats_updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Billing WebSocket Hooks
// =============================================================================

/**
 * Billing WebSocket event types (from backend billing/consumers.py)
 */
export type BillingEventType =
  | 'billing.invoice_created'
  | 'billing.invoice_updated'
  | 'billing.payment_received'
  | 'billing.payment_reversed'
  | 'billing.stats_updated';

/**
 * SHA Claim WebSocket event types
 */
export type SHAClaimEventType =
  | 'sha.claim_submitted'
  | 'sha.claim_status_changed'
  | 'sha.stats_updated';

/**
 * Billing WebSocket message structure
 */
export interface BillingWebSocketMessage<T = unknown> {
  event: BillingEventType;
  data: T;
}

/**
 * SHA Claim WebSocket message structure
 */
export interface SHAClaimWebSocketMessage<T = unknown> {
  event: SHAClaimEventType;
  data: T;
}

/**
 * Payment received event data
 */
export interface PaymentReceivedEvent {
  payment_id: number;
  invoice_id: number;
  invoice_number: string;
  patient_name: string;
  amount: number;
  payment_method: string;
  received_at: string;
}

/**
 * Invoice updated event data
 */
export interface InvoiceUpdatedEvent {
  invoice_id: number;
  invoice_number: string;
  patient_name: string;
  status: string;
  total_amount: number;
  balance_due: number;
}

/**
 * WebSocket hook for billing (invoices/payments) real-time updates.
 *
 * Automatically invalidates React Query cache for invoices, payments,
 * and billing reports. Shows toast for payment confirmations.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useBillingSocket(
  facilityId: number | null,
  options: UseWebSocketOptions<BillingWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/billing/${facilityId}/invoices/`) : null;

  const handleMessage = useCallback(
    (message: BillingWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] Billing facility ${facilityId} event:`, message.event, message.data);

      switch (message.event) {
        case 'billing.invoice_created':
        case 'billing.invoice_updated':
          queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'billing.payment_received':
          queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] });
          queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] });
          queryClient.invalidateQueries({ queryKey: ['billing', 'reports'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          // Toast for payment confirmation
          import('@/lib/hooks/use-toast').then(({ toast }) => {
            const data = message.data as PaymentReceivedEvent;
            toast({
              title: '💰 Payment Received',
              description: `KES ${data.amount.toLocaleString()} for ${data.patient_name} (${data.invoice_number})`,
              duration: 5000,
            });
          });
          break;

        case 'billing.payment_reversed':
          queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] });
          queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] });
          queryClient.invalidateQueries({ queryKey: ['billing', 'reports'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'billing.stats_updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

/**
 * WebSocket hook for SHA claim real-time updates.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useSHAClaimSocket(
  facilityId: number | null,
  options: UseWebSocketOptions<SHAClaimWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/billing/${facilityId}/sha-claims/`) : null;

  const handleMessage = useCallback(
    (message: SHAClaimWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] SHA Claims facility ${facilityId} event:`, message.event, message.data);

      switch (message.event) {
        case 'sha.claim_submitted':
        case 'sha.claim_status_changed':
          queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] });
          queryClient.invalidateQueries({ queryKey: ['billing'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'sha.stats_updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Imaging WebSocket Hook
// =============================================================================

/**
 * Imaging WebSocket event types (from backend imaging/consumers.py)
 */
export type ImagingEventType =
  | 'imaging.order_created'
  | 'imaging.order_item_created'
  | 'imaging.result_completed'
  | 'imaging.stats_updated';

/**
 * Imaging WebSocket message structure
 */
export interface ImagingWebSocketMessage<T = unknown> {
  event: ImagingEventType;
  data: T;
}

/**
 * Imaging order event data
 */
export interface ImagingOrderEvent {
  order_id: number;
  order_number: string;
  patient_id: number;
  patient_name: string;
  encounter_id: number | null;
  modality: string;
  status: string;
}

/**
 * WebSocket hook for imaging order real-time updates.
 *
 * Invalidates React Query cache for imaging orders, worklist, and stats.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useImagingSocket(
  facilityId: number | null,
  options: UseWebSocketOptions<ImagingWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/imaging/${facilityId}/orders/`) : null;

  const handleMessage = useCallback(
    (message: ImagingWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] Imaging facility ${facilityId} event:`, message.event, message.data);

      switch (message.event) {
        case 'imaging.order_created':
        case 'imaging.order_item_created':
          queryClient.invalidateQueries({ queryKey: ['imaging', 'orders'] });
          queryClient.invalidateQueries({ queryKey: ['imaging', 'orders', 'worklist'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'imaging.result_completed':
          queryClient.invalidateQueries({ queryKey: ['imaging', 'orders'] });
          queryClient.invalidateQueries({ queryKey: ['imaging', 'orders', 'worklist'] });
          queryClient.invalidateQueries({ queryKey: ['imaging', 'orders', 'worklist-stats'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'imaging.stats_updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Immunization WebSocket Hook
// =============================================================================

/**
 * Immunization WebSocket event types (from backend immunizations/consumers.py)
 */
export type ImmunizationEventType =
  | 'immunization.record_administered'
  | 'immunization.aefi_reported'
  | 'immunization.schedule_generated'
  | 'immunization.stats_updated';

/**
 * Immunization WebSocket message structure
 */
export interface ImmunizationWebSocketMessage<T = unknown> {
  event: ImmunizationEventType;
  data: T;
}

/**
 * Immunization record event data
 */
export interface ImmunizationRecordEvent {
  record_id: number;
  patient_id: number;
  patient_name: string;
  vaccine_name: string;
  dose_number: number;
  administered_at: string;
}

/**
 * AEFI report event data
 */
export interface AEFIReportedEvent {
  aefi_id: number;
  patient_id: number;
  patient_name: string;
  vaccine_name: string;
  severity: string;
  reported_at: string;
}

/**
 * WebSocket hook for immunization real-time updates.
 *
 * Invalidates React Query cache for immunization records and schedules.
 * Shows toast for AEFI reports.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useImmunizationSocket(
  facilityId: number | null,
  options: UseWebSocketOptions<ImmunizationWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/immunizations/${facilityId}/records/`) : null;

  const handleMessage = useCallback(
    (message: ImmunizationWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] Immunization facility ${facilityId} event:`, message.event, message.data);

      switch (message.event) {
        case 'immunization.record_administered':
          queryClient.invalidateQueries({ queryKey: ['immunization-records'] });
          queryClient.invalidateQueries({ queryKey: ['vaccine-stock'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'immunization.aefi_reported':
          queryClient.invalidateQueries({ queryKey: ['immunization-records'] });
          queryClient.invalidateQueries({ queryKey: ['aefi-reports'] });
          // Toast for AEFI alert
          import('@/lib/hooks/use-toast').then(({ toast }) => {
            const data = message.data as AEFIReportedEvent;
            toast({
              variant: 'destructive',
              title: `⚠️ AEFI Reported: ${data.vaccine_name}`,
              description: `Patient: ${data.patient_name} — Severity: ${data.severity}`,
              duration: 10000,
            });
          });
          break;

        case 'immunization.schedule_generated':
          queryClient.invalidateQueries({ queryKey: ['immunization-records'] });
          queryClient.invalidateQueries({ queryKey: ['immunization-schedule'] });
          break;

        case 'immunization.stats_updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// MCH Extended WebSocket Hook (Registration, Delivery, ANC)
// =============================================================================

/**
 * MCH extended event types (beyond partograph)
 */
export type MCHEventType =
  | 'mch.registration_created'
  | 'mch.delivery_completed'
  | 'mch.anc_visit_created'
  | 'mch.baby_patient_created'
  | 'mch.stats_updated';

/**
 * MCH WebSocket message structure
 */
export interface MCHWebSocketMessage<T = unknown> {
  event: MCHEventType;
  data: T;
}

/**
 * MCH registration event data
 */
export interface MCHRegistrationEvent {
  registration_id: number;
  patient_id: number;
  patient_name: string;
  edd: string | null;
  risk_level: string;
}

/**
 * MCH delivery event data
 */
export interface MCHDeliveryEvent {
  registration_id: number;
  patient_name: string;
  delivery_date: string;
  baby_count: number;
  delivery_mode: string;
}

/**
 * WebSocket hook for MCH module real-time updates (beyond partograph).
 *
 * Covers registration, delivery completion, ANC visits, and baby creation events.
 * Complements useLabourPartographSocket which handles partograph observations.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useMCHSocket(
  facilityId: number | null,
  options: UseWebSocketOptions<MCHWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/mch/facility/${facilityId}/`) : null;

  const handleMessage = useCallback(
    (message: MCHWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] MCH facility ${facilityId} event:`, message.event, message.data);

      switch (message.event) {
        case 'mch.registration_created':
          queryClient.invalidateQueries({ queryKey: ['mch-registrations'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'mch.delivery_completed':
          queryClient.invalidateQueries({ queryKey: ['mch-registrations'] });
          queryClient.invalidateQueries({ queryKey: ['mch-partographs'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;

        case 'mch.anc_visit_created':
          queryClient.invalidateQueries({ queryKey: ['mch-registrations'] });
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          break;

        case 'mch.baby_patient_created':
          queryClient.invalidateQueries({ queryKey: ['mch-registrations'] });
          queryClient.invalidateQueries({ queryKey: ['patients'] });
          break;

        case 'mch.stats_updated':
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Dashboard WebSocket Hook (Projection Broadcasts)
// =============================================================================

/**
 * Dashboard broadcast event types
 */
export type DashboardEventType = 'stats_updated';

/**
 * Dashboard WebSocket message
 */
export interface DashboardWebSocketMessage {
  event: DashboardEventType;
  data: unknown;
}

/**
 * WebSocket hook for dashboard projection broadcasts.
 *
 * Listens for aggregated stats_updated events from clinic queue, ward occupancy,
 * and pharmacy queue projections. Invalidates the dashboard stats React Query
 * cache for near-instant dashboard updates without polling.
 *
 * @param facilityId - The facility ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useDashboardSocket(
  facilityId: number | null,
  options: UseWebSocketOptions<DashboardWebSocketMessage> = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = facilityId ? getWebSocketUrl(`/ws/dashboard/${facilityId}/`) : null;

  const handleMessage = useCallback(
    (message: DashboardWebSocketMessage) => {
      if (!facilityId) return;

      console.log(`[WebSocket] Dashboard facility ${facilityId} event:`, message.event);

      if (message.event === 'stats_updated') {
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
      }

      options.onMessage?.(message);
    },
    [facilityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
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

// =============================================================================
// Clinical Comments WebSocket Hook
// =============================================================================

export type CommentEventType =
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'comment.reaction_added'
  | 'comment.reaction_removed';

export interface CommentWebSocketMessage {
  event: CommentEventType;
  data: Record<string, unknown>;
}

/**
 * WebSocket hook for real-time comment updates on a specific entity.
 *
 * Automatically invalidates the React Query ['comments', entityType, entityId] cache
 * when comment events occur (create, update, delete, reaction).
 *
 * @param entityType - 'encounter' | 'lab-order' | 'prescription'
 * @param entityId - The entity ID to subscribe to (null/undefined to disable)
 */
export function useCommentSocket(
  entityType: string | null,
  entityId: number | string | null | undefined,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url =
    entityType && entityId
      ? getWebSocketUrl(`/ws/comments/${entityType}/${entityId}/`)
      : null;

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      if (!entityType || !entityId) return;

      const commentMessage = message as unknown as CommentWebSocketMessage;
      console.log(
        `[WebSocket] Comment ${entityType}/${entityId} event:`,
        commentMessage.event
      );

      // Invalidate the comments query for this entity
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] });

      options.onMessage?.(message);
    },
    [entityType, entityId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Notification WebSocket Hook
// =============================================================================

/** Message shape for the notification WebSocket consumer */
interface NotificationWebSocketMessage {
  type: string;
  notification?: Record<string, unknown>;
}

/**
 * WebSocket hook for real-time notification delivery.
 *
 * Connects to /ws/notifications/ and invalidates notification queries
 * when the backend pushes a new notification. This provides instant
 * badge updates and notification list refresh without waiting for polling.
 */
export function useNotificationSocket(
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const queryClient = useQueryClient();

  const url = getWebSocketUrl('/ws/notifications/');

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      const msg = message as unknown as NotificationWebSocketMessage;
      if (msg.type === 'new_notification') {
        // Invalidate notification queries for instant badge + list refresh
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }

      options.onMessage?.(message);
    },
    [queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}
