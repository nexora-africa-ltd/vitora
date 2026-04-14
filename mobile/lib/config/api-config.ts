import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_URL_KEY = 'vitora.mobile.api-url';
const API_ENVIRONMENT_KEY = 'vitora.mobile.api-environment';

export type ApiEnvironmentOption = {
  id: string;
  label: string;
  url: string;
};

function getBuildEnvironment(): 'development' | 'preview' | 'production' {
  const configuredValue = process.env.EXPO_PUBLIC_APP_ENV?.trim();
  if (configuredValue === 'development' || configuredValue === 'preview' || configuredValue === 'production') {
    return configuredValue;
  }

  return __DEV__ ? 'development' : 'production';
}

function parseApprovedApiEnvironments(): ApiEnvironmentOption[] {
  const rawValue = process.env.EXPO_PUBLIC_APPROVED_API_ENVIRONMENTS?.trim();
  if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue) as Array<Record<string, unknown>>;
      const options = parsed
        .map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id.trim() : '',
          label: typeof entry.label === 'string' ? entry.label.trim() : '',
          url: typeof entry.url === 'string' ? normalizeApiUrl(entry.url) : '',
        }))
        .filter((entry) => entry.id.length > 0 && entry.label.length > 0 && entry.url.length > 0);

      if (options.length > 0) {
        return options;
      }
    } catch {
      // Fall back to EXPO_PUBLIC_API_URL when the JSON cannot be parsed.
    }
  }

  if (process.env.EXPO_PUBLIC_API_URL) {
    return [
      {
        id: 'default',
        label: getBuildEnvironment() === 'production' ? 'Production' : 'Default',
        url: normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL),
      },
    ];
  }

  return [];
}

const approvedApiEnvironments = parseApprovedApiEnvironments();

let currentApiBaseUrl = defaultApiBaseUrl();
let currentApiEnvironmentId: string | null = defaultApiEnvironmentId();
let initialized = false;

function defaultApiBaseUrl(): string {
  if (approvedApiEnvironments[0]?.url) {
    return approvedApiEnvironments[0].url;
  }

  return Platform.OS === 'android' ? 'http://10.0.2.2:9088' : 'http://127.0.0.1:9088';
}

function defaultApiEnvironmentId(): string | null {
  return approvedApiEnvironments[0]?.id ?? null;
}

function getApprovedEnvironmentById(environmentId: string): ApiEnvironmentOption | null {
  return approvedApiEnvironments.find((entry) => entry.id === environmentId) ?? null;
}

function getApprovedEnvironmentByUrl(url: string): ApiEnvironmentOption | null {
  return approvedApiEnvironments.find((entry) => entry.url === url) ?? null;
}

function isApprovedApiUrl(url: string): boolean {
  return Boolean(getApprovedEnvironmentByUrl(url));
}

async function persistApiSelection(url: string, environmentId: string | null): Promise<void> {
  await AsyncStorage.multiSet([
    [API_URL_KEY, url],
    [API_ENVIRONMENT_KEY, environmentId ?? ''],
  ]);
}

export function normalizeApiUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

export function getApprovedApiEnvironments(): ApiEnvironmentOption[] {
  return approvedApiEnvironments;
}

export function supportsCustomApiUrl(): boolean {
  return getBuildEnvironment() !== 'production';
}

export async function initializeApiBaseUrl(): Promise<string> {
  const [[, storedValue], [, storedEnvironmentId]] = await AsyncStorage.multiGet([API_URL_KEY, API_ENVIRONMENT_KEY]);
  const normalizedStoredValue = storedValue ? normalizeApiUrl(storedValue) : '';
  const approvedEnvironment = storedEnvironmentId ? getApprovedEnvironmentById(storedEnvironmentId) : null;
  const approvedByUrl = normalizedStoredValue ? getApprovedEnvironmentByUrl(normalizedStoredValue) : null;

  if (approvedEnvironment) {
    currentApiBaseUrl = approvedEnvironment.url;
    currentApiEnvironmentId = approvedEnvironment.id;
  } else if (normalizedStoredValue && (supportsCustomApiUrl() || isApprovedApiUrl(normalizedStoredValue))) {
    currentApiBaseUrl = normalizedStoredValue;
    currentApiEnvironmentId = approvedByUrl?.id ?? null;
  } else {
    currentApiBaseUrl = defaultApiBaseUrl();
    currentApiEnvironmentId = defaultApiEnvironmentId();
  }

  initialized = true;
  return currentApiBaseUrl;
}

export async function getApiBaseUrl(): Promise<string> {
  if (!initialized) {
    return initializeApiBaseUrl();
  }

  return currentApiBaseUrl;
}

export function getApiBaseUrlSync(): string {
  return currentApiBaseUrl;
}

export function getSelectedApiEnvironmentIdSync(): string | null {
  return currentApiEnvironmentId;
}

export async function setApiBaseUrl(nextUrl: string): Promise<string> {
  const normalized = normalizeApiUrl(nextUrl);
  if (!supportsCustomApiUrl() && !isApprovedApiUrl(normalized)) {
    throw new Error('Production builds only allow approved backend environments.');
  }

  const approvedEnvironment = getApprovedEnvironmentByUrl(normalized);
  await persistApiSelection(normalized, approvedEnvironment?.id ?? null);
  currentApiBaseUrl = normalized;
  currentApiEnvironmentId = approvedEnvironment?.id ?? null;
  initialized = true;
  return normalized;
}

export async function setApiEnvironment(environmentId: string): Promise<string> {
  const environment = getApprovedEnvironmentById(environmentId);
  if (!environment) {
    throw new Error('Unknown backend environment selection.');
  }

  await persistApiSelection(environment.url, environment.id);
  currentApiBaseUrl = environment.url;
  currentApiEnvironmentId = environment.id;
  initialized = true;
  return environment.url;
}
