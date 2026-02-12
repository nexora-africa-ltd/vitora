/**
 * Ward WebSocket Hook
 *
 * Low-level WebSocket hook for ward-specific compatibility updates.
 * Used internally by useWardCompatibilityUpdates hybrid hook.
 */
'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket, UseWebSocketOptions } from '../use-websocket';
import { inpatientQueryKeys } from '../use-inpatient';
import type { WardWebSocketMessage } from './types';

// =============================================================================
// Utility
// =============================================================================

/**
 * Get the WebSocket URL based on current environment
 */
export function getWebSocketUrl(path: string): string {
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
// Ward WebSocket Hook
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

  // Use stable ref for custom handler to prevent dependency issues
  const customOnMessage = options.onMessage;

  const handleMessage = useCallback(
    (message: unknown) => {
      if (!wardId) return;

      const wsMessage = message as WardWebSocketMessage;

      if (process.env.NODE_ENV === 'development') {
        console.debug(`[WebSocket] Ward ${wardId} event:`, wsMessage.type, wsMessage.data);
      }

      // Invalidate ward-specific queries
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.ward(wardId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wardBeds(wardId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });

      // Also invalidate admissions if it's a violation event
      if (wsMessage.type === 'compatibility_violation') {
        queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });
      }

      // Call custom handler if provided
      if (customOnMessage) {
        customOnMessage(message as never);
      }
    },
    [wardId, queryClient, customOnMessage]
  );

  return useWebSocket(url, {
    ...options,
    onMessage: handleMessage,
  });
}
