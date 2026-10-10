// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Verifies reachability of Vitora Cloud for desktop cloud-only workflows.
 * Use in LAN desktop navigation and route gates; it accepts no inputs.
 */

'use client';

import { useEffect, useState } from 'react';
import { getAppConfig, isDesktop } from '@/lib/desktop';

export type CloudAvailability = 'checking' | 'available' | 'unavailable';

async function checkCloud(): Promise<CloudAvailability> {
  if (!isDesktop()) return 'available';
  const config = await getAppConfig();
  if (config?.deployment_mode !== 'lan_client' && config?.deployment_mode !== 'lan_hub') {
    return 'available';
  }
  try {
    const response = await fetch(`${config.cloud_api_url.replace(/\/$/, '')}/api/health/`, {
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export function useCloudAvailability(): CloudAvailability {
  const [availability, setAvailability] = useState<CloudAvailability>('checking');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const next = await checkCloud();
      if (active) setAvailability(next);
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return availability;
}
