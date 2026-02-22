/**
 * Shared types for surveillance WebSocket hooks
 *
 * Types for real-time surveillance alerts, stats updates, and outbreak notifications.
 */

import type { WebSocketConnectionState } from '../use-websocket';

// =============================================================================
// Surveillance WebSocket Event Types (from backend consumers.py)
// =============================================================================

/**
 * Surveillance WebSocket event types
 */
export type SurveillanceEventType =
  | 'surveillance.stats_update'
  | 'surveillance.new_case'
  | 'surveillance.immediate_alert'
  | 'surveillance.outbreak_alert'
  | 'surveillance.overdue_alert'
  | 'surveillance.case_notified';

// =============================================================================
// Event Data Types
// =============================================================================

/**
 * Stats update event data (periodic dashboard refresh)
 */
export interface SurveillanceStatsData {
  pending_immediate: number;
  overdue_notifications: number;
  cases_today: number;
  unacknowledged_alerts: number;
  timestamp: string;
}

/**
 * New case event data
 */
export interface SurveillanceNewCaseData {
  case_id: number;
  disease_name: string;
  patient_mrn: string;
  patient_name: string;
  category: 'IMMEDIATE' | 'WEEKLY' | string;
  detected_at: string;
}

/**
 * Immediate alert event data (urgent reportable disease)
 */
export interface SurveillanceImmediateAlertData {
  alert_id: number;
  case_id: number;
  disease_name: string;
  patient_mrn: string;
  message: string;
  created_at: string;
}

/**
 * Outbreak alert event data (threshold exceeded)
 */
export interface SurveillanceOutbreakAlertData {
  threshold_id: number;
  disease_name: string;
  county_name: string | null;
  threshold: number;
  current_count: number;
  exceeded_at: string;
}

/**
 * Overdue alert event data (notification deadline passed)
 */
export interface SurveillanceOverdueAlertData {
  case_id: number;
  disease_name: string;
  patient_mrn: string;
  deadline: string;
  hours_overdue: number;
}

/**
 * Case notified event data
 */
export interface SurveillanceCaseNotifiedData {
  case_id: number;
  disease_name: string;
  notified_by: string;
  notified_at: string;
}

// =============================================================================
// WebSocket Message Types
// =============================================================================

/**
 * Generic surveillance WebSocket message structure
 */
export interface SurveillanceWebSocketMessage<T = unknown> {
  type: SurveillanceEventType;
  data: T;
}

/**
 * Union of all possible surveillance WebSocket messages
 */
export type SurveillanceMessage =
  | SurveillanceWebSocketMessage<SurveillanceStatsData>
  | SurveillanceWebSocketMessage<SurveillanceNewCaseData>
  | SurveillanceWebSocketMessage<SurveillanceImmediateAlertData>
  | SurveillanceWebSocketMessage<SurveillanceOutbreakAlertData>
  | SurveillanceWebSocketMessage<SurveillanceOverdueAlertData>
  | SurveillanceWebSocketMessage<SurveillanceCaseNotifiedData>;

// =============================================================================
// Hook Options & Return Types
// =============================================================================

/**
 * Options for surveillance WebSocket hook
 */
export interface UseSurveillanceWebSocketOptions {
  /** Polling interval in ms when WebSocket unavailable (default: 30000 = 30s) */
  pollingInterval?: number;
  /** Whether to enable polling fallback (default: true) */
  enablePolling?: boolean;
  /** Whether to show toast notifications for alerts (default: true) */
  showToastNotifications?: boolean;
  /** Callback when stats are updated */
  onStatsUpdate?: (stats: SurveillanceStatsData) => void;
  /** Callback for new case alerts */
  onNewCase?: (data: SurveillanceNewCaseData) => void;
  /** Callback for immediate alerts */
  onImmediateAlert?: (data: SurveillanceImmediateAlertData) => void;
  /** Callback for outbreak alerts */
  onOutbreakAlert?: (data: SurveillanceOutbreakAlertData) => void;
  /** Callback on connection state change */
  onConnectionChange?: (state: WebSocketConnectionState) => void;
}

/**
 * Return type for surveillance WebSocket hook
 */
export interface UseSurveillanceWebSocketReturn {
  /** Current stats from WebSocket/polling */
  stats: SurveillanceStatsData | null;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Current connection state */
  connectionState: WebSocketConnectionState;
  /** Number of reconnect attempts */
  reconnectAttempts: number;
  /** Last time data was updated */
  lastUpdated: Date | null;
  /** Manual refresh function */
  refresh: () => void;
  /** Reconnect WebSocket */
  reconnect: () => void;
}
