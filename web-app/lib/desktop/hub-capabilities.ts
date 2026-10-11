// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Loads the backend-owned hub/cloud routing manifest for desktop clients.
 * Use loadHubRoutingManifest() before routing desktop API, route, or WS traffic.
 * Inputs: hub health response at GET /api/hub/health/; no frontend policy map exists here.
 */

import { getAppConfig } from '@/lib/desktop';

export type HubCapability = 'LOCAL_SYNCED' | 'CLOUD_ONLY' | 'UNAVAILABLE';
export type HubRoutingPolicy = 'HUB' | 'CLOUD' | 'BLOCK';

export interface HubWorkflowManifest {
  key: string;
  capability: HubCapability;
  routing_policy: HubRoutingPolicy;
  frontend_routes: string[];
  api_prefixes: string[];
  websocket_prefixes: string[];
}

export interface HubRoutingManifest {
  version: 1;
  workflows: HubWorkflowManifest[];
}

let manifest: HubRoutingManifest | null = null;
let manifestRequest: Promise<HubRoutingManifest | null> | null = null;

function isHubMode(mode?: string): boolean {
  return mode === 'lan_client' || mode === 'lan_hub';
}

function matchesPrefix(path: string, prefix: string): boolean {
  if (prefix.includes('*')) {
    const expression = new RegExp(
      `^${prefix
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]+')}`
    );
    return expression.test(path);
  }
  return path === prefix.slice(0, -1) || path.startsWith(prefix);
}

function getLongestPrefixPolicy(
  pathname: string,
  prefixes: keyof Pick<HubWorkflowManifest, 'api_prefixes' | 'websocket_prefixes'>
): HubRoutingPolicy | null {
  let match: { prefix: string; policy: HubRoutingPolicy } | null = null;
  for (const workflow of manifest?.workflows ?? []) {
    for (const prefix of workflow[prefixes]) {
      if (matchesPrefix(pathname, prefix) && (!match || prefix.length > match.prefix.length)) {
        match = { prefix, policy: workflow.routing_policy };
      }
    }
  }
  return match?.policy ?? null;
}

function parseManifest(payload: unknown): HubRoutingManifest | null {
  const candidate = (payload as { routing_manifest?: HubRoutingManifest } | null)?.routing_manifest;
  if (candidate?.version !== 1 || !Array.isArray(candidate.workflows)) return null;
  return candidate;
}

/** Fetch and cache the current hub's backend-owned routing manifest. */
export async function loadHubRoutingManifest(): Promise<HubRoutingManifest | null> {
  if (manifest) return manifest;
  if (manifestRequest) return manifestRequest;
  manifestRequest = (async () => {
    const config = await getAppConfig();
    if (!isHubMode(config?.deployment_mode)) return null;
    const hubUrl = config?.api_url;
    if (!hubUrl) return null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(`${hubUrl.replace(/\/$/, '')}/api/hub/health/`, {
        signal: controller.signal,
      });
      if (!response.ok) return null;
      manifest = parseManifest(await response.json());
      return manifest;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  return manifestRequest;
}

/** Clear stale data after hub rediscovery or a desktop configuration change. */
export function clearHubRoutingManifest(): void {
  manifest = null;
  manifestRequest = null;
}

export function getCachedHubRoutingManifest(): HubRoutingManifest | null {
  return manifest;
}

export function getHubModuleCapability(moduleKey?: string): HubCapability | null {
  return manifest?.workflows.find((workflow) => workflow.key === moduleKey)?.capability ?? null;
}

export function getHubRouteCapability(pathname: string): HubCapability | null {
  return (
    manifest?.workflows.find((workflow) =>
      workflow.frontend_routes.some((route) => matchesPrefix(pathname, route))
    )?.capability ?? null
  );
}

export function getHubApiRoutingPolicy(pathname: string): HubRoutingPolicy | null {
  return getLongestPrefixPolicy(pathname, 'api_prefixes');
}

export function getHubWebSocketRoutingPolicy(pathname: string): HubRoutingPolicy | null {
  return getLongestPrefixPolicy(pathname, 'websocket_prefixes');
}

export function isCloudOnlyRoute(pathname: string): boolean {
  return getHubRouteCapability(pathname) === 'CLOUD_ONLY';
}
