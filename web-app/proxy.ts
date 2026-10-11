import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Auth cookie name - must match what's set in auth/context.tsx
 */
const AUTH_COOKIE_NAME = 'vitora_authenticated';

const EXTERNAL_APP_HOSTS = new Set(['app.vitora.digital', 'staging.vitora.digital']);

function externalOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function webSocketOrigin(value: string | undefined): string | null {
  const origin = externalOrigin(value);
  if (!origin) return null;

  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
}

export function createContentSecurityPolicy(nonce: string): string {
  const sources = new Set(["'self'"]);
  const apiOrigin = externalOrigin(process.env.NEXT_PUBLIC_API_URL);
  const apiWebSocketOrigin = webSocketOrigin(process.env.NEXT_PUBLIC_API_URL);
  const powerSyncOrigin = externalOrigin(process.env.NEXT_PUBLIC_POWERSYNC_URL);
  const umamiOrigin = externalOrigin(process.env.NEXT_PUBLIC_UMAMI_URL);
  const mediaOrigin = externalOrigin(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);

  for (const origin of [apiOrigin, powerSyncOrigin, umamiOrigin]) {
    if (origin) sources.add(origin);
  }

  const connectSources = [
    ...sources,
    ...(apiWebSocketOrigin ? [apiWebSocketOrigin] : []),
    'https://*.ingest.de.sentry.io',
  ];
  const imageSources = ["'self'", 'data:', 'blob:'];

  for (const origin of [apiOrigin, mediaOrigin]) {
    if (origin) imageSources.push(origin);
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${umamiOrigin ? ` ${umamiOrigin}` : ''}`,
    "style-src 'self'",
    // Existing responsive layouts use inline style attributes. Keep those
    // while blocking arbitrary inline <style> elements.
    "style-src-attr 'unsafe-inline'",
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    // Some clinical documents are intentionally embedded in same-origin print
    // views. This still blocks every third-party framing attempt.
    "frame-ancestors 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function addSecurityHeaders(response: NextResponse, nonce: string, shouldNotCache: boolean) {
  if (process.env.VITORA_DESKTOP !== '1') {
    response.headers.set('Content-Security-Policy', createContentSecurityPolicy(nonce));
  }

  if (shouldNotCache) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  return response;
}

/**
 * Routes that don't require authentication
 */
const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/change-password',
  '/signup',
  '/verify-email',
  '/verify',
  '/setup',
  '/imaging/share',
  '/queue-display',
  '/triage-display',
  '/activate',
  '/desktop-setup',
  '/hub-setup',
];

/**
 * Routes that should redirect to dashboard if already authenticated
 */
const AUTH_ROUTES = ['/login'];

/**
 * Static assets and API routes to skip
 */
const SKIP_PATTERNS = [
  '/_next/static',
  '/_next/image',
  '/api',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/icons',
  '/images',
];

/**
 * Whether the setup wizard feature is enabled
 */
const SETUP_WIZARD_ENABLED = process.env.NEXT_PUBLIC_SETUP_WIZARD_ENABLED === 'true';

function continueWithSecurityHeaders(request: NextRequest, shouldNotCache = false) {
  const nonce = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return addSecurityHeaders(response, nonce, shouldNotCache);
}

/**
 * Proxy for server-side authentication routing.
 *
 * - Unauthenticated users are redirected to /login
 * - Authenticated users on /login are redirected to /dashboard (or /setup if wizard enabled)
 * - Root path (/) redirects based on auth status
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  // The container listens over HTTP internally. Only redirect public Vitora
  // hosts when the edge tells us the original request was plain HTTP.
  if (
    process.env.NODE_ENV === 'production' &&
    forwardedProtocol === 'http' &&
    EXTERNAL_APP_HOSTS.has(request.nextUrl.hostname)
  ) {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = 'https:';
    return NextResponse.redirect(secureUrl, 308);
  }

  // Skip middleware for static assets and API routes
  if (SKIP_PATTERNS.some((pattern) => pathname.startsWith(pattern))) {
    return NextResponse.next();
  }

  // Let Next.js return its normal 404 for an invalid bare /_next request, but
  // still attach CSP to the HTML error page.
  if (pathname === '/_next') {
    return continueWithSecurityHeaders(request);
  }

  // Check for auth cookie (simple presence check)
  const isAuthenticated = request.cookies.has(AUTH_COOKIE_NAME);

  // Root path - redirect based on auth status
  // When setup wizard is enabled, authenticated users go to /setup first
  // (the setup page will redirect to /dashboard if setup is already complete)
  if (pathname === '/') {
    if (!isAuthenticated) {
      return addSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)), crypto.randomUUID(), true);
    }
    const destination = SETUP_WIZARD_ENABLED ? '/setup' : '/dashboard';
    return addSecurityHeaders(NextResponse.redirect(new URL(destination, request.url)), crypto.randomUUID(), true);
  }

  // Authenticated users trying to access login page
  if (isAuthenticated && AUTH_ROUTES.includes(pathname)) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)), crypto.randomUUID(), true);
  }

  // Unauthenticated users trying to access protected routes
  if (!isAuthenticated && !PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    const loginUrl = new URL('/login', request.url);
    // Store the original URL to redirect back after login
    loginUrl.searchParams.set('callbackUrl', pathname);
    return addSecurityHeaders(NextResponse.redirect(loginUrl), crypto.randomUUID(), true);
  }

  return continueWithSecurityHeaders(request, isAuthenticated || AUTH_ROUTES.includes(pathname));
}

/**
 * Configure which paths the middleware runs on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
