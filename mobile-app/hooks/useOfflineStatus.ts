/**
 * useOfflineStatus Hook
 *
 * React hook for monitoring network connectivity status.
 * Uses @react-native-community/netinfo for network detection.
 *
 * @example
 * const { isOffline, isConnected } = useOfflineStatus();
 */

import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface OfflineStatus {
  /** Whether the device is offline */
  isOffline: boolean;
  /** Whether the device is connected to a network */
  isConnected: boolean;
  /** Whether internet is reachable */
  isInternetReachable: boolean | null;
  /** Network connection type */
  connectionType: string | null;
  /** Manually refresh network status */
  refresh: () => Promise<void>;
}

/**
 * Hook for monitoring offline/online status
 *
 * @returns OfflineStatus object with connection state
 */
export function useOfflineStatus(): OfflineStatus {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(
    true
  );
  const [connectionType, setConnectionType] = useState<string | null>(null);

  const handleNetworkChange = useCallback((state: NetInfoState) => {
    setIsConnected(state.isConnected ?? false);
    setIsInternetReachable(state.isInternetReachable);
    setConnectionType(state.type);
  }, []);

  const refresh = useCallback(async () => {
    const state = await NetInfo.fetch();
    handleNetworkChange(state);
  }, [handleNetworkChange]);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(handleNetworkChange);

    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    return () => {
      unsubscribe();
    };
  }, [handleNetworkChange]);

  // Device is offline if not connected or internet is not reachable
  const isOffline = !isConnected || isInternetReachable === false;

  return {
    isOffline,
    isConnected,
    isInternetReachable,
    connectionType,
    refresh,
  };
}

export default useOfflineStatus;
