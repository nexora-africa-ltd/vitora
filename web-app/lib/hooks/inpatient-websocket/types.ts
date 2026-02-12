/**
 * Shared types for inpatient WebSocket hooks
 *
 * Types for ward compatibility updates and supervisor alerts WebSocket/polling.
 */

import type { WebSocketConnectionState } from '../use-websocket';
import type {
  WardUpdateEvent,
  WardCurrentState,
  SupervisorAlert,
} from '@/lib/types/inpatient';

// =============================================================================
// Ward WebSocket Message Types
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

// =============================================================================
// Hook Options
// =============================================================================

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

// =============================================================================
// Hook Return Types
// =============================================================================

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
