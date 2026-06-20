import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { PWARegister } from '@/components/pwa/pwa-register';
import { UmamiAnalytics } from '@/components/analytics/umami';
import { APP_NAME } from '@/lib/utils/constants';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Offline-first Hospital Management Information System for Kenya',
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      {
        url: '/favicon-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    shortcut: '/favicon-light.png',
    apple: '/favicon-light.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1516' },
  ],
};

// Inline kill-switch for desktop builds that upgraded from < v0.1.28.
// Those older builds registered a PWA service worker inside WebView2 that
// intercepts every fetch (including hash-named Next.js JS chunks) and serves
// stale cached responses. The result is that hydration silently fails after
// an update and the user sees a blank/Loading screen forever.
//
// Skipping `register()` in newer code is NOT enough — the existing SW
// registration persists in WebView2's user data folder across upgrades. This
// inline script runs synchronously in <head> on every page load. If we are
// inside a Tauri shell and find any registered service workers, we unregister
// them, drop all Cache API entries, and reload once. After the reload the
// page hydrates normally because no SW intercepts fetches.
const DESKTOP_SW_KILLSWITCH = `(function(){try{
  var isTauri = !!(window.__TAURI__||window.__TAURI_INTERNALS__);
  var hasDesktopParam = location.search.indexOf('desktop=1') !== -1;
  if (!isTauri && !hasDesktopParam) return;
  if (sessionStorage.getItem('__vitora_sw_purged')) return;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function(rs){
    if (!rs || rs.length === 0) {
      sessionStorage.setItem('__vitora_sw_purged','1');
      return;
    }
    var unregAll = Promise.all(rs.map(function(r){return r.unregister();}));
    var cacheClear = (window.caches && caches.keys)
      ? caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));})
      : Promise.resolve();
    Promise.all([unregAll, cacheClear]).then(function(){
      sessionStorage.setItem('__vitora_sw_purged','1');
      location.reload();
    });
  });
}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DESKTOP_SW_KILLSWITCH }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <PWARegister />
        <UmamiAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
