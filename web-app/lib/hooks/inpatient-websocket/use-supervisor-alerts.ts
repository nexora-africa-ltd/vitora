/**
 * Supervisor Alerts Hook
 *
 * Hybrid WebSocket + polling hook for supervisor critical violation alerts.
 *
 * Subscribes to real-time alerts when CRITICAL constraint violations
 * are overridden during admission. Requires receive_critical_alerts permission.
 *
 * Usage:
 * ```tsx
 * function SupervisorDashboard() {
 *   const { alerts, isConnected, refresh } = useSupervisorAlerts({
 *     onAlert: (alert) => showNotification(alert),
 *   });
 * }
 * ```
 */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inpatientApi } from '@/lib/api/inpatient';
import { parseResponse } from '@/lib/schemas/validation';
import { SupervisorAlertsResponseSchema } from '@/lib/schemas/inpatient.schema';
import type { SupervisorAlert } from '@/lib/types/inpatient';
import { useSupervisorAlertsSocket } from './use-supervisor-websocket';
import type {
  SupervisorWebSocketMessage,
  UseSupervisorAlertsOptions,
  UseSupervisorAlertsReturn,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of alerts to keep in history */
const MAX_ALERTS = 50;

/** Maximum size of seen alert IDs set before cleanup */
const MAX_SEEN_IDS = 500;

/** Default polling interval in ms (15s for critical alerts) */
const DEFAULT_POLLING_INTERVAL = 15000;

// =============================================================================
// Utility
// =============================================================================

/**
 * Trim a Set to retain only the most recent entries.
 * Returns a new Set with the last `maxSize` entries.
 */
function trimSet<T>(set: Set<T>, maxSize: number): Set<T> {
  if (set.size <= maxSize) return set;
  const arr = Array.from(set);
  return new Set(arr.slice(-maxSize));
}

// =============================================================================
// Hook Implementation
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
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    enablePolling = true,
    onAlert,
    onConnectionChange,
  } = options;

  const [alerts, setAlerts] = useState<SupervisorAlert[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const lastPollTimeRef = useRef<string | undefined>(undefined);
  const seenAlertIdsRef = useRef<Set<number>>(new Set());

  // Stable refs for callbacks to avoid stale closures
  const onAlertRef = useRef(onAlert);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onAlertRef.current = onAlert;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onAlert, onConnectionChange]);

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
        // Trim seen IDs set if it gets too large
        if (seenAlertIdsRef.current.size > MAX_SEEN_IDS) {
          seenAlertIdsRef.current = trimSet(seenAlertIdsRef.current, MAX_SEEN_IDS / 2);
        }
        setAlerts((prev) => [wsMessage.data, ...prev.slice(0, MAX_ALERTS - 1)]);
        setLastUpdated(new Date());
        onAlertRef.current?.(wsMessage.data);
      }
    },
    onConnect: () => onConnectionChangeRef.current?.('connected'),
    onDisconnect: () => onConnectionChangeRef.current?.('disconnected'),
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
      const rawResult = await inpatientApi.getSupervisorAlerts(lastPollTimeRef.current, 20);
      // Validate with Zod schema
      const result = parseResponse(SupervisorAlertsResponseSchema, rawResult, {
        context: 'useSupervisorAlerts.polling',
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
    if (pollingData?.alerts && pollingData.alerts.length > 0) {
      const newAlerts = pollingData.alerts.filter(
        (a) => !seenAlertIdsRef.current.has(a.admission_id)
      );
      if (newAlerts.length > 0) {
        newAlerts.forEach((a) => {
          seenAlertIdsRef.current.add(a.admission_id);
          onAlertRef.current?.(a);
        });
        // Trim seen IDs set if it gets too large
        if (seenAlertIdsRef.current.size > MAX_SEEN_IDS) {
          seenAlertIdsRef.current = trimSet(seenAlertIdsRef.current, MAX_SEEN_IDS / 2);
        }
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, MAX_ALERTS));
        setLastUpdated(new Date());
      }
    }
  }, [pollingData]);

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
