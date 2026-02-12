/**
 * Ward Compatibility Updates Hook
 *
 * Hybrid WebSocket + polling hook for ward constraint changes and compatibility violations.
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
import { useQuery } from '@tanstack/react-query';
import { inpatientApi } from '@/lib/api/inpatient';
import { parseResponse } from '@/lib/schemas/validation';
import { WardUpdatesResponseSchema } from '@/lib/schemas/inpatient.schema';
import type { WardUpdateEvent, WardCurrentState } from '@/lib/types/inpatient';
import { useWardCompatibilitySocket } from './use-ward-websocket';
import type {
  WardWebSocketMessage,
  UseWardCompatibilityUpdatesOptions,
  UseWardCompatibilityUpdatesReturn,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of events to keep in history */
const MAX_EVENTS = 50;

/** Default polling interval in ms */
const DEFAULT_POLLING_INTERVAL = 30000;

// =============================================================================
// Hook Implementation
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
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    enablePolling = true,
    onEvent,
    onConnectionChange,
  } = options;

  const [events, setEvents] = useState<WardUpdateEvent[]>([]);
  const [currentState, setCurrentState] = useState<WardCurrentState | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const lastPollTimeRef = useRef<string | undefined>(undefined);

  // Stable refs for callbacks to avoid stale closures
  const onEventRef = useRef(onEvent);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onEventRef.current = onEvent;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onEvent, onConnectionChange]);

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
      setEvents((prev) => [event, ...prev.slice(0, MAX_EVENTS - 1)]);
      setLastUpdated(new Date());
      onEventRef.current?.(event);
    },
    onConnect: () => onConnectionChangeRef.current?.('connected'),
    onDisconnect: () => onConnectionChangeRef.current?.('disconnected'),
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
      const rawResult = await inpatientApi.getWardUpdates(wardId, lastPollTimeRef.current);
      // Validate with Zod schema
      const result = parseResponse(WardUpdatesResponseSchema, rawResult, {
        context: 'useWardCompatibilityUpdates.polling',
      });
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
          return [...newEvents, ...prev].slice(0, MAX_EVENTS);
        });
        pollingData.events.forEach((event) => onEventRef.current?.(event));
      }
      if (pollingData.current_state) {
        setCurrentState(pollingData.current_state);
      }
      setLastUpdated(new Date());
    }
  }, [pollingData]);

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
