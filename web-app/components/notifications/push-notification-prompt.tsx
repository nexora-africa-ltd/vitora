'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushSubscription } from '@/lib/hooks/use-push-subscription';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'vitora_push_prompt_dismissed';

/**
 * Proactive push notification prompt.
 *
 * Shows a banner prompting the user to enable push notifications.
 * Appears once per session after a short delay if:
 * - Browser supports push notifications
 * - Permission hasn't been granted or denied yet
 * - User hasn't dismissed the prompt in this session
 *
 * Place this in the authenticated layout (e.g. dashboard layout).
 */
export function PushNotificationPrompt() {
  const {
    isSupported,
    isVapidReady,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    isSubscribing,
  } = usePushSubscription();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const autoSubscribeAttempted = useRef(false);

  useEffect(() => {
    // Check if already dismissed this session
    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISSED_KEY)) {
      setDismissed(true);
      return;
    }

    // Show prompt after a 3s delay to not overwhelm user on page load
    const timer = setTimeout(() => {
      setVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // If permission already granted but not subscribed, auto-subscribe (once)
  useEffect(() => {
    if (
      permission === 'granted' &&
      !isSubscribed &&
      !isSubscribing &&
      !isLoading &&
      isSupported &&
      isVapidReady &&
      !autoSubscribeAttempted.current
    ) {
      autoSubscribeAttempted.current = true;
      subscribe();
    }
  }, [permission, isSubscribed, isSubscribing, isLoading, isSupported, isVapidReady, subscribe]);

  // Don't render if:
  // - Still loading state
  // - Not supported
  // - Already subscribed
  // - Permission already granted (auto-subscribe handles it)
  // - Permission already denied (can't ask again)
  // - Already dismissed
  if (
    isLoading ||
    !isSupported ||
    isSubscribed ||
    permission === 'granted' ||
    permission === 'denied' ||
    dismissed
  ) {
    return null;
  }

  if (!visible) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, 'true');
  };

  const handleEnable = () => {
    subscribe();
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 max-w-sm',
        'duration-300 animate-in fade-in slide-in-from-bottom-4'
      )}
    >
      <div className="rounded-xl border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600">
            <Bell className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Enable Notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Get instant alerts for lab results, shift reminders, and critical updates.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={isSubscribing}
                className="h-7 text-xs"
              >
                {isSubscribing ? 'Enabling...' : 'Enable'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-7 text-xs text-muted-foreground"
              >
                Not now
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
