import { Platform } from 'react-native';
import { addSslPinningErrorListener, initializeSslPinning, isSslPinningAvailable } from 'react-native-ssl-public-key-pinning';

import { getApprovedApiEnvironments } from '@/lib/config/api-config';

type CertificatePinningStatus = {
  available: boolean;
  configured: boolean;
  enabled: boolean;
  host: string | null;
};

let initialized = false;

function getConfiguredHosts(): string[] {
  const approvedHosts = getApprovedApiEnvironments()
    .map((environment) => {
      try {
        return new URL(environment.url).host;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value && value.length > 0));

  if (approvedHosts.length > 0) {
    return Array.from(new Set(approvedHosts));
  }

  const host = process.env.EXPO_PUBLIC_API_PIN_HOST?.trim();
  return host && host.length > 0 ? [host] : [];
}

function getConfiguredPins(): string[] {
  return [
    process.env.EXPO_PUBLIC_API_PIN_PRIMARY?.trim(),
    process.env.EXPO_PUBLIC_API_PIN_BACKUP?.trim(),
    process.env.EXPO_PUBLIC_API_PIN_TERTIARY?.trim(),
  ].filter(
    (value): value is string => Boolean(value && value.length > 0)
  );
}

export function getCertificatePinningStatus(): CertificatePinningStatus {
  const hosts = getConfiguredHosts();
  const configured = Boolean(hosts.length > 0 && getConfiguredPins().length >= 2);
  const available = Platform.OS !== 'web' && isSslPinningAvailable();
  const enabled = configured && available && !__DEV__;

  return {
    available,
    configured,
    enabled,
    host: hosts[0] ?? null,
  };
}

export async function initializeCertificatePinning(): Promise<void> {
  if (initialized) {
    return;
  }

  const hosts = getConfiguredHosts();
  const publicKeyHashes = getConfiguredPins();
  const includeSubdomains = process.env.EXPO_PUBLIC_API_PIN_INCLUDE_SUBDOMAINS === 'true';
  const expirationDate = process.env.EXPO_PUBLIC_API_PIN_EXPIRATION_DATE?.trim();

  if (__DEV__ || Platform.OS === 'web' || hosts.length === 0 || publicKeyHashes.length < 2) {
    initialized = true;
    return;
  }

  if (!isSslPinningAvailable()) {
    throw new Error('SSL pinning is configured but unavailable in this build. Create a native development or production build before enabling EXPO_PUBLIC_API_PIN_* variables.');
  }

  addSslPinningErrorListener((error) => {
    console.warn('SSL pinning error for host', error.serverHostname);
  });

  await initializeSslPinning(
    Object.fromEntries(
      hosts.map((host) => [
        host,
        {
          includeSubdomains,
          publicKeyHashes,
          expirationDate: expirationDate || undefined,
        },
      ])
    )
  );

  initialized = true;
}
