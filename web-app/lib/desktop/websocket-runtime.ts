// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Resolves WebSocket origins after the desktop runtime configuration is ready.
 * Bootstrap with bootstrapWebSocketRuntime() in Providers; resolveWebSocketUrl()
 * accepts a WebSocket path and returns null while desktop routing is pending or blocked.
 */

import { getAppConfig, isDesktop, type AppConfig } from '@/lib/desktop';
import { apiClient } from '@/lib/api/client';
import { WebSocketTicketResponseSchema } from '@/lib/schemas/websocket.schema';
import { parseResponse } from '@/lib/schemas/validation';
import {
  getHubWebSocketRoutingPolicy,
  loadHubRoutingManifest,
  type HubRoutingPolicy,
} from '@/lib/desktop/hub-capabilities';

type RuntimeStatus = 'pending' | 'ready';

interface WebSocketRuntime {
  status: RuntimeStatus;
  config: AppConfig | null;
}

let runtime: WebSocketRuntime = { status: 'pending', config: null };
let bootstrapRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function isHubMode(config: AppConfig | null): boolean {
  return config?.deployment_mode === 'lan_client' || config?.deployment_mode === 'lan_hub';
}

function toWebSocketOrigin(origin: string): string {
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
}

function browserWebSocketUrl(path: string): string {
  const wsHost = process.env.NEXT_PUBLIC_WS_URL;
  if (wsHost) return `${wsHost.replace(/\/$/, '')}${path}`;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) return `${toWebSocketOrigin(apiUrl)}${path}`;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

/** Start the one-time desktop configuration and hub manifest bootstrap. */
export function bootstrapWebSocketRuntime(): Promise<void> {
  if (!isDesktop()) {
    runtime = { status: 'ready', config: null };
    notify();
    return Promise.resolve();
  }
  if (runtime.status === 'ready') return Promise.resolve();
  if (!bootstrapRequest) {
    bootstrapRequest = (async () => {
      const config = await getAppConfig();
      if (isHubMode(config)) await loadHubRoutingManifest();
      runtime = { status: 'ready', config };
      notify();
    })().catch(() => {
      runtime = { status: 'ready', config: null };
      notify();
    });
  }
  return bootstrapRequest;
}

/** Subscribe React hooks to runtime readiness without making socket resolution async. */
export function subscribeWebSocketRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns a stable primitive snapshot for useSyncExternalStore. */
export function getWebSocketRuntimeStatus(): RuntimeStatus {
  return isDesktop() ? runtime.status : 'ready';
}

/** Resolve a WebSocket path from the runtime routing policy. */
export function resolveWebSocketUrl(path: string): string | null {
  if (typeof window === 'undefined') return null;
  if (!isDesktop()) return browserWebSocketUrl(path);
  if (runtime.status !== 'ready' || !runtime.config?.api_url) return null;

  const policy: HubRoutingPolicy | null = isHubMode(runtime.config)
    ? getHubWebSocketRoutingPolicy(path)
    : null;
  if (policy === 'BLOCK') return null;

  const origin = policy === 'CLOUD' ? runtime.config.cloud_api_url : runtime.config.api_url;
  return origin ? `${toWebSocketOrigin(origin)}${path}` : null;
}

/**
 * Resolve a socket URL and add a one-time ticket for desktop runtimes.
 * Browser clients authenticate with the HttpOnly ``vitora_access`` cookie.
 */
export async function resolveAuthenticatedWebSocketUrl(path: string): Promise<string | null> {
  const url = resolveWebSocketUrl(path);
  if (!url || !isDesktop()) return url;

  const response = await apiClient.post('/api/core/websocket-ticket/');
  const data = parseResponse(WebSocketTicketResponseSchema, response.data, {
    context: 'resolveAuthenticatedWebSocketUrl',
  });

  const target = new URL(url);
  target.searchParams.set('ticket', data.ticket);
  return target.toString();
}

/** Reset the runtime after desktop discovery or configuration changes. */
export function resetWebSocketRuntime(): void {
  runtime = { status: 'pending', config: null };
  bootstrapRequest = null;
  notify();
}
