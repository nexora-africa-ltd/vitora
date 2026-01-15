/**
 * Navigation Progress Bar Component
 * Displays a progress bar under the header during page navigation/loading
 * Uses Next.js navigation events to show loading state
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

interface NavigationProgressProps {
  /** Color of the progress bar */
  color?: string;
  /** Height of the progress bar */
  height?: number;
  /** Minimum progress when loading starts */
  startPosition?: number;
  /** Delay before showing the progress bar (ms) */
  delay?: number;
  /** Animation duration for completion (ms) */
  completionDuration?: number;
}

export function NavigationProgress({
  color = 'teal-100',
  height = 4,
  startPosition = 0.08,
  delay = 100,
  completionDuration = 200,
}: NavigationProgressProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  
  const previousPathRef = useRef<string>('');
  const incrementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (incrementIntervalRef.current) {
      clearInterval(incrementIntervalRef.current);
      incrementIntervalRef.current = null;
    }
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  // Complete loading
  const complete = useCallback(() => {
    clearTimers();
    
    if (isVisible) {
      setProgress(1);
      
      // Hide after completion animation
      completionTimeoutRef.current = setTimeout(() => {
        setIsLoading(false);
        setIsVisible(false);
        setProgress(0);
      }, completionDuration);
    }
  }, [clearTimers, completionDuration, isVisible]);

  // Start loading
  const start = useCallback(() => {
    clearTimers();
    
    // Delay before showing
    delayTimeoutRef.current = setTimeout(() => {
      setIsLoading(true);
      setIsVisible(true);
      setProgress(startPosition);
      
      // Increment progress gradually
      incrementIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          // Slow down as we approach 90%
          if (prev >= 0.9) return prev;
          if (prev >= 0.7) return prev + 0.01;
          if (prev >= 0.5) return prev + 0.02;
          return prev + 0.05;
        });
      }, 200);
    }, delay);
  }, [clearTimers, delay, startPosition]);

  // Track route changes
  useEffect(() => {
    const currentPath = `${pathname}?${searchParams?.toString() || ''}`;
    
    if (previousPathRef.current && previousPathRef.current !== currentPath) {
      // Route changed - complete the loading
      complete();
    }
    
    previousPathRef.current = currentPath;
    
    return () => clearTimers();
  }, [pathname, searchParams, complete, clearTimers]);

  // Listen to navigation events via click interception
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      if (!anchor) return;
      
      const href = anchor.getAttribute('href');
      if (!href) return;
      
      // Check if it's an internal navigation
      const isInternal = href.startsWith('/') || href.startsWith(window.location.origin);
      const isSamePageAnchor = href.startsWith('#');
      const isNewTab = anchor.target === '_blank';
      const isDownload = anchor.hasAttribute('download');
      
      if (isInternal && !isSamePageAnchor && !isNewTab && !isDownload) {
        const currentPath = `${pathname}?${searchParams?.toString() || ''}`;
        const targetUrl = new URL(href, window.location.origin);
        const targetPath = `${targetUrl.pathname}?${targetUrl.searchParams.toString()}`;
        
        // Only start loading if navigating to a different page
        if (currentPath !== targetPath) {
          start();
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname, searchParams, start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  if (!isVisible) return null;

  const progressValue = Math.round(progress * 100);

  return (
    <div
      role="progressbar"
      aria-label="Page loading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progressValue}
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] pointer-events-none',
        'transition-opacity duration-200',
        isLoading ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* Progress bar */}
      <div
        className={cn(
          'transition-all duration-200 ease-out bg-teal-100',
          progressValue === 100 && 'opacity-0'
        )}
        style={{
          height: `${height}px`,
          width: `${progressValue}%`,
        }}
      />
      {/* Glow effect */}
      <div
        className={cn(
          'absolute right-0 top-0 w-24 bg-gradient-to-r from-transparent to-teal-100/50 blur-sm',
          progressValue === 100 && 'opacity-0'
        )}
        style={{
          height: `${height}px`,
          transform: `translateX(${progressValue < 100 ? '0' : '100%'})`,
        }}
      />
    </div>
  );
}

export default NavigationProgress;
