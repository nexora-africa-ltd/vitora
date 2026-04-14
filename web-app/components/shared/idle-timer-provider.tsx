'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useIdleTimer } from '@/lib/hooks/use-idle-timer';
import { IdleWarningModal } from '@/components/shared/idle-warning-modal';

// Default timeout values (can be overridden)
const WARNING_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const LOGOUT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface IdleTimerProviderProps {
  children: React.ReactNode;
  /** Time in ms before showing warning (default: 15 minutes) */
  warningTimeout?: number;
  /** Time in ms before auto-logout (default: 30 minutes) */
  logoutTimeout?: number;
  /** Whether idle timer is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Provider component that wraps the app with idle timer functionality.
 *
 * Features:
 * - Tracks user activity across the app
 * - Shows warning modal at 15 minutes of inactivity
 * - Auto-logouts at 30 minutes of inactivity
 * - Syncs state across browser tabs via localStorage
 *
 * DHA Compliance: Frontend Auto-Logoff (P1)
 *
 * @example
 * ```tsx
 * // In dashboard layout
 * <IdleTimerProvider>
 *   {children}
 * </IdleTimerProvider>
 * ```
 */
export function IdleTimerProvider({
  children,
  warningTimeout = WARNING_TIMEOUT_MS,
  logoutTimeout = LOGOUT_TIMEOUT_MS,
  enabled = true,
}: IdleTimerProviderProps) {
  const router = useRouter();
  const { logout, isAuthenticated } = useAuth();

  // Handle auto-logout
  const handleLogout = useCallback(() => {
    logout();
    router.push('/login?reason=idle');
  }, [logout, router]);

  // Only enable timer when user is authenticated
  const timerEnabled = enabled && isAuthenticated;

  const { isWarning, secondsRemaining, resetTimer } = useIdleTimer({
    warningTimeout,
    logoutTimeout,
    onLogout: handleLogout,
    enabled: timerEnabled,
  });

  // Calculate total warning duration in seconds for progress bar
  const totalWarningSeconds = (logoutTimeout - warningTimeout) / 1000;

  return (
    <>
      {children}
      <IdleWarningModal
        isOpen={isWarning}
        secondsRemaining={secondsRemaining}
        totalWarningSeconds={totalWarningSeconds}
        onContinue={resetTimer}
        onLogout={handleLogout}
      />
    </>
  );
}
