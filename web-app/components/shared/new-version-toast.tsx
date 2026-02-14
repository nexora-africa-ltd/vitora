'use client';

/**
 * New Version Toast
 *
 * Uses Sonner toast to notify users when a new app version is available.
 * Shows a persistent toast with Refresh action.
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useVersionCheck } from '@/lib/hooks/use-version-check';
import { getPendingUserData } from '@/lib/utils/version-check';
import { Button } from '@/components/ui/button';
import { RefreshCw, XIcon, Sparkles  } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VersionToastProps {
  id: string | number;
  onRefresh: () => Promise<void>;
  onDismiss: () => void;
  pendingCount: number;
}

function VersionToastContent({ id, onRefresh, onDismiss, pendingCount }: VersionToastProps) {
  const handleRefresh = async () => {
    toast.dismiss(id);
    await onRefresh();
  };

  return (
    <div
      className={cn(
        'group relative flex w-full items-start gap-3 overflow-hidden rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg',
        'border-l-4 border-l-green-500'
      )}
    >
      <Sparkles className="mt-0.5 size-5 shrink-0 text-green-500" />

      <div className="flex-1 space-y-1">
        <p className="text-base font-medium leading-tight">New version available</p>
        <p className="text-sm text-muted-foreground">
          Refresh to get the latest updates
          {pendingCount > 0 && (
            <span className="text-amber-500 block mt-0.5">
              {pendingCount} unsaved item(s) will be preserved
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="default"
          size="sm"
          onClick={handleRefresh}
          className="gap-1.5 h-7"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            toast.dismiss(id);
            onDismiss();
          }}
          className="size-6 shrink-0 opacity-70 hover:opacity-100"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function NewVersionToast() {
  const { newVersionAvailable, refresh, dismiss } = useVersionCheck();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (newVersionAvailable && !toastShownRef.current) {
      toastShownRef.current = true;
      const pendingData = getPendingUserData();
      
      toast.custom(
        (id) => (
          <VersionToastContent
            id={id}
            onRefresh={refresh}
            onDismiss={dismiss}
            pendingCount={pendingData.count}
          />
        ),
        {
          duration: Infinity, // Persistent until user acts
          id: 'new-version-toast', // Prevent duplicates
        }
      );
    }
    
    // Reset when version is no longer available (user dismissed)
    if (!newVersionAvailable) {
      toastShownRef.current = false;
    }
  }, [newVersionAvailable, refresh, dismiss]);

  // This component doesn't render anything - it just triggers the toast
  return null;
}
