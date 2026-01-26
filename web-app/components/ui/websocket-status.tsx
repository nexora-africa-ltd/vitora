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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import StatusIndicator from '@/components/ui/status-indicator';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
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
  /** Whether to show the WiFi icon */
  showIcon?: boolean;
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

const iconSizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const iconColorClasses = {
  active: 'text-green-500 dark:text-green-400',
  fixing: 'text-yellow-500 dark:text-yellow-400',
  down: 'text-red-500 dark:text-red-400',
  idle: 'text-gray-400 dark:text-gray-500',
};

export function WebSocketStatus({
  connectionState,
  reconnectAttempts = 0,
  maxReconnectAttempts = 5,
  className,
  showLabel = false,
  size = 'md',
  showIcon = true,
}: WebSocketStatusProps) {
  const statusText = getConnectionStatusText(connectionState);
  const indicatorState = mapConnectionState(connectionState);

  const renderIcon = () => {
    if (!showIcon) return null;

    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      return (
        <Loader2
          className={cn(
            iconSizeClasses[size],
            'animate-spin',
            iconColorClasses[indicatorState]
          )}
        />
      );
    }

    if (connectionState === 'connected') {
      return (
        <Wifi className={cn(iconSizeClasses[size], iconColorClasses[indicatorState])} />
      );
    }

    return (
      <WifiOff className={cn(iconSizeClasses[size], iconColorClasses[indicatorState])} />
    );
  };

  const getLabel = () => {
    switch (connectionState) {
      case 'connected':
        return 'Live';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'connecting':
        return 'Connecting...';
      default:
        return 'Offline';
    }
  };

  const tooltipContent = (
    <div className="text-xs">
      <div className="font-medium">{statusText}</div>
      {connectionState === 'reconnecting' && (
        <div className="text-muted-foreground mt-1">
          Attempt {reconnectAttempts}/{maxReconnectAttempts}
        </div>
      )}
      {(connectionState === 'disconnected' || connectionState === 'error') && (
        <div className="text-muted-foreground mt-1">
          Using polling fallback (updates every 15-30s)
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1.5', className)}>
            {/* Use StatusIndicator for the dot */}
            <StatusIndicator state={indicatorState} size={size} />

            {/* Icon */}
            {renderIcon()}

            {/* Optional label */}
            {showLabel && (
              <span className={cn('text-xs', iconColorClasses[indicatorState])}>
                {getLabel()}
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
