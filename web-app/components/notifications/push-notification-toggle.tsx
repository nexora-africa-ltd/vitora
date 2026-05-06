'use client';

import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePushSubscription } from '@/lib/hooks/use-push-subscription';
import { cn } from '@/lib/utils';

/**
 * Push notification opt-in/out toggle.
 *
 * Shows contextual UI based on push notification state:
 * - "Enable" button when not subscribed
 * - "Enabled" indicator with option to disable
 * - "Denied" state when browser permission was blocked
 * - Hidden when browser doesn't support push
 */
export function PushNotificationToggle({ className }: { className?: string }) {
  const {
    isSupported,
    isVapidReady,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isSubscribing,
    isUnsubscribing,
  } = usePushSubscription();

  if (!isSupported || isLoading) return null;

  if (permission === 'denied') {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground',
                className
              )}
            >
              <BellOff className="h-4 w-4" />
              <span>Push blocked</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Push notifications are blocked by your browser.</p>
            <p className="text-xs text-muted-foreground">
              Reset in browser settings → Site permissions
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (isSubscribed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={unsubscribe}
              disabled={isUnsubscribing}
              className={cn('gap-2 text-emerald-600 dark:text-emerald-400', className)}
            >
              {isUnsubscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              <span className="text-sm">Push enabled</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Click to disable push notifications</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={subscribe}
      disabled={isSubscribing || !isVapidReady}
      className={cn('gap-2', className)}
    >
      {isSubscribing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      <span className="text-sm">Enable push</span>
    </Button>
  );
}
