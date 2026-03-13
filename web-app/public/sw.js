const STATIC_CACHE = 'vitora-static-v1';
const RUNTIME_CACHE = 'vitora-runtime-v1';
const OFFLINE_URL = '/offline.html';
const STATIC_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.png',
  '/logo.png',
  '/dark-icon.png',
  '/light-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (shouldCacheStaticAsset(request, url)) {
    event.respondWith(handleStaticAssetRequest(request));
  }
});

async function handleNavigationRequest(request) {
  try {
    return await fetch(request);
  } catch {
    const cachedOfflineResponse = await caches.match(OFFLINE_URL);
    return cachedOfflineResponse || Response.error();
  }
}

async function handleStaticAssetRequest(request) {
  const cachedResponse = await caches.match(request);
  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

function shouldCacheStaticAsset(request, url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    ['style', 'script', 'worker', 'image', 'font'].includes(request.destination) ||
    url.pathname === '/manifest.webmanifest'
  );
}