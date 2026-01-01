'use client';

import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-center text-sm font-medium transition-all',
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-amber-500 text-amber-950'
      )}
    >
      {isOnline ? (
        <span className="flex items-center justify-center gap-2">
          <Wifi className="h-4 w-4" />
          Back online
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          You're offline. Some features may be unavailable.
        </span>
      )}
    </div>
  );
}
