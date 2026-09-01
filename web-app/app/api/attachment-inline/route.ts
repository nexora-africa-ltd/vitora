import { NextRequest } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';
const EXTRA_ALLOWED_HOSTS = (process.env.VITORA_ATTACHMENT_INLINE_ALLOWED_HOSTS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function resolveAllowedTarget(src: string, apiHostFromClient?: string | null): URL | null {
  let apiBase: URL;
  try {
    apiBase = new URL(API_BASE_URL);
  } catch {
    return null;
  }

  let target: URL;
  try {
    if (src.startsWith('/') && apiHostFromClient) {
      target = new URL(src, `${apiBase.protocol}//${apiHostFromClient}`);
    } else {
      target = src.startsWith('/') ? new URL(src, apiBase) : new URL(src);
    }
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return null;
  }

  if (!target.pathname.startsWith('/media/')) {
    return null;
  }

  const sameApiHost = target.hostname === apiBase.hostname && target.port === apiBase.port;
  const azureMediaHost = target.hostname.endsWith('.azurecontainerapps.io');
  const localMediaHost = target.hostname === '127.0.0.1' || target.hostname === 'localhost';
  const explicitAllowHost = EXTRA_ALLOWED_HOSTS.includes(target.host.toLowerCase());
  const explicitAllowName = EXTRA_ALLOWED_HOSTS.includes(target.hostname.toLowerCase());

  let desktopClientApiHostMatch = false;
  if (process.env.VITORA_DESKTOP === '1' && apiHostFromClient) {
    desktopClientApiHostMatch = target.host.toLowerCase() === apiHostFromClient.toLowerCase();
  }

  let webClientApiHostMatch = false;
  if (apiHostFromClient && target.host.toLowerCase() === apiHostFromClient.toLowerCase()) {
    webClientApiHostMatch = true;
  }

  if (
    !sameApiHost &&
    !azureMediaHost &&
    !localMediaHost &&
    !explicitAllowHost &&
    !explicitAllowName &&
    !desktopClientApiHostMatch &&
    !webClientApiHostMatch
  ) {
    return null;
  }

  return target;
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get('src');
  const apiHost = request.nextUrl.searchParams.get('apiHost');
  if (!src) {
    return new Response('Missing src query parameter', { status: 400 });
  }

  const target = resolveAllowedTarget(src, apiHost);
  if (!target) {
    return new Response('Unsupported attachment source', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    upstream = new Response(null, { status: 502 });
  }

  if ((!upstream.ok || !upstream.body) && apiHost && target.hostname === 'localhost') {
    try {
      const retryTarget = new URL(target.toString());
      retryTarget.host = apiHost;
      upstream = await fetch(retryTarget.toString(), {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
      });
    } catch {
      // keep original upstream error handling below
    }
  }

  if (!upstream.ok || !upstream.body) {
    return new Response('Unable to load attachment', { status: upstream.status || 502 });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
