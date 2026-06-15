import { useState, useEffect, useRef } from 'react';

/** Duration (ms) of continuous offline before `isSustainedOffline` activates. */
const SUSTAINED_OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  /** True after first client-side render (safe to use for conditional UI) */
  isMounted: boolean;
  /**
   * True when the device has been continuously offline for 10+ minutes.
   * Modules and actions that require internet should be hidden/disabled
   * when this is true. Resets immediately when connectivity returns.
   */
  isSustainedOffline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  // Start with true to match server render and avoid hydration mismatch
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    wasOffline: false,
    isMounted: false,
    isSustainedOffline: false,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sync with actual browser state after mount
    const actualOnlineState = navigator.onLine;

    const clearOfflineTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const startOfflineTimer = () => {
      clearOfflineTimer();
      timerRef.current = setTimeout(() => {
        setStatus((prev) => ({ ...prev, isSustainedOffline: true }));
      }, SUSTAINED_OFFLINE_THRESHOLD_MS);
    };

    // If already offline at mount, start the timer
    if (!actualOnlineState) {
      startOfflineTimer();
    }

    setStatus({
      isOnline: actualOnlineState,
      wasOffline: !actualOnlineState,
      isMounted: true,
      isSustainedOffline: false,
    });

    const handleOnline = () => {
      clearOfflineTimer();
      setStatus((prev) => ({
        ...prev,
        isOnline: true,
        isSustainedOffline: false,
        wasOffline: !prev.isOnline ? true : prev.wasOffline,
      }));
    };

    const handleOffline = () => {
      startOfflineTimer();
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearOfflineTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
