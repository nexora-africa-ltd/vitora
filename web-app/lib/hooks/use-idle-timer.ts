'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Storage key for cross-tab sync
const LAST_ACTIVITY_KEY = 'vitora_last_activity';
const IDLE_WARNING_DISMISSED_KEY = 'vitora_idle_warning_dismissed';

// Default timeout values in milliseconds
const DEFAULT_WARNING_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const DEFAULT_LOGOUT_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_THROTTLE = 1000; // Throttle activity tracking to 1 second

export interface IdleTimerConfig {
  /** Time in ms before showing warning (default: 15 minutes) */
  warningTimeout?: number;
  /** Time in ms before auto-logout (default: 30 minutes) */
  logoutTimeout?: number;
  /** Called when auto-logout occurs */
  onLogout?: () => void;
  /** Called when warning should be shown */
  onWarning?: () => void;
  /** Whether the timer is enabled (default: true) */
  enabled?: boolean;
}

export interface IdleTimerState {
  /** Whether the warning modal should be shown */
  isWarning: boolean;
  /** Seconds remaining before auto-logout (when in warning state) */
  secondsRemaining: number;
  /** Reset the idle timer (e.g., when user clicks "Stay Logged In") */
  resetTimer: () => void;
  /** Whether the user is considered idle (past warning threshold) */
  isIdle: boolean;
}

/**
 * Hook for tracking user idle time with warning and auto-logout functionality.
 * 
 * Features:
 * - Tracks mouse, keyboard, touch, scroll, and click events
 * - Shows warning at configurable threshold (default: 15 minutes)
 * - Auto-logouts at configurable threshold (default: 30 minutes)
 * - Syncs across tabs via localStorage
 * - Countdown timer in warning state
 * 
 * @example
 * ```tsx
 * const { isWarning, secondsRemaining, resetTimer } = useIdleTimer({
 *   onLogout: () => auth.logout(),
 *   onWarning: () => console.log('User idle warning'),
 * });
 * ```
 */
export function useIdleTimer({
  warningTimeout = DEFAULT_WARNING_TIMEOUT,
  logoutTimeout = DEFAULT_LOGOUT_TIMEOUT,
  onLogout,
  onWarning,
  enabled = true,
}: IdleTimerConfig = {}): IdleTimerState {
  const [isWarning, setIsWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isIdle, setIsIdle] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const throttleRef = useRef<number>(0);

  // Calculate time until logout from warning
  const warningToLogoutDuration = logoutTimeout - warningTimeout;

  // Get last activity from localStorage (cross-tab sync)
  const getStoredLastActivity = useCallback((): number => {
    if (typeof window === 'undefined') return Date.now();
    const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
    return stored ? parseInt(stored, 10) : Date.now();
  }, []);

  // Store last activity in localStorage
  const storeLastActivity = useCallback((timestamp: number) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LAST_ACTIVITY_KEY, timestamp.toString());
  }, []);

  // Clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (logoutTimeoutRef.current) {
      clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Track when auto-logout should fire (wall-clock timestamp)
  const logoutAtRef = useRef<number>(0);

  // Start countdown timer using wall-clock time so it stays accurate
  // even when the browser tab is backgrounded / throttled
  const startCountdown = useCallback(() => {
    logoutAtRef.current = Date.now() + warningToLogoutDuration;
    setSecondsRemaining(Math.ceil(warningToLogoutDuration / 1000));

    countdownIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((logoutAtRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0 && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }, 1000);
  }, [warningToLogoutDuration]);

  // Handle entering warning state
  const enterWarningState = useCallback(() => {
    setIsWarning(true);
    setIsIdle(true);
    onWarning?.();
    startCountdown();

    // Set logout timeout
    logoutTimeoutRef.current = setTimeout(() => {
      setIsWarning(false);
      setSecondsRemaining(0);
      onLogout?.();
    }, warningToLogoutDuration);
  }, [onWarning, onLogout, startCountdown, warningToLogoutDuration]);

  // Reset timer to initial state
  const resetTimer = useCallback(() => {
    clearAllTimeouts();
    setIsWarning(false);
    setIsIdle(false);
    setSecondsRemaining(0);

    const now = Date.now();
    lastActivityRef.current = now;
    storeLastActivity(now);

    // Mark warning as dismissed (for cross-tab sync)
    localStorage.setItem(IDLE_WARNING_DISMISSED_KEY, now.toString());

    if (!enabled) return;

    // Start new warning timeout
    warningTimeoutRef.current = setTimeout(() => {
      enterWarningState();
    }, warningTimeout);
  }, [clearAllTimeouts, storeLastActivity, enabled, warningTimeout, enterWarningState]);

  // Handle user activity
  const handleActivity = useCallback(() => {
    if (!enabled) return;

    // Throttle activity handling
    const now = Date.now();
    if (now - throttleRef.current < ACTIVITY_THROTTLE) return;
    throttleRef.current = now;

    // Don't reset on activity if in warning state (user must explicitly dismiss)
    if (isWarning) return;

    lastActivityRef.current = now;
    storeLastActivity(now);

    // Reset warning timeout
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    warningTimeoutRef.current = setTimeout(() => {
      enterWarningState();
    }, warningTimeout);
  }, [enabled, isWarning, storeLastActivity, warningTimeout, enterWarningState]);

  // Handle storage events (cross-tab sync)
  const handleStorageChange = useCallback(
    (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
        const newActivityTime = parseInt(event.newValue, 10);
        const timeSinceActivity = Date.now() - newActivityTime;

        // If another tab has recent activity, reset our timer
        if (timeSinceActivity < warningTimeout) {
          lastActivityRef.current = newActivityTime;

          // If we're showing warning but another tab had activity, don't auto-dismiss
          // User must explicitly dismiss in this tab
          if (!isWarning) {
            clearAllTimeouts();
            warningTimeoutRef.current = setTimeout(() => {
              enterWarningState();
            }, warningTimeout - timeSinceActivity);
          }
        }
      }

      // Handle warning dismissal from another tab
      if (event.key === IDLE_WARNING_DISMISSED_KEY && event.newValue) {
        const dismissTime = parseInt(event.newValue, 10);
        const timeSinceDismiss = Date.now() - dismissTime;

        // If dismissed recently in another tab, reset this tab too
        if (timeSinceDismiss < 5000) {
          clearAllTimeouts();
          setIsWarning(false);
          setIsIdle(false);
          setSecondsRemaining(0);
          lastActivityRef.current = dismissTime;

          warningTimeoutRef.current = setTimeout(() => {
            enterWarningState();
          }, warningTimeout);
        }
      }
    },
    [warningTimeout, isWarning, clearAllTimeouts, enterWarningState]
  );

  // Initialize and setup event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) {
      clearAllTimeouts();
      setIsWarning(false);
      setIsIdle(false);
      return;
    }

    // Check stored activity on mount
    const storedActivity = getStoredLastActivity();
    const timeSinceActivity = Date.now() - storedActivity;

    if (timeSinceActivity >= logoutTimeout) {
      // Already past logout threshold - logout immediately
      onLogout?.();
    } else if (timeSinceActivity >= warningTimeout) {
      // In warning period - show warning with remaining time
      const remainingTime = logoutTimeout - timeSinceActivity;
      logoutAtRef.current = Date.now() + remainingTime;
      setIsWarning(true);
      setIsIdle(true);
      setSecondsRemaining(Math.ceil(remainingTime / 1000));
      onWarning?.();

      countdownIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((logoutAtRef.current - Date.now()) / 1000));
        setSecondsRemaining(remaining);
        if (remaining <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      }, 1000);

      logoutTimeoutRef.current = setTimeout(() => {
        setIsWarning(false);
        onLogout?.();
      }, remainingTime);
    } else {
      // Not yet in warning period - set warning timeout
      lastActivityRef.current = storedActivity;
      warningTimeoutRef.current = setTimeout(() => {
        enterWarningState();
      }, warningTimeout - timeSinceActivity);
    }

    // Setup activity event listeners
    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Setup storage listener for cross-tab sync
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearAllTimeouts();
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [
    enabled,
    warningTimeout,
    logoutTimeout,
    onLogout,
    onWarning,
    getStoredLastActivity,
    handleActivity,
    handleStorageChange,
    clearAllTimeouts,
    enterWarningState,
  ]);

  return {
    isWarning,
    secondsRemaining,
    resetTimer,
    isIdle,
  };
}

/**
 * Format seconds into MM:SS display
 */
export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
