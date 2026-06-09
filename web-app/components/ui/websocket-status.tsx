/**
 * WebSocket Connection Status Indicator
 *
 * Displays real-time connection status for WebSocket connectivity.
 * Shows visual indicator and tooltip with connection details.
 * Reuses StatusIndicator for consistent styling across the app.
 *
 * Usage:
 * ```tsx
 * <WebSocketStatus
 *   connectionState="connected"
 *   reconnectAttempts={0}
 * />
 * ```
 */
'use client';

import React from 'react';
import {
  type WebSocketConnectionState,
  getConnectionStatusText,
} from '@/lib/hooks/use-websocket';
import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import StatusIndicator from '@/components/ui/status-indicator';
import { cn } from '@/lib/utils';

export interface WebSocketStatusProps {
  /** Current connection state */
  connectionState: WebSocketConnectionState;
  /** Number of reconnect attempts (shown when reconnecting) */
  reconnectAttempts?: number;
  /** Maximum reconnect attempts (for progress indication) */
  maxReconnectAttempts?: number;
  /** Additional class names */
  className?: string;
  /** Whether to show text label */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Last update timestamp for "Live · Xs ago" display */
  lastUpdate?: Date | null;
}

/**
 * Map WebSocket connection state to StatusIndicator state
 */
function mapConnectionState(
  connectionState: WebSocketConnectionState
): 'active' | 'down' | 'fixing' | 'idle' {
  switch (connectionState) {
    case 'connected':
      return 'active';
    case 'connecting':
    case 'reconnecting':
      return 'fixing';
    case 'error':
      return 'down';
    case 'disconnected':
    default:
      return 'idle';
  }
}

const labelColorClasses = {
  active: 'text-green-600 dark:text-green-400',
  fixing: 'text-yellow-600 dark:text-yellow-400',
  down: 'text-red-600 dark:text-red-400',
  idle: 'text-gray-500 dark:text-gray-400',
};

/**
 * Format lastUpdate as relative time ("just now", "5s ago", "2m ago")
 */
function formatLastUpdate(lastUpdate: Date | null | undefined): string | null {
  if (!lastUpdate) return null;
  const now = new Date();
  const diff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export function WebSocketStatus({
  connectionState,
  reconnectAttempts = 0,
  maxReconnectAttempts = 5,
  className,
  showLabel = false,
  size = 'md',
  lastUpdate,
}: WebSocketStatusProps) {
  const { isOnline } = useNetworkStatus();
  const statusText = getConnectionStatusText(connectionState);
  const lastUpdateText = formatLastUpdate(lastUpdate);

  // Determine effective state: network offline overrides everything
  const effectiveState = !isOnline ? 'offline' : connectionState;

  const indicatorState = !isOnline
    ? 'down' as const
    : mapConnectionState(connectionState);

  const getLabel = () => {
    if (!isOnline) return 'Offline';
    switch (connectionState) {
      case 'connected':
        return 'Live';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
      case 'error':
        return 'Polling';
      default:
        return 'Polling';
    }
  };

  const tooltipContent = (
    <div className="text-xs">
      <div className="font-medium">
        {!isOnline ? 'Backend unreachable' : statusText}
      </div>
      {isOnline && connectionState === 'reconnecting' && (
        <div className="text-muted-foreground mt-1">
          Attempt {reconnectAttempts}/{maxReconnectAttempts}
        </div>
      )}
      {!isOnline && (
        <div className="text-muted-foreground mt-1">
          Cannot reach the server. Data may be stale.
        </div>
      )}
      {isOnline && (connectionState === 'disconnected' || connectionState === 'error') && (
        <div className="text-muted-foreground mt-1">
          WebSocket unavailable — using HTTP polling (updates every 15-30s)
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1.5', className)}>
            {/* StatusIndicator dot */}
            <StatusIndicator state={indicatorState} size={size} />

            {/* Optional label with timestamp */}
            {showLabel && (
              <span className={cn('text-xs font-medium', labelColorClasses[indicatorState])}>
                {getLabel()}
                {connectionState === 'connected' && lastUpdateText && (
                  <span className="text-muted-foreground font-normal ml-1">
                    · {lastUpdateText}
                  </span>
                )}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Minimal dot-only indicator for tight spaces
 * Uses StatusIndicator internally
 */
export function WebSocketDot({
  connectionState,
  className,
  size = 'sm',
}: {
  connectionState: WebSocketConnectionState;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const indicatorState = mapConnectionState(connectionState);
  const statusText = getConnectionStatusText(connectionState);

  return (
    <div title={statusText} className={className}>
      <StatusIndicator state={indicatorState} size={size} />
    </div>
  );
}

/**
 * Export the state mapper for external use
 */
export { mapConnectionState };
