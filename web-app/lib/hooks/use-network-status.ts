import { useState, useEffect } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  /** True after first client-side render (safe to use for conditional UI) */
  isMounted: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  // Start with true to match server render and avoid hydration mismatch
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    wasOffline: false,
    isMounted: false,
  });

  useEffect(() => {
    // Sync with actual browser state after mount
    const actualOnlineState = navigator.onLine;
    setStatus({
      isOnline: actualOnlineState,
      wasOffline: !actualOnlineState,
      isMounted: true,
    });

    const handleOnline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: true,
        wasOffline: !prev.isOnline ? true : prev.wasOffline,
      }));
    };

    const handleOffline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
