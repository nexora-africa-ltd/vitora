/**
 * Navigation Progress Bar Component
 * Displays a pulsing gradient bar at the top of the page during navigation
 * Uses Next.js navigation events to show loading state
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

interface NavigationProgressProps {
  /** Height of the progress bar */
  height?: number;
  /** Delay before showing the progress bar (ms) */
  delay?: number;
  /** Animation duration for fade-out on completion (ms) */
  completionDuration?: number;
}

export function NavigationProgress({
  height = 3,
  delay = 100,
  completionDuration = 300,
}: NavigationProgressProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const previousPathRef = useRef<string>('');
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = useCallback(() => {
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  const complete = useCallback(() => {
    clearTimers();
    setIsLoading(false);

    // Fade out then hide
    completionTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, completionDuration);
  }, [clearTimers, completionDuration]);

  const start = useCallback(() => {
    clearTimers();

    delayTimeoutRef.current = setTimeout(() => {
      setIsLoading(true);
      setIsVisible(true);
    }, delay);
  }, [clearTimers, delay]);

  // Track route changes
  useEffect(() => {
    const currentPath = `${pathname}?${searchParams?.toString() || ''}`;

    if (previousPathRef.current && previousPathRef.current !== currentPath) {
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

      const isInternal = href.startsWith('/') || href.startsWith(window.location.origin);
      const isSamePageAnchor = href.startsWith('#');
      const isNewTab = anchor.target === '_blank';
      const isDownload = anchor.hasAttribute('download');

      if (isInternal && !isSamePageAnchor && !isNewTab && !isDownload) {
        const currentPath = `${pathname}?${searchParams?.toString() || ''}`;
        const targetUrl = new URL(href, window.location.origin);
        const targetPath = `${targetUrl.pathname}?${targetUrl.searchParams.toString()}`;

        if (currentPath !== targetPath) {
          start();
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname, searchParams, start]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  if (!isVisible) return null;

  return (
    <>
      {/* Top bar */}
      <div
        role="progressbar"
        aria-label="Page loading"
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'fixed top-0 left-0 right-0 z-[100] pointer-events-none',
          'transition-opacity duration-300',
          isLoading ? 'opacity-100' : 'opacity-0'
        )}
        style={{ height: `${height}px` }}
      >
        <div
          className="h-full w-full animate-pulse-gradient"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(236,72,153,0.7) 25%, rgba(45,212,191,0.9) 50%, rgba(236,72,153,0.7) 75%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
      {/* Right bar */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed top-0 right-0 bottom-0 z-[100] pointer-events-none',
          'transition-opacity duration-300',
          isLoading ? 'opacity-100' : 'opacity-0'
        )}
        style={{ width: `${height}px` }}
      >
        <div
          className="h-full w-full animate-pulse-gradient-vertical"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(45,212,191,0.7) 25%, rgba(236,72,153,0.9) 50%, rgba(45,212,191,0.7) 75%, transparent 100%)',
            backgroundSize: '100% 200%',
          }}
        />
      </div>
      {/* Bottom bar */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed bottom-0 left-0 right-0 z-[100] pointer-events-none',
          'transition-opacity duration-300',
          isLoading ? 'opacity-100' : 'opacity-0'
        )}
        style={{ height: `${height}px` }}
      >
        <div
          className="h-full w-full animate-pulse-gradient"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(45,212,191,0.7) 25%, rgba(236,72,153,0.9) 50%, rgba(45,212,191,0.7) 75%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
      {/* Left bar */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed top-0 left-0 bottom-0 z-[100] pointer-events-none',
          'transition-opacity duration-300',
          isLoading ? 'opacity-100' : 'opacity-0'
        )}
        style={{ width: `${height}px` }}
      >
        <div
          className="h-full w-full animate-pulse-gradient-vertical"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(236,72,153,0.7) 25%, rgba(45,212,191,0.9) 50%, rgba(236,72,153,0.7) 75%, transparent 100%)',
            backgroundSize: '100% 200%',
          }}
        />
      </div>
    </>
  );
}

export default NavigationProgress;
