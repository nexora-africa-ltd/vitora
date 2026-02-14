'use client';

/**
 * New Version Toast
 *
 * A persistent toast notification that appears when a new app version
 * is detected. Prompts users to refresh to get the latest updates.
 * Shows a warning if there's pending unsaved data.
 */

import { useState, useEffect } from 'react';
import { useVersionCheck } from '@/lib/hooks/use-version-check';
import { getPendingUserData, PendingUserData } from '@/lib/utils/version-check';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Sparkles, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NewVersionToast() {
  const { newVersionAvailable, refresh, dismiss, isRefreshing } = useVersionCheck();
  const [pendingData, setPendingData] = useState<PendingUserData | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Check for pending data when toast appears
  useEffect(() => {
    if (newVersionAvailable) {
      setPendingData(getPendingUserData());
    }
  }, [newVersionAvailable]);

  if (!newVersionAvailable) {
    return null;
  }

  const hasPending = pendingData && pendingData.count > 0;

  const handleRefreshClick = () => {
    if (hasPending && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    refresh();
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-[100]',
        'flex flex-col gap-2 p-4',
        'bg-background border border-border rounded-lg shadow-lg',
        'animate-in slide-in-from-bottom-5 fade-in duration-300',
        'max-w-sm'
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            showConfirm ? 'bg-amber-500/10' : 'bg-primary/10'
          )}>
            {showConfirm ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <Sparkles className="w-5 h-5 text-primary" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {showConfirm ? (
            <>
              <p className="text-sm font-medium text-foreground">
                Unsaved data detected
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pendingData?.hasDrafts && `${pendingData.draftKeys.length} draft form(s)`}
                {pendingData?.hasDrafts && pendingData?.hasOfflineQueue && ' and '}
                {pendingData?.hasOfflineQueue && 'pending offline changes'}
                {' will be preserved. Refresh anyway?'}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                New version available
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Refresh to get the latest updates
                {hasPending && (
                  <span className="text-amber-500 block mt-0.5">
                    {pendingData.count} unsaved item(s) detected
                  </span>
                )}
              </p>
            </>
          )}
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (showConfirm) {
              setShowConfirm(false);
            } else {
              dismiss();
            }
          }}
          className="w-8 h-8 text-muted-foreground hover:text-foreground flex-shrink-0"
          aria-label={showConfirm ? 'Cancel' : 'Dismiss'}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        {showConfirm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirm(false)}
          >
            Cancel
          </Button>
        )}
        <Button
          variant={showConfirm ? 'default' : 'default'}
          size="sm"
          onClick={handleRefreshClick}
          disabled={isRefreshing}
          className="gap-1.5"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Refreshing...' : showConfirm ? 'Refresh Anyway' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}
