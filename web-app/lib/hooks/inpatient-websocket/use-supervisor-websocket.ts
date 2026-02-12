/**
 * Supervisor Alerts WebSocket Hook
 *
 * Low-level WebSocket hook for supervisor critical violation alerts.
 * Used internally by useSupervisorAlerts hybrid hook.
 */
'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket, UseWebSocketOptions } from '../use-websocket';
import { inpatientQueryKeys } from '../use-inpatient';
import { getWebSocketUrl } from './use-ward-websocket';
import type { SupervisorWebSocketMessage } from './types';

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

  // Use stable ref for custom handler to prevent dependency issues
  const customOnMessage = options.onMessage;

  const handleMessage = useCallback(
    (message: unknown) => {
      const wsMessage = message as SupervisorWebSocketMessage;

      if (process.env.NODE_ENV === 'development') {
        console.debug('[WebSocket] Supervisor alert:', wsMessage.type, wsMessage.data);
      }

      // Invalidate admission queries for the affected admission
      if (wsMessage.data?.admission_id) {
        queryClient.invalidateQueries({
          queryKey: inpatientQueryKeys.admission(wsMessage.data.admission_id),
        });
      }
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });

      // Call custom handler if provided
      if (customOnMessage) {
        customOnMessage(message as never);
      }
    },
    [queryClient, customOnMessage]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}
