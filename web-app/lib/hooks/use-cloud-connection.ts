// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Reports signed desktop cloud configuration, independent cloud session, and reachability.
 * Use in desktop status UI and cloud-only workflow gates; accepts no inputs.
 */

'use client';

import { useEffect, useState } from 'react';
import { hasCloudSession } from '@/lib/api/client';
import { getAppConfig, isDesktop } from '@/lib/desktop';

export type CloudConfigState = 'checking' | 'configured' | 'missing' | 'not_required';
export type CloudSessionState = 'checking' | 'connected' | 'required' | 'not_required';
export type CloudReachability = 'checking' | 'available' | 'unavailable' | 'not_required';

export interface CloudConnectionState {
  config: CloudConfigState;
  session: CloudSessionState;
  reachability: CloudReachability;
}

const INITIAL_STATE: CloudConnectionState = {
  config: 'checking',
  session: 'checking',
  reachability: 'checking',
};

function isHubDesktopMode(mode?: string): boolean {
  return mode === 'lan_client' || mode === 'lan_hub';
}

async function getCloudConnectionState(): Promise<CloudConnectionState> {
  if (!isDesktop()) {
    return { config: 'not_required', session: 'not_required', reachability: 'not_required' };
  }

  const config = await getAppConfig();
  if (!isHubDesktopMode(config?.deployment_mode)) {
    return { config: 'not_required', session: 'not_required', reachability: 'not_required' };
  }

  const cloudApiUrl = config?.cloud_api_url?.trim().replace(/\/$/, '');
  if (!cloudApiUrl) {
    return {
      config: 'missing',
      session: hasCloudSession() ? 'connected' : 'required',
      reachability: 'unavailable',
    };
  }

  const session = hasCloudSession() ? 'connected' : 'required';
  try {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(3_000) : undefined;
    const response = await fetch(`${cloudApiUrl}/api/health/`, {
      signal,
    });
    return {
      config: 'configured',
      session,
      reachability: response.ok ? 'available' : 'unavailable',
    };
  } catch {
    return { config: 'configured', session, reachability: 'unavailable' };
  }
}

/**
 * Observes the separately authenticated cloud session without attempting cloud login.
 * Native configuration is read through the existing signed-config desktop bridge only.
 */
export function useCloudConnection(): CloudConnectionState {
  const [connection, setConnection] = useState<CloudConnectionState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const next = await getCloudConnectionState();
      if (active) setConnection(next);
    };
    const refreshSession = () => void refresh();

    void refresh();
    window.addEventListener('vitora:cloud-session-changed', refreshSession);
    window.addEventListener('vitora:cloud-session-required', refreshSession);
    window.addEventListener('online', refreshSession);
    window.addEventListener('offline', refreshSession);
    const interval = window.setInterval(() => void refresh(), 30_000);

    return () => {
      active = false;
      window.removeEventListener('vitora:cloud-session-changed', refreshSession);
      window.removeEventListener('vitora:cloud-session-required', refreshSession);
      window.removeEventListener('online', refreshSession);
      window.removeEventListener('offline', refreshSession);
      window.clearInterval(interval);
    };
  }, []);

  return connection;
}
