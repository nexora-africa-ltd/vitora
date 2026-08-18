'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pushApi } from '@/lib/api/push';
import type { VapidKeyResponse } from '@/lib/api/push';

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
const SW_RECHECK_DELAY_MS = 3000;

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybeAxios = error as {
      response?: { data?: { detail?: string; error?: string }; status?: number };
      message?: string;
    };
    const apiDetail = maybeAxios.response?.data?.detail || maybeAxios.response?.data?.error;
    if (apiDetail) {
      return apiDetail;
    }
    if (maybeAxios.response?.status === 503) {
      return 'Push is not configured on the server right now.';
    }
    if (maybeAxios.message) {
      return maybeAxios.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Push subscription failed';
}

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
  const swDisabledByConfig = process.env.NEXT_PUBLIC_DISABLE_SW === 'true';

  const isSupported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // Fetch VAPID public key
  const { data: vapidData, error: vapidError, isError: isVapidError } = useQuery<VapidKeyResponse>({
    queryKey: ['vapid-key'],
    queryFn: () => pushApi.getVapidKey(),
    enabled: isSupported,
    staleTime: Infinity,
    retry: 2,
    retryDelay: 1000,
    throwOnError: false,
    meta: { skipGlobalErrorHandler: true },
  });

  useEffect(() => {
    if (isVapidError) {
      setStatusMessage(getErrorMessage(vapidError));
    }
  }, [isVapidError, vapidError]);

  // Check current subscription state
  useEffect(() => {
    if (!isSupported) {
      setPermission('unsupported');
      setIsLoading(false);
      return;
    }

    if (swDisabledByConfig) {
      setHasServiceWorkerRegistration(false);
      setIsSubscribed(false);
      setIsLoading(false);
      setStatusMessage('Push is disabled by deployment configuration.');
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
            setStatusMessage('Service worker is not registered yet. Try again in a moment.');
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

    const retryTimer = window.setTimeout(() => {
      if (isMounted) {
        checkSubscription();
      }
    }, SW_RECHECK_DELAY_MS);

    const onLoad = () => {
      if (isMounted) {
        checkSubscription();
      }
    };
    window.addEventListener('load', onLoad);

    return () => {
      isMounted = false;
      window.clearTimeout(retryTimer);
      window.removeEventListener('load', onLoad);
    };
  }, [isSupported, swDisabledByConfig]);

  const isVapidReady = !!vapidData?.vapid_public_key;

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: async (publicKey: string) => {
      setStatusMessage(null);
      if (swDisabledByConfig) {
        throw new Error('Push is disabled by deployment configuration.');
      }
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') {
        throw new Error('Notification permission denied');
      }

      const registration = await getServiceWorkerRegistration();
      const ensuredRegistration =
        registration || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
      if (!ensuredRegistration) {
        throw new Error('Service worker is not ready for push subscriptions');
      }
      setHasServiceWorkerRegistration(true);
      let subscription = await ensuredRegistration.pushManager.getSubscription();
      if (!subscription) {
        try {
          subscription = await ensuredRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey.trim()),
          });
        } catch (err) {
          // InvalidStateError: browser already has a subscription. Reuse it
          // and upsert to backend in case server-side row was cleaned up.
          if ((err as DOMException)?.name === 'InvalidStateError') {
            subscription = await ensuredRegistration.pushManager.getSubscription();
          }

          if (!subscription) {
            const domError = err as DOMException;
            if (domError?.name === 'AbortError') {
              throw new Error('Could not reach browser push service. Check network/VPN and try again.');
            }
            if (domError?.name === 'NotAllowedError') {
              throw new Error('Browser blocked push notifications for this site.');
            }
            if (domError?.name === 'InvalidCharacterError') {
              throw new Error('Server VAPID key is invalid. Ask admin to verify VAPID_PUBLIC_KEY.');
            }
            throw err;
          }
        }
      }

      await pushApi.subscribe(subscription);
      return subscription;
    },
    onSuccess: () => {
      setIsSubscribed(true);
      setStatusMessage(null);
      queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] });
    },
    onError: (error) => {
      const message = getErrorMessage(error);
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
      setStatusMessage('Waiting for server push key. Reload and try again.');
      return;
    }
    subscribeMutation.mutate(publicKey);
  }, [subscribeMutation, vapidData?.vapid_public_key]);

  const unsubscribe = useCallback(() => {
    unsubscribeMutation.mutate();
  }, [unsubscribeMutation]);

  const canSubscribe = isVapidReady && !swDisabledByConfig;

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
