/**
 * Surveillance WebSocket Hook
 *
 * Hybrid WebSocket + polling hook for disease surveillance real-time updates.
 *
 * Architecture (from .github/copilot-instructions.md):
 * - Primary: WebSocket for real-time alerts and stats (sub-second latency)
 * - Fallback: React Query polling when WebSocket unavailable (30s interval)
 * - Events: stats_update, new_case, immediate_alert, outbreak_alert, overdue_alert
 *
 * Usage:
 * ```tsx
 * function SurveillanceDashboard() {
 *   const { stats, isConnected, connectionState } = useSurveillanceWebSocket({
 *     showToastNotifications: true,
 *   });
 *   // Stats are updated in real-time via WebSocket, with polling fallback
 * }
 * ```
 */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket, type UseWebSocketOptions } from '../use-websocket';
import { getWebSocketUrl } from '../inpatient-websocket/use-ward-websocket';
import { toast } from '../use-toast';
import type {
  SurveillanceEventType,
  SurveillanceStatsData,
  SurveillanceNewCaseData,
  SurveillanceImmediateAlertData,
  SurveillanceOutbreakAlertData,
  SurveillanceWebSocketMessage,
  UseSurveillanceWebSocketOptions,
  UseSurveillanceWebSocketReturn,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/** WebSocket endpoint for surveillance alerts */
const SURVEILLANCE_WS_PATH = '/ws/surveillance/alerts/';

/** Default polling interval in ms */
const DEFAULT_POLLING_INTERVAL = 30000;

/** Query keys for surveillance data */
export const surveillanceQueryKeys = {
  all: ['surveillance'] as const,
  dashboard: () => [...surveillanceQueryKeys.all, 'dashboard'] as const,
  alerts: () => [...surveillanceQueryKeys.all, 'alerts'] as const,
  alertsUnacknowledged: () => [...surveillanceQueryKeys.alerts(), 'unacknowledged'] as const,
  thresholds: () => [...surveillanceQueryKeys.all, 'thresholds'] as const,
  thresholdsExceeded: () => [...surveillanceQueryKeys.thresholds(), 'exceeded'] as const,
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Surveillance WebSocket hook with polling fallback.
 *
 * Connects to `/ws/surveillance/alerts/` for real-time updates.
 * Falls back to polling when WebSocket is unavailable.
 */
export function useSurveillanceWebSocket(
  options: UseSurveillanceWebSocketOptions = {}
): UseSurveillanceWebSocketReturn {
  const {
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    enablePolling = true,
    showToastNotifications = true,
    onStatsUpdate,
    onNewCase,
    onImmediateAlert,
    onOutbreakAlert,
    onConnectionChange,
  } = options;

  const queryClient = useQueryClient();
  const [stats, setStats] = useState<SurveillanceStatsData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Stable refs for callbacks
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const onNewCaseRef = useRef(onNewCase);
  const onImmediateAlertRef = useRef(onImmediateAlert);
  const onOutbreakAlertRef = useRef(onOutbreakAlert);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
    onNewCaseRef.current = onNewCase;
    onImmediateAlertRef.current = onImmediateAlert;
    onOutbreakAlertRef.current = onOutbreakAlert;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onStatsUpdate, onNewCase, onImmediateAlert, onOutbreakAlert, onConnectionChange]);

  // Build WebSocket URL
  const wsUrl = getWebSocketUrl(SURVEILLANCE_WS_PATH);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (message: unknown) => {
      const wsMessage = message as SurveillanceWebSocketMessage;
      const eventType = wsMessage.type as SurveillanceEventType;

      if (process.env.NODE_ENV === 'development') {
        console.debug('[Surveillance WS] Event:', eventType, wsMessage.data);
      }

      setLastUpdated(new Date());

      switch (eventType) {
        case 'surveillance.stats_update': {
          const statsData = wsMessage.data as SurveillanceStatsData;
          setStats(statsData);
          onStatsUpdateRef.current?.(statsData);
          // Invalidate dashboard query to sync UI
          queryClient.invalidateQueries({ queryKey: ['surveillance-dashboard'] });
          break;
        }

        case 'surveillance.new_case': {
          const caseData = wsMessage.data as SurveillanceNewCaseData;
          onNewCaseRef.current?.(caseData);
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['surveillance-dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['surveillance-cases'] });

          if (showToastNotifications) {
            toast({
              title: 'New Notifiable Case',
              description: `${caseData.disease_name} - ${caseData.patient_mrn}`,
            });
          }
          break;
        }

        case 'surveillance.immediate_alert': {
          const alertData = wsMessage.data as SurveillanceImmediateAlertData;
          onImmediateAlertRef.current?.(alertData);
          // Invalidate alerts queries
          queryClient.invalidateQueries({ queryKey: ['surveillance-dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['surveillance-alerts'] });
          queryClient.invalidateQueries({ queryKey: ['surveillance-alerts-unacknowledged'] });

          if (showToastNotifications) {
            toast({
              title: '⚠️ Immediate Alert',
              description: `${alertData.disease_name}: ${alertData.message}`,
              variant: 'destructive',
            });
          }
          break;
        }

        case 'surveillance.outbreak_alert': {
          const outbreakData = wsMessage.data as SurveillanceOutbreakAlertData;
          onOutbreakAlertRef.current?.(outbreakData);
          // Invalidate threshold queries
          queryClient.invalidateQueries({ queryKey: ['surveillance-dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['surveillance-alerts'] });
          queryClient.invalidateQueries({ queryKey: ['outbreak-thresholds'] });
          queryClient.invalidateQueries({ queryKey: ['outbreak-thresholds-exceeded'] });

          if (showToastNotifications) {
            toast({
              title: '🚨 Outbreak Alert',
              description: `${outbreakData.disease_name}: ${outbreakData.current_count} cases (threshold: ${outbreakData.threshold})`,
              variant: 'destructive',
            });
          }
          break;
        }

        case 'surveillance.overdue_alert': {
          // Invalidate dashboard to show updated overdue count
          queryClient.invalidateQueries({ queryKey: ['surveillance-dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['surveillance-alerts'] });
          break;
        }

        case 'surveillance.case_notified': {
          // Invalidate case queries
          queryClient.invalidateQueries({ queryKey: ['surveillance-cases'] });
          queryClient.invalidateQueries({ queryKey: ['surveillance-dashboard'] });
          break;
        }
      }
    },
    [queryClient, showToastNotifications]
  );

  // WebSocket connection
  const {
    isConnected,
    connectionState,
    reconnectAttempts,
    reconnect,
    send,
  } = useWebSocket(wsUrl, {
    onMessage: handleMessage,
    onConnect: () => {
      onConnectionChangeRef.current?.('connected');
      // Request initial stats on connect
      send({ type: 'refresh' });
    },
    onDisconnect: () => onConnectionChangeRef.current?.('disconnected'),
  } as UseWebSocketOptions);

  // Notify on connection state changes
  useEffect(() => {
    onConnectionChangeRef.current?.(connectionState);
  }, [connectionState]);

  // Polling fallback (only when WebSocket disconnected and polling enabled)
  const shouldPoll = enablePolling && !isConnected;

  // Import the API dynamically to avoid circular dependencies
  const { data: pollingData } = useQuery({
    queryKey: ['surveillance-dashboard'],
    queryFn: async () => {
      // Lazy import to avoid circular dependency
      const { surveillanceApi } = await import('@/lib/api/surveillance');
      return surveillanceApi.getDashboard();
    },
    enabled: shouldPoll,
    refetchInterval: shouldPoll ? pollingInterval : false,
    staleTime: pollingInterval / 2,
  });

  // Process polling data to match WebSocket stats format
  useEffect(() => {
    if (pollingData && !isConnected) {
      const statsFromPolling: SurveillanceStatsData = {
        pending_immediate: pollingData.immediate_cases_pending,
        overdue_notifications: pollingData.overdue_notifications,
        cases_today: pollingData.cases_today,
        unacknowledged_alerts: pollingData.outbreak_alerts, // Approximate mapping
        timestamp: new Date().toISOString(),
      };
      setStats(statsFromPolling);
      setLastUpdated(new Date());
      onStatsUpdateRef.current?.(statsFromPolling);
    }
  }, [pollingData, isConnected]);

  // Manual refresh function
  const refresh = useCallback(() => {
    if (isConnected) {
      // Request refresh via WebSocket
      send({ type: 'refresh' });
    } else {
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['surveillance-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['surveillance-alerts-unacknowledged'] });
    }
  }, [isConnected, send, queryClient]);

  return {
    stats,
    isConnected,
    connectionState,
    reconnectAttempts,
    lastUpdated,
    refresh,
    reconnect,
  };
}

/**
 * Lightweight hook that only provides connection status.
 * Use when you just need to show the WebSocket status indicator.
 */
export function useSurveillanceConnectionStatus() {
  const { isConnected, connectionState, reconnectAttempts } = useSurveillanceWebSocket({
    enablePolling: false,
    showToastNotifications: false,
  });

  return { isConnected, connectionState, reconnectAttempts };
}
