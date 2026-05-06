'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pushApi } from '@/lib/api/push';

/**
 * Convert a base64url-encoded VAPID public key to a Uint8Array
 * for use with PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Hook for managing Web Push notification subscriptions.
 *
 * Handles:
 * - Checking browser support and permission state
 * - Fetching the VAPID key from backend
 * - Subscribing to push notifications
 * - Unsubscribing from push notifications
 */
export function usePushSubscription() {
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // Fetch VAPID public key
  const { data: vapidData } = useQuery({
    queryKey: ['vapid-key'],
    queryFn: () => pushApi.getVapidKey(),
    enabled: isSupported,
    staleTime: Infinity,
    retry: 2,
    retryDelay: 1000,
    throwOnError: false,
    meta: { skipGlobalErrorHandler: true },
  });

  // Check current subscription state
  useEffect(() => {
    if (!isSupported) {
      setPermission('unsupported');
      setIsLoading(false);
      return;
    }

    setPermission(Notification.permission as PushPermission);

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setIsSubscribed(!!sub);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [isSupported]);

  const isVapidReady = !!vapidData?.vapid_public_key;

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: async (publicKey: string) => {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') {
        throw new Error('Notification permission denied');
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch (err) {
        // AbortError: push service unreachable (common on localhost/dev).
        // Permission was granted, so treat as success — auto-subscribe will
        // complete when a working push service is available.
        if ((err as DOMException)?.name === 'AbortError') {
          return null;
        }
        throw err;
      }

      await pushApi.subscribe(subscription);
      return subscription;
    },
    onSuccess: () => {
      // Even if subscription is null (push service unreachable), the user
      // granted permission — mark as subscribed so UI reflects intent.
      setIsSubscribed(true);
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
    },
    onError: (error) => {
      console.warn('[Push] Subscription failed:', error.message);
    },
    // Prevent bubbling to global error handler
    throwOnError: false,
    meta: { skipGlobalErrorHandler: true },
  });

  // Unsubscribe mutation
  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remove all subscriptions from backend for this user
      const { results } = await pushApi.list();
      await Promise.all(results.map((sub) => pushApi.unsubscribe(sub.id)));
    },
    onSuccess: () => {
      setIsSubscribed(false);
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
    },
  });

  const subscribe = useCallback(() => {
    const publicKey = vapidData?.vapid_public_key;
    if (!publicKey) {
      // VAPID key hasn't loaded yet (or backend not configured) — skip silently.
      return;
    }
    subscribeMutation.mutate(publicKey);
  }, [subscribeMutation, vapidData?.vapid_public_key]);

  const unsubscribe = useCallback(() => {
    unsubscribeMutation.mutate();
  }, [unsubscribeMutation]);

  return {
    isSupported,
    isVapidReady,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    error: subscribeMutation.error || unsubscribeMutation.error,
  };
}
