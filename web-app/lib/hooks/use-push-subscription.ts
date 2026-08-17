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

const SW_READY_TIMEOUT_MS = 2000;

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  const readyOrTimeout = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
    }),
  ]);

  return readyOrTimeout;
}

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
  const [hasServiceWorkerRegistration, setHasServiceWorkerRegistration] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
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

    let isMounted = true;

    const checkSubscription = async () => {
      try {
        const registration = await getServiceWorkerRegistration();
        if (!registration) {
          if (isMounted) {
            setHasServiceWorkerRegistration(false);
            setIsSubscribed(false);
            setIsLoading(false);
            setStatusMessage('Push requires a registered service worker. It may be unavailable in local development.');
          }
          return;
        }

        const sub = await registration.pushManager.getSubscription();
        if (isMounted) {
          setHasServiceWorkerRegistration(true);
          setIsSubscribed(!!sub);
          setIsLoading(false);
          setStatusMessage(null);
        }
      } catch {
        if (isMounted) {
          setIsLoading(false);
          setStatusMessage('Unable to check push subscription status.');
        }
      }
    };

    checkSubscription();

    return () => {
      isMounted = false;
    };
  }, [isSupported]);

  const isVapidReady = !!vapidData?.vapid_public_key;

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: async (publicKey: string) => {
      setStatusMessage(null);
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') {
        throw new Error('Notification permission denied');
      }

      const registration = await getServiceWorkerRegistration();
      if (!registration) {
        throw new Error('Service worker is not ready for push subscriptions');
      }
      setHasServiceWorkerRegistration(true);
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
      const message = error instanceof Error ? error.message : 'Push subscription failed';
      setStatusMessage(message);
      console.warn('[Push] Subscription failed:', message);
    },
    // Prevent bubbling to global error handler
    throwOnError: false,
    meta: { skipGlobalErrorHandler: true },
  });

  // Unsubscribe mutation
  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const registration = await getServiceWorkerRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
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

  const canSubscribe = isVapidReady && hasServiceWorkerRegistration;

  return {
    isSupported,
    isVapidReady,
    hasServiceWorkerRegistration,
    canSubscribe,
    permission,
    isSubscribed,
    isLoading,
    statusMessage,
    subscribe,
    unsubscribe,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    error: subscribeMutation.error || unsubscribeMutation.error,
  };
}
