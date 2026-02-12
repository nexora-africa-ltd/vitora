/**
 * Inpatient WebSocket Hooks
 *
 * Module exports for ward compatibility updates and supervisor alerts.
 *
 * @example
 * ```tsx
 * import {
 *   useWardCompatibilityUpdates,
 *   useSupervisorAlerts,
 *   useWardCompatibilitySocket,
 *   useSupervisorAlertsSocket,
 * } from '@/lib/hooks/inpatient-websocket';
 * ```
 */

// Types
export type {
  WardCompatibilityEventType,
  SupervisorAlertEventType,
  WardWebSocketMessage,
  SupervisorWebSocketMessage,
  UseWardCompatibilityUpdatesOptions,
  UseSupervisorAlertsOptions,
  UseWardCompatibilityUpdatesReturn,
  UseSupervisorAlertsReturn,
} from './types';

// Low-level WebSocket hooks
export { useWardCompatibilitySocket, getWebSocketUrl } from './use-ward-websocket';
export { useSupervisorAlertsSocket } from './use-supervisor-websocket';

// High-level hybrid hooks (recommended)
export { useWardCompatibilityUpdates } from './use-ward-compatibility-updates';
export { useSupervisorAlerts } from './use-supervisor-alerts';
