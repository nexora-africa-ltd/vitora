'use client';

import { useNetworkStatus } from '@/lib/hooks/use-network-status';

/**
 * Hook for components that need to gate individual action buttons/forms
 * behind internet connectivity.
 *
 * Returns `isInternetAvailable` (false after 10+ min offline) and a
 * tooltip message to show on disabled controls.
 *
 * Usage:
 *   const { isInternetAvailable, offlineTooltip } = useRequiresInternet();
 *   <Button disabled={!isInternetAvailable} title={offlineTooltip}>Submit to SHA</Button>
 */
export function useRequiresInternet() {
  const { isSustainedOffline, isOnline } = useNetworkStatus();

  return {
    /** True when the action can proceed (device is online or briefly offline). */
    isInternetAvailable: !isSustainedOffline,
    /** True when device is currently offline (any duration). */
    isOffline: !isOnline,
    /** True only after 10+ continuous minutes offline. */
    isSustainedOffline,
    /** Tooltip text to show on disabled controls. */
    offlineTooltip: isSustainedOffline
      ? 'This action requires internet. You have been offline for more than 10 minutes.'
      : undefined,
  };
}
