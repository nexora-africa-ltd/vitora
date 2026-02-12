/**
 * Ward Compatibility Updates Hook
 *
 * Provides real-time updates for ward constraint changes and compatibility violations
 * using a WebSocket/polling hybrid approach.
 *
 * Architecture (from docs/wards-constraints.md):
 * - Primary: WebSocket for real-time updates
 * - Fallback: Polling when WebSocket unavailable (30s default interval)
 * - Events: ward_constraints_updated, compatibility_violation, bed_availability_changed
 *
 * Usage:
 * ```tsx
 * function WardDashboard({ wardId }: { wardId: number }) {
 *   const { events, currentState, isConnected, connectionState } = useWardCompatibilityUpdates(wardId);
 *   // Events are updated in real-time via WebSocket, with polling fallback
 * }
 * ```
 */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useWebSocket,
  WebSocketConnectionState,
  UseWebSocketOptions,
} from './use-websocket';
import { inpatientApi } from '@/lib/api/inpatient';
import type {
  WardUpdateEvent,
  WardCurrentState,
  SupervisorAlert,
} from '@/lib/types/inpatient';
import { inpatientQueryKeys } from './use-inpatient';

// =============================================================================
// Types
// =============================================================================

/**
 * Ward compatibility WebSocket event types (from backend consumers.py)
 */
export type WardCompatibilityEventType =
  | 'ward_constraints_updated'
  | 'compatibility_violation'
  | 'bed_availability_changed';

/**
 * Supervisor alert WebSocket event types
 */
export type SupervisorAlertEventType = 'critical_violation';

/**
 * Ward WebSocket message structure from backend
 */
export interface WardWebSocketMessage {
  type: WardCompatibilityEventType;
  ward_id: number;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Supervisor WebSocket message structure
 */
export interface SupervisorWebSocketMessage {
  type: SupervisorAlertEventType;
  data: SupervisorAlert;
  timestamp: string;
}

/**
 * Options for ward compatibility updates hook
 */
export interface UseWardCompatibilityUpdatesOptions {
  /** Polling interval in ms (default: 30000 = 30s) */
  pollingInterval?: number;
  /** Whether to enable polling fallback (default: true) */
  enablePolling?: boolean;
  /** Custom event handler for ward events */
  onEvent?: (event: WardUpdateEvent) => void;
  /** Custom handler for connection state changes */
  onConnectionChange?: (state: WebSocketConnectionState) => void;
}

/**
 * Options for supervisor alerts hook
 */
export interface UseSupervisorAlertsOptions {
  /** Polling interval in ms (default: 15000 = 15s for critical alerts) */
  pollingInterval?: number;
  /** Whether to enable polling fallback (default: true) */
  enablePolling?: boolean;
  /** Custom handler for new alerts */
  onAlert?: (alert: SupervisorAlert) => void;
  /** Custom handler for connection state changes */
  onConnectionChange?: (state: WebSocketConnectionState) => void;
}

/**
 * Return type for ward compatibility updates hook
 */
export interface UseWardCompatibilityUpdatesReturn {
  /** Recent ward events */
  events: WardUpdateEvent[];
  /** Current ward constraint state */
  currentState: WardCurrentState | null;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Current connection state */
  connectionState: WebSocketConnectionState;
  /** Whether using polling fallback */
  isPolling: boolean;
  /** Manually trigger a refresh */
  refresh: () => void;
  /** Last update timestamp */
  lastUpdated: Date | null;
}

/**
 * Return type for supervisor alerts hook
 */
export interface UseSupervisorAlertsReturn {
  /** Recent critical violation alerts */
  alerts: SupervisorAlert[];
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Current connection state */
  connectionState: WebSocketConnectionState;
  /** Whether using polling fallback */
  isPolling: boolean;
  /** Manually trigger a refresh */
  refresh: () => void;
  /** Last update timestamp */
  lastUpdated: Date | null;
  /** Whether polling is loading */
  isLoading: boolean;
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
// Ward Compatibility WebSocket Hook
// =============================================================================

/**
 * WebSocket hook for ward-specific compatibility updates.
 *
 * Subscribes to real-time updates for a specific ward, including:
 * - Ward constraint changes
 * - Compatibility violations during admission
 * - Bed availability changes
 *
 * @param wardId - Ward ID to subscribe to (null to disable)
 * @param options - WebSocket options
 */
export function useWardCompatibilitySocket(
  wardId: number | null,
  options: UseWebSocketOptions = {}
): ReturnType<typeof useWebSocket> {
  const queryClient = useQueryClient();

  const url = wardId ? getWebSocketUrl(`/ws/inpatient/wards/${wardId}/`) : null;

  const handleMessage = useCallback(
    (message: unknown) => {
      if (!wardId) return;

      const wsMessage = message as WardWebSocketMessage;
      console.log(`[WebSocket] Ward ${wardId} event:`, wsMessage.type, wsMessage.data);

      // Invalidate ward-specific queries
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.ward(wardId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wardBeds(wardId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });

      // Also invalidate admissions if it's a violation event
      if (wsMessage.type === 'compatibility_violation') {
        queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });
      }

      // Call custom handler if provided
      if (options.onMessage) {
        options.onMessage(message as never);
      }
    },
    [wardId, queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Supervisor Alerts WebSocket Hook
// =============================================================================

/**
 * WebSocket hook for supervisor critical violation alerts.
 *
 * Subscribes to real-time alerts when CRITICAL constraint violations
 * are overridden during admission. Requires receive_critical_alerts permission.
 *
 * @param options - WebSocket options
 */
export function useSupervisorAlertsSocket(
  options: UseWebSocketOptions = {}
): ReturnType<typeof useWebSocket> {
  const queryClient = useQueryClient();

  const url = getWebSocketUrl('/ws/inpatient/supervisor/alerts/');

  const handleMessage = useCallback(
    (message: unknown) => {
      const wsMessage = message as SupervisorWebSocketMessage;
      console.log('[WebSocket] Supervisor alert:', wsMessage.type, wsMessage.data);

      // Invalidate admission queries for the affected admission
      if (wsMessage.data?.admission_id) {
        queryClient.invalidateQueries({
          queryKey: inpatientQueryKeys.admission(wsMessage.data.admission_id),
        });
      }
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });

      // Call custom handler if provided
      if (options.onMessage) {
        options.onMessage(message as never);
      }
    },
    [queryClient, options]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}

// =============================================================================
// Hybrid Hook: Ward Compatibility Updates (WS + Polling)
// =============================================================================

/**
 * Hybrid hook for ward compatibility updates.
 *
 * Uses WebSocket for real-time updates with automatic polling fallback
 * when WebSocket is unavailable or disconnected.
 *
 * @param wardId - Ward ID to monitor (null to disable)
 * @param options - Hook options
 */
export function useWardCompatibilityUpdates(
  wardId: number | null,
  options: UseWardCompatibilityUpdatesOptions = {}
): UseWardCompatibilityUpdatesReturn {
  const {
    pollingInterval = 30000,
    enablePolling = true,
    onEvent,
    onConnectionChange,
  } = options;

  const [events, setEvents] = useState<WardUpdateEvent[]>([]);
  const [currentState, setCurrentState] = useState<WardCurrentState | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const lastPollTimeRef = useRef<string | undefined>(undefined);

  // WebSocket connection
  const {
    isConnected,
    connectionState,
    reconnect,
  } = useWardCompatibilitySocket(wardId, {
    onMessage: (message) => {
      const wsMessage = message as unknown as WardWebSocketMessage;
      const event: WardUpdateEvent = {
        type: wsMessage.type,
        timestamp: wsMessage.timestamp,
        ...wsMessage.data,
      };
      setEvents((prev) => [event, ...prev.slice(0, 49)]); // Keep last 50 events
      setLastUpdated(new Date());
      onEvent?.(event);
    },
    onConnect: () => onConnectionChange?.('connected'),
    onDisconnect: () => onConnectionChange?.('disconnected'),
  });

  // Polling fallback (only when WebSocket disconnected and polling enabled)
  const shouldPoll = enablePolling && !isConnected && wardId !== null;

  const {
    data: pollingData,
    refetch: refetchPolling,
  } = useQuery({
    queryKey: ['ward-updates', wardId, 'polling'],
    queryFn: async () => {
      if (!wardId) return null;
      const result = await inpatientApi.getWardUpdates(wardId, lastPollTimeRef.current);
      lastPollTimeRef.current = new Date().toISOString();
      return result;
    },
    enabled: shouldPoll,
    refetchInterval: shouldPoll ? pollingInterval : false,
    staleTime: pollingInterval / 2,
  });

  // Process polling data
  useEffect(() => {
    if (pollingData) {
      if (pollingData.events?.length > 0) {
        setEvents((prev) => {
          const newEvents = pollingData.events.filter(
            (e) => !prev.some((p) => p.timestamp === e.timestamp)
          );
          return [...newEvents, ...prev].slice(0, 50);
        });
        if (onEvent) {
          pollingData.events.forEach(onEvent);
        }
      }
      if (pollingData.current_state) {
        setCurrentState(pollingData.current_state);
      }
      setLastUpdated(new Date());
    }
  }, [pollingData, onEvent]);

  // Manual refresh function
  const refresh = useCallback(() => {
    if (isConnected) {
      // Force reconnect to get fresh state
      reconnect();
    } else if (wardId) {
      refetchPolling();
    }
  }, [isConnected, reconnect, refetchPolling, wardId]);

  return {
    events,
    currentState,
    isConnected,
    connectionState,
    isPolling: shouldPoll,
    refresh,
    lastUpdated,
  };
}

// =============================================================================
// Hybrid Hook: Supervisor Alerts (WS + Polling)
// =============================================================================

/**
 * Hybrid hook for supervisor critical violation alerts.
 *
 * Uses WebSocket for real-time alerts with automatic polling fallback.
 * Requires receive_critical_alerts permission on the backend.
 *
 * @param options - Hook options
 */
export function useSupervisorAlerts(
  options: UseSupervisorAlertsOptions = {}
): UseSupervisorAlertsReturn {
  const {
    pollingInterval = 15000, // 15s for critical alerts
    enablePolling = true,
    onAlert,
    onConnectionChange,
  } = options;

  const [alerts, setAlerts] = useState<SupervisorAlert[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const lastPollTimeRef = useRef<string | undefined>(undefined);
  const seenAlertIdsRef = useRef<Set<number>>(new Set());

  // WebSocket connection
  const {
    isConnected,
    connectionState,
    reconnect,
  } = useSupervisorAlertsSocket({
    onMessage: (message) => {
      const wsMessage = message as unknown as SupervisorWebSocketMessage;
      if (wsMessage.data && !seenAlertIdsRef.current.has(wsMessage.data.admission_id)) {
        seenAlertIdsRef.current.add(wsMessage.data.admission_id);
        setAlerts((prev) => [wsMessage.data, ...prev.slice(0, 49)]);
        setLastUpdated(new Date());
        onAlert?.(wsMessage.data);
      }
    },
    onConnect: () => onConnectionChange?.('connected'),
    onDisconnect: () => onConnectionChange?.('disconnected'),
  });

  // Polling fallback
  const shouldPoll = enablePolling && !isConnected;

  const {
    data: pollingData,
    refetch: refetchPolling,
    isLoading,
  } = useQuery({
    queryKey: ['supervisor-alerts', 'polling'],
    queryFn: async () => {
      const result = await inpatientApi.getSupervisorAlerts(lastPollTimeRef.current, 20);
      lastPollTimeRef.current = new Date().toISOString();
      return result;
    },
    enabled: shouldPoll,
    refetchInterval: shouldPoll ? pollingInterval : false,
    staleTime: pollingInterval / 2,
  });

  // Process polling data
  useEffect(() => {
    if (pollingData?.alerts && pollingData.alerts.length > 0) {
      const newAlerts = pollingData.alerts.filter(
        (a) => !seenAlertIdsRef.current.has(a.admission_id)
      );
      if (newAlerts.length > 0) {
        newAlerts.forEach((a) => {
          seenAlertIdsRef.current.add(a.admission_id);
          onAlert?.(a);
        });
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));
        setLastUpdated(new Date());
      }
    }
  }, [pollingData, onAlert]);

  // Manual refresh function
  const refresh = useCallback(() => {
    if (isConnected) {
      reconnect();
    } else {
      refetchPolling();
    }
  }, [isConnected, reconnect, refetchPolling]);

  return {
    alerts,
    isConnected,
    connectionState,
    isPolling: shouldPoll,
    refresh,
    lastUpdated,
    isLoading,
  };
}
