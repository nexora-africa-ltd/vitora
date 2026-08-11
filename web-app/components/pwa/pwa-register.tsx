'use client';

import { useEffect } from 'react';
import { isDesktop } from '@/lib/desktop';

function isDesktopNavigation(): boolean {
  if (isDesktop()) return true;
  return typeof window !== 'undefined' && window.location.search.includes('desktop=1');
}

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      const cleanupDevServiceWorkers = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
          if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch (error) {
          console.warn('[PWA] dev SW cleanup failed', error);
        }
      };

      void cleanupDevServiceWorkers();
      return;
    }

    // Desktop mode: actively unregister any pre-existing service workers and
    // purge caches. Users who upgraded from older desktop builds (< v0.1.28)
    // still have the PWA service worker registered inside WebView2. That SW
    // intercepts every fetch (including hash-named JS chunks served by the
    // local sidecar) and serves stale cached responses, which breaks Next.js
    // hydration and leaves the WebView on the "Loading..." fallback forever.
    // Simply skipping registration on new builds is not enough — the existing
    // registration persists in WebView2's user data folder across upgrades.
    if (isDesktopNavigation()) {
      const cleanup = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
          if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          // If any SWs were actually unregistered, force a one-time reload so
          // the page is no longer being controlled by the killed worker.
          if (registrations.length > 0 && !sessionStorage.getItem('vitora-desktop-sw-purged')) {
            sessionStorage.setItem('vitora-desktop-sw-purged', '1');
            window.location.reload();
          }
        } catch (error) {
          console.warn('[PWA] desktop SW cleanup failed', error);
        }
      };
      void cleanup();
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (error) {
        console.error('Failed to register service worker', error);
      }
    };

    if (document.readyState === 'complete') {
      void register();
      return;
    }

    window.addEventListener('load', register, { once: true });

    return () => {
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
