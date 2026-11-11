// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Tests runtime WebSocket routing for Tauri hub deployments.
 * Run with: npm test -- websocket-runtime.test.ts.
 */

const mockGetAppConfig = jest.fn();
const mockIsDesktop = jest.fn();
const mockPost = jest.fn();

jest.mock('@/lib/desktop', () => ({
  getAppConfig: () => mockGetAppConfig(),
  isDesktop: () => mockIsDesktop(),
}));

jest.mock('@/lib/api/client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

import { clearHubRoutingManifest } from '@/lib/desktop/hub-capabilities';
import {
  bootstrapWebSocketRuntime,
  resetWebSocketRuntime,
  resolveAuthenticatedWebSocketUrl,
  resolveWebSocketUrl,
} from '@/lib/desktop/websocket-runtime';

const routingManifest = {
  version: 1 as const,
  workflows: [
    {
      key: 'billing',
      capability: 'LOCAL_SYNCED' as const,
      routing_policy: 'HUB' as const,
      frontend_routes: [],
      api_prefixes: [],
      websocket_prefixes: ['/ws/billing/'],
    },
    {
      key: 'insurance',
      capability: 'CLOUD_ONLY' as const,
      routing_policy: 'CLOUD' as const,
      frontend_routes: [],
      api_prefixes: [],
      websocket_prefixes: ['/ws/billing/*/sha-claims/'],
    },
    {
      key: 'restricted',
      capability: 'UNAVAILABLE' as const,
      routing_policy: 'BLOCK' as const,
      frontend_routes: [],
      api_prefixes: [],
      websocket_prefixes: ['/ws/restricted/'],
    },
  ],
};

describe('WebSocket runtime resolver', () => {
  beforeEach(() => {
    resetWebSocketRuntime();
    clearHubRoutingManifest();
    mockIsDesktop.mockReturnValue(true);
    mockGetAppConfig.mockResolvedValue({
      api_url: 'http://hub.test:9088/',
      cloud_api_url: 'https://cloud.test/',
      deployment_mode: 'lan_client',
    });
    mockPost.mockResolvedValue({
      data: { ticket: 'opaque-single-use-ticket', expires_at: '2026-10-11T21:00:00.000Z' },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routing_manifest: routingManifest }),
    });
  });

  it('keeps Tauri sockets closed until the runtime and manifest are ready', () => {
    expect(resolveWebSocketUrl('/ws/billing/1/invoices/')).toBeNull();
  });

  it('uses the hub for local sockets and cloud for the longer SHA claim pattern', async () => {
    await bootstrapWebSocketRuntime();

    expect(resolveWebSocketUrl('/ws/billing/1/invoices/')).toBe(
      'ws://hub.test:9088/ws/billing/1/invoices/'
    );
    expect(resolveWebSocketUrl('/ws/billing/1/sha-claims/')).toBe(
      'wss://cloud.test/ws/billing/1/sha-claims/'
    );
  });

  it('does not resolve sockets blocked by the manifest', async () => {
    await bootstrapWebSocketRuntime();

    expect(resolveWebSocketUrl('/ws/restricted/alerts/')).toBeNull();
  });

  it('uses a fresh opaque ticket for desktop sockets', async () => {
    await bootstrapWebSocketRuntime();

    await expect(resolveAuthenticatedWebSocketUrl('/ws/billing/1/invoices/')).resolves.toBe(
      'ws://hub.test:9088/ws/billing/1/invoices/?ticket=opaque-single-use-ticket'
    );
    expect(mockPost).toHaveBeenCalledWith('/api/core/websocket-ticket/');
  });
});
