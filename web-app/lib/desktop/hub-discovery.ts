/**
 * Hub Discovery — finds the facility hub on the local network.
 *
 * Discovery methods (tried in order):
 * 1. Saved hub URL from config (fastest — no network scan)
 * 2. UDP broadcast probe (VITORA_DISCOVER on port 19088)
 * 3. Manual entry via settings UI
 *
 * Note: mDNS is handled at the OS/Tauri level (Bonjour/Avahi resolves
 * `vitora-hub-*.local` automatically). If the hub advertises via mDNS,
 * the user can simply enter `http://vitora-hub.local:9088` in settings.
 */

export interface HubInfo {
  url: string;
  facilityId: string;
  facilityName: string;
  hubId: string;
  version: string;
}

/**
 * Probe for a hub on the local network using a health check.
 * Tries the given URL's /api/hub/health/ endpoint.
 */
export async function probeHub(url: string, timeoutMs = 5000): Promise<HubInfo | null> {
  try {
    const cleanUrl = url.replace(/\/$/, '');
    const response = await fetch(`${cleanUrl}/api/hub/health/`, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.hub_id) return null;

    return {
      url: cleanUrl,
      facilityId: data.facility_id || '',
      facilityName: data.organization_id || '',
      hubId: data.hub_id,
      version: data.version || 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Scan common LAN subnets for a hub (brute-force last resort).
 * Tries the host's subnet (.1 through .254) in parallel.
 * Very slow — prefer UDP broadcast or manual entry.
 */
export async function scanSubnet(
  baseIp: string,
  port = 9088,
  timeoutMs = 2000
): Promise<HubInfo | null> {
  // Extract first 3 octets
  const parts = baseIp.split('.');
  if (parts.length !== 4) return null;
  const prefix = parts.slice(0, 3).join('.');

  // Probe in batches of 20 to avoid overwhelming the network
  const BATCH_SIZE = 20;
  for (let start = 1; start < 255; start += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, 255 - start) }, (_, i) => start + i);
    const results = await Promise.all(
      batch.map((octet) => probeHub(`http://${prefix}.${octet}:${port}`, timeoutMs))
    );
    const found = results.find((r) => r !== null);
    if (found) return found;
  }

  return null;
}

/**
 * Try to discover the hub using multiple methods.
 * Returns the first successful result.
 */
export async function discoverHub(savedUrl?: string): Promise<HubInfo | null> {
  // Method 1: Try saved URL first
  if (savedUrl) {
    const result = await probeHub(savedUrl);
    if (result) return result;
  }

  // Method 2: Try common addresses
  const commonAddresses = [
    'http://vitora-hub.local:9088', // mDNS hostname
    'http://192.168.1.1:9088', // Common router subnet
    'http://192.168.0.1:9088',
    'http://10.0.0.1:9088',
  ];

  for (const addr of commonAddresses) {
    const result = await probeHub(addr, 2000);
    if (result) return result;
  }

  return null;
}
