'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

/**
 * Top progress bar that shows during route transitions (NProgress-style)
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Start loading when route changes
  const startLoading = useCallback(() => {
    setIsLoading(true);
    setProgress(0);
  }, []);

  // Complete loading
  const completeLoading = useCallback(() => {
    setProgress(100);
    setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
    }, 200);
  }, []);

  // Simulate progress
  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        // Slow down as we approach 90%
        const increment = Math.max(1, (90 - prev) / 10);
        return Math.min(90, prev + increment);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Track route changes
  useEffect(() => {
    startLoading();
    // Complete after a short delay to account for fast loads
    const timer = setTimeout(completeLoading, 300);
    return () => clearTimeout(timer);
  }, [pathname, searchParams, startLoading, completeLoading]);

  if (!isLoading && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-1 bg-transparent"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Page loading progress"
    >
      <div
        className={cn(
          'h-full bg-primary transition-all duration-200 ease-out',
          progress === 100 && 'opacity-0'
        )}
        style={{ width: `${progress}%` }}
      />
      {/* Glow effect */}
      <div
        className={cn(
          'absolute right-0 top-0 h-full w-24 bg-gradient-to-r from-transparent to-primary/50 blur-sm',
          progress === 100 && 'opacity-0'
        )}
        style={{ transform: `translateX(${progress < 100 ? '0' : '100%'})` }}
      />
    </div>
  );
}

export default RouteProgress;
