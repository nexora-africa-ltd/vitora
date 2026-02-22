/**
 * Surveillance WebSocket Hooks
 *
 * Real-time WebSocket connectivity for disease surveillance with polling fallback.
 */

export {
  useSurveillanceWebSocket,
  useSurveillanceConnectionStatus,
  surveillanceQueryKeys,
} from './use-surveillance-websocket';

export type {
  SurveillanceEventType,
  SurveillanceStatsData,
  SurveillanceNewCaseData,
  SurveillanceImmediateAlertData,
  SurveillanceOutbreakAlertData,
  SurveillanceOverdueAlertData,
  SurveillanceCaseNotifiedData,
  SurveillanceWebSocketMessage,
  SurveillanceMessage,
  UseSurveillanceWebSocketOptions,
  UseSurveillanceWebSocketReturn,
} from './types';
