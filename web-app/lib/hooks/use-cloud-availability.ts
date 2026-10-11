// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Verifies reachability of Vitora Cloud for desktop cloud-only workflows.
 * Use in LAN desktop navigation and route gates; it accepts no inputs.
 */

'use client';

import { useCloudConnection } from '@/lib/hooks/use-cloud-connection';

export type CloudAvailability = 'checking' | 'available' | 'unavailable';

export function useCloudAvailability(): CloudAvailability {
  const { reachability } = useCloudConnection();
  if (reachability === 'checking') return 'checking';
  return reachability === 'unavailable' ? 'unavailable' : 'available';
}
