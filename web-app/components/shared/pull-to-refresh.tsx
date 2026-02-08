'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  /** Callback to trigger refresh */
  onRefresh: () => Promise<void> | void;
  /** Whether a refresh is currently in progress */
  isRefreshing?: boolean;
  /** Content to wrap */
  children: ReactNode;
  /** Pull distance threshold to trigger refresh (default: 80px) */
  threshold?: number;
  /** Custom refresh indicator */
  indicator?: ReactNode;
  /** Additional class names for the container */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * PullToRefresh - Mobile pull-down refresh gesture component
 *
 * Wraps content and provides pull-to-refresh functionality on touch devices.
 * Shows a visual indicator when pulled past threshold, with a glow effect
 * to prompt the user to release.
 *
 * Usage:
 * ```tsx
 * <PullToRefresh onRefresh={handleRefresh} isRefreshing={isLoading}>
 *   <YourContent />
 * </PullToRefresh>
 * ```
 */
export function PullToRefresh({
  onRefresh,
  isRefreshing = false,
  children,
  threshold = 80,
  indicator,
  className,
  disabled = false,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  // Calculate progress (0 to 1, can exceed 1 when past threshold)
  const progress = Math.min(pullDistance / threshold, 1.5);
  const isAtThreshold = pullDistance >= threshold;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return;

      // Only start if at the top of scroll
      const container = containerRef.current;
      if (!container || container.scrollTop > 0) return;

      const touch = e.touches[0];
      if (!touch) return;

      startY.current = touch.clientY;
      setIsPulling(true);
    },
    [disabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPulling || disabled || isRefreshing) return;

      const container = containerRef.current;
      if (!container || container.scrollTop > 0) {
        // User scrolled down, cancel pull
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      currentY.current = e.touches[0]?.clientY ?? 0;
      const distance = currentY.current - startY.current;

      if (distance > 0) {
        // Apply resistance curve for natural feel
        const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
        setPullDistance(resistedDistance);
        
        // Prevent default scroll when pulling
        e.preventDefault();
      }
    },
    [isPulling, disabled, isRefreshing, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;

    setIsPulling(false);

    if (pullDistance >= threshold && !isRefreshing && !disabled) {
      // Trigger refresh
      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull to refresh error:', error);
      }
    }

    // Reset pull distance
    setPullDistance(0);
  }, [isPulling, pullDistance, threshold, isRefreshing, disabled, onRefresh]);

  const handleTouchCancel = useCallback(() => {
    setIsPulling(false);
    setPullDistance(0);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-auto', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          'absolute left-0 right-0 flex items-center justify-center transition-all duration-200 pointer-events-none z-10',
          (isPulling || isRefreshing) ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          top: Math.max(pullDistance - 40, -40),
          height: 40,
        }}
      >
        {indicator || (
          <div
            className={cn(
              'flex items-center justify-center rounded-full p-2 transition-all duration-200',
              isAtThreshold || isRefreshing
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                : 'bg-muted text-muted-foreground'
            )}
            style={{
              transform: `scale(${0.5 + progress * 0.5}) rotate(${progress * 180}deg)`,
            }}
          >
            <RefreshCw
              className={cn(
                'h-5 w-5 transition-all',
                isRefreshing && 'animate-spin'
              )}
            />
          </div>
        )}
        
        {/* Prompt text */}
        {isAtThreshold && !isRefreshing && (
          <span className="absolute top-full mt-1 text-xs text-primary font-medium animate-pulse">
            Release to refresh
          </span>
        )}
      </div>

      {/* Content container with pull offset */}
      <div
        className="transition-transform duration-200 ease-out"
        style={{
          transform: isPulling || isRefreshing ? `translateY(${pullDistance}px)` : 'translateY(0)',
        }}
      >
        {children}
      </div>

      {/* Top glow effect when at threshold */}
      {isAtThreshold && !isRefreshing && (
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-b from-primary/50 to-transparent pointer-events-none animate-pulse"
          style={{
            transform: `translateY(${pullDistance}px)`,
          }}
        />
      )}
    </div>
  );
}

export default PullToRefresh;
