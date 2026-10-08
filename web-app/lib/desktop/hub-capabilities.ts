// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Defines workflow availability for facility hub desktop modes.
 * Use the exported module and route helpers in hub-aware UI guards.
 * Inputs: navigation module keys and client-side route pathnames.
 */
export type HubCapability = 'LOCAL_SYNCED' | 'CLOUD_ONLY' | 'UNAVAILABLE';

export const HUB_MODULE_CAPABILITIES: Record<string, HubCapability> = {
  dashboard: 'LOCAL_SYNCED',
  checkin: 'LOCAL_SYNCED',
  patients: 'LOCAL_SYNCED',
  triage: 'LOCAL_SYNCED',
  clinics: 'LOCAL_SYNCED',
  encounters: 'LOCAL_SYNCED',
  procedures: 'LOCAL_SYNCED',
  inpatient: 'LOCAL_SYNCED',
  pharmacy: 'LOCAL_SYNCED',
  laboratory: 'LOCAL_SYNCED',
  billing: 'LOCAL_SYNCED',
  inventory: 'LOCAL_SYNCED',
  scheduling: 'LOCAL_SYNCED',
  immunizations: 'LOCAL_SYNCED',
  mch: 'LOCAL_SYNCED',
  blood_bank: 'LOCAL_SYNCED',
  imaging: 'LOCAL_SYNCED',
  surveillance: 'CLOUD_ONLY',
  analytics: 'CLOUD_ONLY',
  moh_reporting: 'CLOUD_ONLY',
  insurance: 'CLOUD_ONLY',
  cds: 'CLOUD_ONLY',
  ai: 'CLOUD_ONLY',
  admin: 'CLOUD_ONLY',
  quality: 'UNAVAILABLE',
  theatre: 'UNAVAILABLE',
  allied_health: 'UNAVAILABLE',
  emergency: 'UNAVAILABLE',
  dialysis: 'UNAVAILABLE',
  last_office: 'UNAVAILABLE',
};

const HUB_RESTRICTED_ROUTES: Array<[string, HubCapability]> = [
  ['/surveillance', 'CLOUD_ONLY'],
  ['/analytics', 'CLOUD_ONLY'],
  ['/reports/moh', 'CLOUD_ONLY'],
  ['/insurance', 'CLOUD_ONLY'],
  ['/cds', 'CLOUD_ONLY'],
  ['/ai', 'CLOUD_ONLY'],
  ['/quality', 'UNAVAILABLE'],
  ['/theatre', 'UNAVAILABLE'],
  ['/allied-health', 'UNAVAILABLE'],
  ['/emergency', 'UNAVAILABLE'],
  ['/dialysis', 'UNAVAILABLE'],
  ['/last-office', 'UNAVAILABLE'],
  ['/admin', 'CLOUD_ONLY'],
];

export function getHubModuleCapability(moduleKey?: string): HubCapability {
  return HUB_MODULE_CAPABILITIES[moduleKey ?? ''] ?? 'UNAVAILABLE';
}

export function getHubRouteCapability(pathname: string): HubCapability | null {
  return (
    HUB_RESTRICTED_ROUTES.find(
      ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )?.[1] ?? null
  );
}

export function isHubRestrictedRoute(pathname: string): boolean {
  return getHubRouteCapability(pathname) !== null;
}
