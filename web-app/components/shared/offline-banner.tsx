'use client';

import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import { useSyncStatus } from '@/lib/context/sync-context';
import { WifiOff, Wifi, CloudUpload, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const { pendingChanges, lastError, isSyncing } = useSyncStatus();

  const showOffline = !isOnline;
  const showBackOnline = isOnline && wasOffline && pendingChanges === 0;
  const showPending = isOnline && pendingChanges > 0;
  const showError = isOnline && !!lastError && pendingChanges === 0;

  if (!showOffline && !showBackOnline && !showPending && !showError) return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-center text-sm font-medium transition-all',
        showOffline && 'bg-amber-500 text-amber-950',
        showBackOnline && 'bg-green-500 text-white',
        showPending && 'bg-blue-500 text-white',
        showError && 'bg-destructive text-destructive-foreground'
      )}
    >
      {showOffline && (
        <span className="flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          You&apos;re offline.{pendingChanges > 0
            ? ` ${pendingChanges} change${pendingChanges !== 1 ? 's' : ''} will sync when reconnected.`
            : ' Some features may be unavailable.'}
        </span>
      )}
      {showBackOnline && (
        <span className="flex items-center justify-center gap-2">
          <Wifi className="h-4 w-4" />
          Back online
        </span>
      )}
      {showPending && (
        <span className="flex items-center justify-center gap-2">
          <CloudUpload className={cn('h-4 w-4', isSyncing && 'animate-pulse')} />
          Syncing {pendingChanges} change{pendingChanges !== 1 ? 's' : ''}…
        </span>
      )}
      {showError && (
        <span className="flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Sync error: {lastError}
        </span>
      )}
    </div>
  );
}
