/**
 * WebSocket Connection Status Indicator
 *
 * Displays real-time connection status for WebSocket connectivity.
 * Shows visual indicator and tooltip with connection details.
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
  getConnectionStatusColor,
} from '@/lib/hooks/use-websocket';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
}

const sizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const dotSizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

export function WebSocketStatus({
  connectionState,
  reconnectAttempts = 0,
  maxReconnectAttempts = 5,
  className,
  showLabel = false,
  size = 'md',
}: WebSocketStatusProps) {
  const statusColor = getConnectionStatusColor(connectionState);
  const statusText = getConnectionStatusText(connectionState);

  const colorClasses = {
    green: 'text-green-500 dark:text-green-400',
    yellow: 'text-yellow-500 dark:text-yellow-400',
    red: 'text-red-500 dark:text-red-400',
    gray: 'text-gray-400 dark:text-gray-500',
  };

  const dotColorClasses = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
  };

  const renderIcon = () => {
    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      return <Loader2 className={cn(sizeClasses[size], 'animate-spin', colorClasses[statusColor])} />;
    }

    if (connectionState === 'connected') {
      return <Wifi className={cn(sizeClasses[size], colorClasses[statusColor])} />;
    }

    return <WifiOff className={cn(sizeClasses[size], colorClasses[statusColor])} />;
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
            {/* Animated dot indicator */}
            <span className="relative flex">
              <span
                className={cn(
                  dotSizeClasses[size],
                  'rounded-full',
                  dotColorClasses[statusColor],
                  connectionState === 'connected' && 'animate-pulse'
                )}
              />
              {connectionState === 'connected' && (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                    dotColorClasses[statusColor]
                  )}
                  style={{ animationDuration: '2s' }}
                />
              )}
            </span>

            {/* Icon */}
            {renderIcon()}

            {/* Optional label */}
            {showLabel && (
              <span className={cn('text-xs', colorClasses[statusColor])}>
                {connectionState === 'connected' ? 'Live' : connectionState === 'reconnecting' ? 'Reconnecting...' : 'Offline'}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Minimal dot-only indicator for tight spaces
 */
export function WebSocketDot({
  connectionState,
  className,
}: {
  connectionState: WebSocketConnectionState;
  className?: string;
}) {
  const statusColor = getConnectionStatusColor(connectionState);

  const dotColorClasses = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
  };

  return (
    <span
      className={cn(
        'h-2 w-2 rounded-full',
        dotColorClasses[statusColor],
        connectionState === 'connected' && 'animate-pulse',
        className
      )}
      title={getConnectionStatusText(connectionState)}
    />
  );
}
