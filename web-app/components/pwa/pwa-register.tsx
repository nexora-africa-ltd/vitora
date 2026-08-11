'use client';

import { useEffect } from 'react';
import { isDesktop } from '@/lib/desktop';

const SW_DISABLE_FLAG = process.env.NEXT_PUBLIC_DISABLE_SW === 'true';
const SW_PURGE_SESSION_KEY = 'vitora-sw-purged';

function isDesktopNavigation(): boolean {
  if (isDesktop()) return true;
  return typeof window !== 'undefined' && window.location.search.includes('desktop=1');
}

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const purgeServiceWorkers = async (reloadWhenNeeded: boolean) => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));

        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }

        if (
          reloadWhenNeeded &&
          registrations.length > 0 &&
          !sessionStorage.getItem(SW_PURGE_SESSION_KEY)
        ) {
          sessionStorage.setItem(SW_PURGE_SESSION_KEY, '1');
          window.location.reload();
        }
      } catch (error) {
        console.warn('[PWA] service worker cleanup failed', error);
      }
    };

    if (process.env.NODE_ENV !== 'production') {
      void purgeServiceWorkers(false);
      return;
    }

    if (SW_DISABLE_FLAG) {
      void purgeServiceWorkers(true);
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
      void purgeServiceWorkers(true);
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
