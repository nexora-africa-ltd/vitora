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
  organizationId: string;
  facilityName: string;
  hubId: string;
  version: string;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function getPortCandidates(savedUrl?: string): number[] {
  const candidates: number[] = [];
  const parsed = savedUrl ? parseUrl(savedUrl) : null;
  if (parsed?.port) {
    const parsedPort = Number.parseInt(parsed.port, 10);
    if (Number.isFinite(parsedPort) && parsedPort > 0) {
      candidates.push(parsedPort);
    }
  }

  for (const fallbackPort of [9099, 9088]) {
    if (!candidates.includes(fallbackPort)) {
      candidates.push(fallbackPort);
    }
  }

  return candidates;
}

function getSubnetSeed(savedUrl?: string): string | null {
  if (!savedUrl) {
    return null;
  }

  const parsed = parseUrl(savedUrl);
  const host = parsed?.hostname;
  if (!host) {
    return null;
  }

  const octets = host.split('.');
  if (octets.length !== 4) {
    return null;
  }

  const validIpv4 = octets.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
  if (!validIpv4) {
    return null;
  }

  return host;
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
      facilityId: String(data.facility_id ?? ''),
      organizationId: String(data.organization_id ?? ''),
      facilityName: String(data.facility_name ?? ''),
      hubId: String(data.hub_id ?? ''),
      version: String(data.version ?? 'unknown'),
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

  const portCandidates = getPortCandidates(savedUrl);
  const protocol = parseUrl(savedUrl || '')?.protocol || 'http:';

  // Method 2: Try common addresses
  const commonHosts = [
    'vitora-hub.local', // mDNS hostname
    '192.168.1.1',
    '192.168.0.1',
    '10.0.0.1',
  ];

  const commonAddresses: string[] = [];
  for (const port of portCandidates) {
    for (const host of commonHosts) {
      commonAddresses.push(`${protocol}//${host}:${port}`);
    }
  }

  for (const addr of commonAddresses) {
    const result = await probeHub(addr, 2000);
    if (result) return result;
  }

  // Method 3: If user entered an IPv4 host, scan its /24 subnet using the same port first.
  const subnetSeed = getSubnetSeed(savedUrl);
  if (subnetSeed) {
    for (const port of portCandidates) {
      const result = await scanSubnet(subnetSeed, port, 1500);
      if (result) {
        return result;
      }
    }
  }

  return null;
}
