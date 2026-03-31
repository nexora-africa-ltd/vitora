import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Auth cookie name - must match what's set in auth/context.tsx
 */
const AUTH_COOKIE_NAME = 'vitora_authenticated';

/**
 * Routes that don't require authentication
 */
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password', '/invite', '/change-password'];

/**
 * Routes that should redirect to dashboard if already authenticated
 */
const AUTH_ROUTES = ['/login'];

/**
 * Static assets and API routes to skip
 */
const SKIP_PATTERNS = [
  '/_next',
  '/api',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/icons',
  '/images',
];

/**
 * Proxy for server-side authentication routing.
 *
 * - Unauthenticated users are redirected to /login
 * - Authenticated users on /login are redirected to /dashboard
 * - Root path (/) redirects based on auth status
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets and API routes
  if (SKIP_PATTERNS.some((pattern) => pathname.startsWith(pattern))) {
    return NextResponse.next();
  }

  // Check for auth cookie (simple presence check)
  const isAuthenticated = request.cookies.has(AUTH_COOKIE_NAME);

  // Root path - redirect based on auth status
  if (pathname === '/') {
    const destination = isAuthenticated ? '/dashboard' : '/login';
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Authenticated users trying to access login page
  if (isAuthenticated && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Unauthenticated users trying to access protected routes
  if (!isAuthenticated && !PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    const loginUrl = new URL('/login', request.url);
    // Store the original URL to redirect back after login
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
