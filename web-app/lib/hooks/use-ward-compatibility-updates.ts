/**
 * Ward Compatibility Updates Hook
 *
 * Re-exports from modular inpatient-websocket module for backwards compatibility.
 *
 * @deprecated Import directly from '@/lib/hooks/inpatient-websocket' instead.
 *
 * @example
 * ```tsx
 * // Preferred:
 * import { useWardCompatibilityUpdates } from '@/lib/hooks/inpatient-websocket';
 *
 * // Legacy (still works):
 * import { useWardCompatibilityUpdates } from '@/lib/hooks/use-ward-compatibility-updates';
 * ```
 */

// Re-export everything from the modular structure
export {
  // Types
  type WardCompatibilityEventType,
  type SupervisorAlertEventType,
  type WardWebSocketMessage,
  type SupervisorWebSocketMessage,
  type UseWardCompatibilityUpdatesOptions,
  type UseSupervisorAlertsOptions,
  type UseWardCompatibilityUpdatesReturn,
  type UseSupervisorAlertsReturn,
  // Low-level WebSocket hooks
  useWardCompatibilitySocket,
  useSupervisorAlertsSocket,
  getWebSocketUrl,
  // High-level hybrid hooks
  useWardCompatibilityUpdates,
  useSupervisorAlerts,
} from './inpatient-websocket';

